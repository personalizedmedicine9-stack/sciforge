import { getClient, INDEX } from '../_lib/elastic.js';
import { fetchPubMed } from '../_lib/connectors.js';
import { normalizePubMed } from '../_lib/normalize.js';
import { embedBatch } from '../_lib/embed.js';
import { logger, startTimer } from '../_lib/logger.js';

// Protected by CRON_SECRET header — Vercel cron sends this automatically.
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode
  return req.headers.authorization === `Bearer ${secret}`;
}

// Scientific domains to ingest across
const INGEST_QUERIES = [
  'curcumin anti-inflammatory pharmacology',
  'quercetin flavonoid bioavailability',
  'natural product antimicrobial activity',
  'phytochemistry medicinal plants',
  'herbal medicine systematic review',
  'ethnopharmacology traditional medicine',
  'nanoparticle drug delivery natural product',
  'plant extract anticancer activity',
  'essential oil pharmacological activity',
  'alkaloid pharmacology mechanism',
  'flavonoid antioxidant activity',
  'terpenoid anti-inflammatory',
  'pharmacognosy review 2023 2024',
  'Nigella sativa thymoquinone',
  'Hypericum perforatum St Johns Wort',
  'Silybum marianum silymarin hepatoprotective',
  'Ginkgo biloba neuroprotection',
  'Panax ginseng ginsenosides',
  'Withania somnifera adaptogen',
  'Artemisia annua artemisinin',
  'berberine diabetes metabolic',
  'resveratrol cardiovascular neuroprotection',
  'randomized controlled trial herbal medicine',
  'meta-analysis phytotherapy clinical',
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const elapsed = startTimer();
  logger.info('ingest_pubmed_start', {});

  try {
    const es = getClient();
    let totalUpserted = 0;
    let totalSkipped  = 0;

    for (const query of INGEST_QUERIES) {
      try {
        logger.info('ingest_pubmed_query', { query });
        const raw = await fetchPubMed(query, 50);

        const papers = raw.map(r => normalizePubMed(r));

        // Deduplicate within batch by id
        const seen    = new Set();
        const unique  = papers.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        // Embed title + abstract
        const texts      = unique.map(p => `${p.title} ${p.abstract}`.trim());
        const embeddings = await embedBatch(texts, 50);

        // Bulk upsert
        const ops = unique.flatMap((paper, i) => [
          { update: { _index: INDEX, _id: paper.id } },
          {
            doc: { ...paper, embedding: embeddings[i] },
            doc_as_upsert: true,
          },
        ]);

        if (ops.length) {
          const result = await es.bulk({ operations: ops, refresh: false });
          const upserted = result.items?.filter(i => !i.update?.error).length || 0;
          totalUpserted += upserted;
          totalSkipped  += result.items?.filter(i => i.update?.error).length || 0;
        }

        // Respect NCBI rate limits (3 req/s without API key, 10/s with)
        await new Promise(r => setTimeout(r, process.env.PUBMED_API_KEY ? 120 : 400));

      } catch (err) {
        logger.error('ingest_pubmed_query_error', { query, err: err.message });
      }
    }

    const summary = {
      source: 'pubmed',
      upserted: totalUpserted,
      skipped:  totalSkipped,
      latency_ms: elapsed(),
      ts: new Date().toISOString(),
    };

    logger.info('ingest_pubmed_done', summary);
    return res.status(200).json(summary);

  } catch (err) {
    logger.error('ingest_pubmed_fatal', { err: err.message });
    return res.status(500).json({ error: err.message });
  }
}
