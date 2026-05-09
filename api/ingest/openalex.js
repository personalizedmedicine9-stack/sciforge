import { getClient, INDEX } from '../_lib/elastic.js';
import { fetchOpenAlex } from '../_lib/connectors.js';
import { normalizeOpenAlex } from '../_lib/normalize.js';
import { embedBatch } from '../_lib/embed.js';
import { logger, startTimer } from '../_lib/logger.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

const INGEST_QUERIES = [
  'curcumin pharmacology',
  'natural product drug discovery',
  'phytochemistry bioactivity',
  'herbal medicine efficacy',
  'medicinal plant secondary metabolites',
  'flavonoids anti-inflammatory mechanism',
  'terpenoids cancer pharmacology',
  'ethnobotany pharmacological activity',
  'plant extract nanoformulation',
  'quercetin resveratrol bioavailability',
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const elapsed = startTimer();
  logger.info('ingest_openalex_start', {});

  try {
    const es = getClient();
    let totalUpserted = 0;

    for (const query of INGEST_QUERIES) {
      try {
        logger.info('ingest_openalex_query', { query });
        const works = await fetchOpenAlex(query, 100);

        const papers = works
          .filter(w => w.title && w.title.trim().length > 10)
          .map(normalizeOpenAlex);

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

        // OpenAlex polite pool: 10 req/s
        await new Promise(r => setTimeout(r, 120));

      } catch (err) {
        logger.error('ingest_openalex_query_error', { query, err: err.message });
      }
    }

    const summary = { source: 'openalex', upserted: totalUpserted, latency_ms: elapsed(), ts: new Date().toISOString() };
    logger.info('ingest_openalex_done', summary);
    return res.status(200).json(summary);

  } catch (err) {
    logger.error('ingest_openalex_fatal', { err: err.message });
    return res.status(500).json({ error: err.message });
  }
}
