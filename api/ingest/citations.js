import { getClient, INDEX } from '../_lib/elastic.js';
import { fetchCitationCounts } from '../_lib/connectors.js';
import { logger, startTimer } from '../_lib/logger.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const elapsed = startTimer();
  logger.info('ingest_citations_start', {});

  try {
    const es = getClient();

    // Scroll through all papers that have a DOI and may have stale citation counts
    const doiList = [];
    const idMap   = {}; // doi → es _id

    let searchAfter = undefined;
    while (true) {
      const result = await es.search({
        index: INDEX,
        size:  1000,
        _source: ['doi'],
        query: { exists: { field: 'doi' } },
        sort: [{ _id: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
      });

      const hits = result.hits?.hits || [];
      if (!hits.length) break;

      for (const hit of hits) {
        if (hit._source?.doi) {
          doiList.push(hit._source.doi);
          idMap[hit._source.doi] = hit._id;
        }
      }

      searchAfter = hits[hits.length - 1].sort;
      if (hits.length < 1000) break;
    }

    logger.info('citations_doi_count', { count: doiList.length });
    if (!doiList.length) {
      return res.status(200).json({ source: 'citations', updated: 0, message: 'No DOIs found' });
    }

    // Fetch citation counts from Semantic Scholar in batches
    const citationMap = await fetchCitationCounts(doiList);

    // Build bulk update
    let updated = 0;
    const batchSize = 200;
    const dois      = Object.keys(citationMap);

    for (let i = 0; i < dois.length; i += batchSize) {
      const batch = dois.slice(i, i + batchSize);
      const ops   = batch.flatMap(doi => {
        const esId = idMap[doi];
        if (!esId) return [];
        return [
          { update: { _index: INDEX, _id: esId } },
          { doc: { citations: citationMap[doi] } },
        ];
      });

      if (ops.length) {
        const result = await es.bulk({ operations: ops, refresh: false });
        updated += result.items?.filter(i => !i.update?.error).length || 0;
      }
    }

    const summary = {
      source: 'citations',
      dois_processed: doiList.length,
      citations_updated: updated,
      latency_ms: elapsed(),
      ts: new Date().toISOString(),
    };

    logger.info('ingest_citations_done', summary);
    return res.status(200).json(summary);

  } catch (err) {
    logger.error('ingest_citations_fatal', { err: err.message });
    return res.status(500).json({ error: err.message });
  }
}
