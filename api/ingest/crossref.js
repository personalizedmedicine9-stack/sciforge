import { getClient, INDEX } from '../_lib/elastic.js';
import { fetchCrossRef } from '../_lib/connectors.js';
import { normalizeCrossRef } from '../_lib/normalize.js';
import { embedBatch } from '../_lib/embed.js';
import { logger, startTimer } from '../_lib/logger.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

const DOMAIN_KEYWORDS = [
  'pharmacol', 'pharmaceut', 'phytochem', 'pharmacognosy', 'natural product',
  'medicinal plant', 'herbal', 'drug', 'clinical', 'ethnopharmacol',
  'flavonoid', 'alkaloid', 'terpenoid', 'antioxidant', 'anti-inflammatory',
];

const INGEST_QUERIES = [
  'curcumin bioavailability pharmacokinetics',
  'quercetin anti-inflammatory oxidative stress',
  'natural products drug discovery',
  'phytomedicine clinical trial',
  'herbal extract nanoparticle formulation',
  'medicinal plant antimicrobial',
  'pharmacognosy secondary metabolites',
  'flavonoids antioxidant cancer',
  'alkaloids mechanism action',
  'systematic review phytotherapy',
  'ethnopharmacology Africa Asia',
  'plant-derived compounds neuroprotection',
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const elapsed = startTimer();
  logger.info('ingest_crossref_start', {});

  try {
    const es = getClient();
    let totalUpserted = 0;

    for (const query of INGEST_QUERIES) {
      try {
        logger.info('ingest_crossref_query', { query });
        const items = await fetchCrossRef(query, 100);

        // Domain filter — only scientific papers
        const filtered = items.filter(item => {
          const text = [
            item.title?.[0] || '',
            item['container-title']?.[0] || '',
          ].join(' ').toLowerCase();
          return DOMAIN_KEYWORDS.some(k => text.includes(k));
        });

        const papers = filtered.map(normalizeCrossRef);

        const seen   = new Set();
        const unique = papers.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        const texts      = unique.map(p => `${p.title} ${p.abstract}`.trim());
        const embeddings = await embedBatch(texts, 50);

        const ops = unique.flatMap((paper, i) => [
          { update: { _index: INDEX, _id: paper.id } },
          {
            doc: { ...paper, embedding: embeddings[i] },
            doc_as_upsert: true,
          },
        ]);

        if (ops.length) {
          const result = await es.bulk({ operations: ops, refresh: false });
          totalUpserted += result.items?.filter(i => !i.update?.error).length || 0;
        }

        // CrossRef polite pool: 50 req/s with mailto header
        await new Promise(r => setTimeout(r, 200));

      } catch (err) {
        logger.error('ingest_crossref_query_error', { query, err: err.message });
      }
    }

    const summary = { source: 'crossref', upserted: totalUpserted, latency_ms: elapsed(), ts: new Date().toISOString() };
    logger.info('ingest_crossref_done', summary);
    return res.status(200).json(summary);

  } catch (err) {
    logger.error('ingest_crossref_fatal', { err: err.message });
    return res.status(500).json({ error: err.message });
  }
}
