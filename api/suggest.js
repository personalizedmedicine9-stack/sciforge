import { getClient, INDEX } from './_lib/elastic.js';
import { rateLimit, getCached, setCached } from './_lib/ratelimit.js';
import { logger } from './_lib/logger.js';
import { wrapReq, wrapRes } from './_lib/res-compat.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(rawReq, rawRes) {
  const req = wrapReq(rawReq);
  const res = wrapRes(rawRes);
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || '0.0.0.0';
  const rl = rateLimit(ip, 60, 60_000);
  if (!rl.allowed) {
    return res.status(429).set(CORS).json({ suggestions: [] });
  }

  const q = (req.query?.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(200).set(CORS).json({ suggestions: [] });
  }

  const cacheKey = `suggest:${q.toLowerCase()}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.status(200).set(CORS).json(cached);

  try {
    const es  = getClient();

    // Prefix match on title (edge ngram would be ideal, but we use prefix query)
    // Also search in keywords and mesh_terms
    const result = await es.search({
      index: INDEX,
      size:  10,
      _source: ['title', 'domain', 'year'],
      query: {
        bool: {
          should: [
            {
              match_phrase_prefix: {
                title: { query: q, max_expansions: 20, boost: 2 },
              },
            },
            {
              multi_match: {
                query: q,
                fields: ['keywords^2', 'mesh_terms^1.5', 'title'],
                type: 'phrase_prefix',
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    });

    const hits = result.hits?.hits || [];
    const suggestions = hits.map(h => ({
      text:   h._source.title,
      domain: h._source.domain,
      year:   h._source.year,
    }));

    // Add curated suggestions for common botanical terms
    const curated = getCuratedSuggestions(q);

    const combined = [...curated, ...suggestions].slice(0, 10);
    const response = { suggestions: combined };

    setCached(cacheKey, response, 300_000); // 5 min
    return res.status(200).set(CORS).json(response);

  } catch (err) {
    logger.warn('suggest_error', { err: err.message });
    // Return empty gracefully
    return res.status(200).set(CORS).json({ suggestions: [] });
  }
}

// ── Curated suggestion seeds ───────────────────────────────────────────────
const CURATED = [
  'curcumin anti-inflammatory', 'curcumin bioavailability', 'curcumin cancer',
  'quercetin antioxidant', 'quercetin flavonoid bioavailability',
  'resveratrol cardiovascular', 'resveratrol neuroprotective',
  'artemisinin antimalarial', 'artemisinin drug resistance',
  'berberine diabetes', 'berberine anti-inflammatory',
  'silymarin hepatoprotective', 'silymarin liver disease',
  'thymoquinone Nigella sativa', 'thymoquinone anticancer',
  'ginkgo biloba cognitive', 'ginkgo biloba flavonoids',
  'ginsenosides Panax ginseng', 'ginsenosides neuroprotection',
  'epigallocatechin green tea', 'EGCG anticancer',
  'allicin garlic antimicrobial', 'Allium sativum cardiovascular',
  'hypericum perforatum depression', 'St Johns Wort antidepressant',
  'withaferin ashwagandha adaptogen', 'Withania somnifera stress',
  'piperine bioavailability enhancer', 'piperine pharmacokinetics',
  'naringenin flavanone antioxidant', 'hesperidin citrus anti-inflammatory',
  'andrographolide Andrographis anti-inflammatory',
  'baicalin Scutellaria antiviral',
  'essential oil antimicrobial activity',
  'nanoparticle drug delivery natural product',
  'systematic review herbal medicine clinical trial',
  'meta-analysis phytotherapy',
  'pharmacokinetics herbal extract',
  'ethnopharmacology medicinal plants Africa',
  'traditional Chinese medicine pharmacology',
  'Ayurvedic herb clinical study',
];

function getCuratedSuggestions(q) {
  const ql = q.toLowerCase();
  return CURATED
    .filter(s => s.toLowerCase().startsWith(ql) || s.toLowerCase().includes(ql))
    .slice(0, 5)
    .map(text => ({ text, domain: null, year: null, curated: true }));
}
