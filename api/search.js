import { getClient, INDEX } from './_lib/elastic.js';
import { embedText } from './_lib/embed.js';
import { normalizeQuery, decomposeQuery } from './_lib/query-intelligence.js';
import {
  reciprocalRankFusion, computeFinalScore, detectMatchType,
  passesRelevanceFilter, keywordOverlapScore, stableSort, enforceSeedDiversity,
  detectLocationTier, tieredSort, LOCATION_WEIGHT,
} from './_lib/rerank.js';
import { rateLimit, getCached, setCached } from './_lib/ratelimit.js';
import { logger, startTimer } from './_lib/logger.js';
import {
  fetchPubMed, fetchCrossRef, fetchOpenAlex, fetchSemanticScholar,
  fetchCrossRefBooks, fetchOpenAlexBooks, fetchPatents,
  resolveSemanticScholarId, fetchReferences, fetchCitations,
  fetchClinicalTrials, fetchGuidelines,
} from './_lib/connectors.js';
import {
  normalizePubMed, normalizeCrossRef, normalizeOpenAlex,
  normalizeSemanticScholar, normalizePatent, mergeRecords, normalizeClinicalTrial,
  dedupKey,
} from './_lib/normalize.js';
import { wrapReq, wrapRes } from './_lib/res-compat.js';
import { applyBiomedicalPipeline } from './_lib/biomedical-pipeline.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Expansion cache (§13, TTL 10 min) ────────────────────────────────────
const expansionCache = new Map();
function getExpansionCached(key) {
  const entry = expansionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { expansionCache.delete(key); return null; }
  return entry.data;
}
function setExpansionCached(key, data) {
  expansionCache.set(key, { data, expires: Date.now() + 10 * 60 * 1000 });
  if (expansionCache.size > 500) {
    const oldest = [...expansionCache.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
    if (oldest) expansionCache.delete(oldest[0]);
  }
}

export default async function handler(rawReq, rawRes) {
  const req = wrapReq(rawReq);
  const res = wrapRes(rawRes);
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();

  const elapsed = startTimer();
  const ip      = req.headers['x-forwarded-for']?.split(',')[0] || '0.0.0.0';

  const rl = rateLimit(ip, 30, 60_000);
  if (!rl.allowed) {
    return res.status(429).set(CORS).json({
      error: 'Rate limit exceeded.',
      retryAfter: Math.ceil((rl.reset - Date.now()) / 1000),
    });
  }

  const {
    q = '', domain, study_type, year_min, year_max, journal_quality,
    page = '1', per_page = '20',
  } = req.query || {};

  const query = q.trim();
  if (!query || query.length < 2)
    return res.status(400).set(CORS).json({ error: 'Query q required (min 2 chars)' });
  if (query.length > 500)
    return res.status(400).set(CORS).json({ error: 'Query too long (max 500)' });

  const pageNum = Math.max(1, parseInt(page)     || 1);
  const perPage = Math.min(50, Math.max(5, parseInt(per_page) || 20));
  const fromIdx = (pageNum - 1) * perPage;

  const cacheKey = `s3:${query}:${domain}:${study_type}:${year_min}:${year_max}:${journal_quality}:${pageNum}:${perPage}`;
  const cached   = getCached(cacheKey);
  if (cached) {
    logger.info('cache_hit', { query, latencyMs: elapsed() });
    return res.status(200).set(CORS).json(cached);
  }

  try {
    // ══════════════════════════════════════════════════════════════════
    // STEP 1 — Query expansion
    // ══════════════════════════════════════════════════════════════════
    const qi = normalizeQuery(query);
    logger.info('search_start', {
      original:         qi.original,
      normalized:       qi.normalized,
      intent:           qi.intent,
      conceptExtracted: qi.conceptExtracted || false,
      extractedQuery:   qi.extractedQuery   || null,
      ip,
    });

    // ══════════════════════════════════════════════════════════════════
    // STEP 2 — Query decomposition + multi-source retrieval
    //
    // If query has ≥2 mechanism clusters or is a sentence:
    //   → Decompose into independent subqueries (core, per-mechanism,
    //     entity-mechanism combos — max 5 total)
    //   → Run fetchLiveSources on each subquery in parallel
    //   → Merge all raw pools before the single downstream pipeline
    //
    // Single-query path: unchanged behaviour.
    // ══════════════════════════════════════════════════════════════════
    const filterArgs = { domain, study_type, year_min, year_max, journal_quality };

    const subqueries = decomposeQuery(qi);
    const isDecomposed = subqueries.length > 1;

    if (isDecomposed) {
      logger.info('query_decomposed', {
        original:   qi.original,
        subqueries: subqueries.map(s => ({
          label:      s._subqueryLabel,
          normalized: s.normalized.slice(0, 80),
        })),
      });
    }

    // Per-subquery fetch budget: divide 25s wall-clock across subqueries,
    // min 12s each. ES runs once on the primary qi only (ES index is shared).
    const subBudgetMs = isDecomposed
      ? Math.max(12_000, Math.floor(25_000 / subqueries.length))
      : 25_000;

    // maxPerSource per subquery: fewer results per sub → same total budget
    const subMaxPerSource = isDecomposed ? Math.ceil(30 / subqueries.length) + 10 : 30;

    const [esSeeds, ...subLiveResults] = await Promise.all([
      fetchFromElasticsearch(qi, filterArgs),
      ...subqueries.map(sub =>
        Promise.race([
          fetchLiveSources(sub, subMaxPerSource),
          new Promise(resolve => setTimeout(() => resolve([]), subBudgetMs)),
        ])
      ),
    ]);

    const liveRaw = subLiveResults.flat();
    const rawPool = deduplicatePapers([...esSeeds, ...liveRaw]);
    logger.info('PIPELINE_DEBUG raw_count', { count: rawPool.length });

    // ══════════════════════════════════════════════════════════════════
    // STEP 3 — Relevance filter — match title, abstract, mesh, keywords
    // §18: no hard abstract requirement
    // §3: passesRelevanceFilter threshold 0.06 / overlap 0.03
    // ══════════════════════════════════════════════════════════════════
    let filtered = rawPool.filter(p => broadlyRelevant(p, qi));
    logger.info('PIPELINE_DEBUG filtered_count', { count: filtered.length });

    // ══════════════════════════════════════════════════════════════════
    // STEP 4 — Minimum guarantee fallback (§4, §11)
    // ══════════════════════════════════════════════════════════════════
    if (filtered.length < 10) {
      logger.info('relaxed_search_triggered', { before: filtered.length });

      // Re-run live with original query (no synonym expansion) — 15s budget
      const relaxedRaw = await Promise.race([
        fetchLiveSources({ ...qi, normalized: qi.original }, 50),
        new Promise(resolve => setTimeout(() => resolve([]), 15_000)),
      ]);
      const relaxedPool = deduplicatePapers([...rawPool, ...relaxedRaw]);

      const relaxedFiltered = relaxedPool.filter(p => broadlyRelevant(p, qi));

      if (relaxedFiltered.length > filtered.length) filtered = relaxedFiltered;
      // Last resort: use full raw pool
      if (filtered.length < 10 && relaxedPool.length > 0) {
        filtered = relaxedPool;
      }
      logger.info('relaxed_search_result', { after: filtered.length });
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 5 — Seed selection (10–20, with diversity, §5, §21)
    // ══════════════════════════════════════════════════════════════════
    const prescored = filtered.map(p => {
      const tier = detectLocationTier(p, qi.keyTerms);
      const locationBonus = LOCATION_WEIGHT[tier] || 0;
      return {
        ...p,
        _tier: tier,
        _prescore: computeFinalScore({
          retrievalScore:  p._retrievalScore || keywordOverlapScore(p, qi.allTerms),
          studyType:       p.study_type,
          level:           p._level,
          citations:       p.citations,
          journalQuality:  p.journal_quality,
          year:            p.year,
          domain:          p.domain,
          contentType:     p.content_type,
          isReference:     p._is_reference || false,
          isCitation:      p._is_citation  || false,
          locationBonus,
        }),
      };
    });
    prescored.sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier;
      return (b._prescore || 0) - (a._prescore || 0);
    });

    const seedTarget = Math.min(20, Math.max(10, prescored.length));
    let seeds = prescored.slice(0, seedTarget);

    // Diversity: no study_type > 50% of seeds (§21)
    seeds = enforceSeedDiversity(seeds, prescored.slice(seedTarget, seedTarget + 30));
    logger.info('PIPELINE_DEBUG seeds_count', { count: seeds.length });

    // ══════════════════════════════════════════════════════════════════
    // STEP 6 — Semantic Scholar ID resolution + citation expansion
    // §8: resolve ID per seed; §19: rate control; §20: partial ok
    // Expansion applied to ALL seeds (soft cap 15, min 10) — §D
    // ══════════════════════════════════════════════════════════════════
    let expandedPapers = [];
    try {
      const expansionSeeds = seeds.slice(0, Math.max(10, Math.min(15, seeds.length)));
      // Hard 12s wall-clock budget — if expansion takes too long, proceed without it (§12)
      expandedPapers = await Promise.race([
        expandWithCitations(expansionSeeds, qi.allTerms, qi.keyTerms),
        new Promise(resolve => setTimeout(() => resolve([]), 12_000)),
      ]);
      logger.info('PIPELINE_DEBUG expanded_count', { count: expandedPapers.length });
    } catch (expErr) {
      // §14, §I: skip expansion on failure, never break pipeline
      logger.warn('expansion_failed_skipped', { err: expErr.message });
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 7 — Merge + deduplicate (seeds + expansion)
    // ══════════════════════════════════════════════════════════════════
    const combined = deduplicatePapers([...prescored, ...expandedPapers]);

    // ══════════════════════════════════════════════════════════════════
    // STEP 8 — Apply user filters
    // ══════════════════════════════════════════════════════════════════
    const userFiltered = applyUserFilters(combined, filterArgs);

    // ══════════════════════════════════════════════════════════════════
    // STEP 9 — Final re-ranking (§9, §23)
    // ══════════════════════════════════════════════════════════════════
    const reranked = userFiltered.map(p => {
      const tier          = p._tier ?? detectLocationTier(p, qi.keyTerms);
      const locationBonus = LOCATION_WEIGHT[tier] || 0;
      const matchType     = detectMatchType({ _source: p }, qi.keyTerms);
      const score         = computeFinalScore({
        retrievalScore:  p._retrievalScore || keywordOverlapScore(p, qi.allTerms),
        studyType:       p.study_type,
        level:           p._level,
        citations:       p.citations,
        journalQuality:  p.journal_quality,
        year:            p.year,
        domain:          p.domain,
        contentType:     p.content_type,
        isReference:     p._is_reference || false,
        isCitation:      p._is_citation  || false,
        locationBonus,
      });
      return { ...toOutput(p, score, matchType), _tier: tier };
    });

    if (reranked.length < 10) {
      logger.warn('LOW_RESULT_FIX_TRIGGERED', { reranked: reranked.length, prescored: prescored.length });
      const existingIds = new Set(reranked.map(p => p.id));
      const injected = prescored
        .filter(p => !existingIds.has(p.id))
        .slice(0, 30 - reranked.length)
        .map(p => {
          const tier = p._tier ?? detectLocationTier(p, qi.keyTerms);
          return { ...toOutput(p, p._prescore || 0, detectMatchType({ _source: p }, qi.keyTerms)), _tier: tier };
        });
      reranked.push(...injected);
    }

    // Tiered sort: Tier 1 (title/abstract) → Tier 2 (text/refs) → Tier 3 (books/patents/trials)
    const sorted = tieredSort(reranked);

    // ══════════════════════════════════════════════════════════════════
    // STEP 10 — Limit to 100 (§G)
    // ══════════════════════════════════════════════════════════════════
    let limited = sorted.slice(0, 100);

    // ══════════════════════════════════════════════════════════════════
    // STEP 11 — Minimum guarantee (§4, §11)
    // If < 10 after user filters, inject top prescored results
    // ══════════════════════════════════════════════════════════════════
    if (limited.length < 10 && prescored.length > 0) {
      logger.info('minimum_guarantee_inject', { current: limited.length });
      const existingIds = new Set(limited.map(p => p.id));
      const injected    = prescored
        .filter(p => !existingIds.has(p.id))
        .slice(0, 30 - limited.length)
        .map(p => {
          const tier = p._tier ?? detectLocationTier(p, qi.keyTerms);
          return { ...toOutput(p, p._prescore || 0, detectMatchType({ _source: p }, qi.keyTerms)), _tier: tier };
        });
      limited = tieredSort([...limited, ...injected]).slice(0, 30);
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 12 — Final deduplication safety pass (§24)
    // ══════════════════════════════════════════════════════════════════
    limited = finalDedup(limited);
    logger.info('PIPELINE_DEBUG final_count', { count: limited.length });

    // ══════════════════════════════════════════════════════════════════
    // STEP 12B — Biomedical pipeline (Steps 0–4)
    // Step 0: domain hard filter (reject non-biomedical)
    // Step 1: exact keyword match in title/abstract → highest priority
    // Step 2: secondary match → only used when Step 1 returns nothing
    // Step 3: keyword anchoring for neuroscience queries (≥2 anchor terms)
    // Step 4: relevance score threshold ≥ 8
    // ══════════════════════════════════════════════════════════════════
    const bp = applyBiomedicalPipeline(limited, qi.keyTerms, qi.allTerms);
    logger.info('PIPELINE_DEBUG biomedical', {
      step1:           bp.step1.length,
      step2:           bp.step2.length,
      hasExact:        bp.hasExactMatches,
      isNeuro:         bp.isNeuro,
      isBotanical:     bp.isBotanical,
      coherenceActive: bp.conceptGroups?.coherenceActive || false,
      forcedEntities:  bp.conceptGroups?.forcedEntities  || [],
      isGeneQuery:     bp.geneGroups?.isGeneQuery        || false,
      geneGroups:      bp.geneGroups?.activeGroups       || [],
      multiGroup:      bp.geneGroups?.multiGroup         || false,
      isEmpty:         bp.isEmpty,
    });

    // Step 1 present → output ONLY Step 1 (exact matches) — stage: EXACT
    // Step 1 empty   → output Step 2 (secondary matches)  — stage: SEMANTIC
    // Both empty     → return "no results" response
    // Stages are never mixed.
    let bioFiltered;
    let matchStage;
    if (bp.hasExactMatches) {
      bioFiltered = bp.step1; // exact matches only
      matchStage  = 'EXACT';
    } else if (!bp.isEmpty) {
      bioFiltered = bp.step2; // secondary only
      matchStage  = 'SEMANTIC';
      logger.info('stage_fallback', { query: qi.original, reason: 'NO EXACT MATCH — SWITCHING TO SEMANTIC' });
    } else {
      // No high-quality biomedical results survived all filters
      const emptyResponse = {
        query:      qi.original,
        intent:     qi.intent,
        total:      0,
        page:       pageNum,
        per_page:   perPage,
        results:    [],
        facets:     {},
        latency_ms: elapsed(),
        sources:    {},
        no_results_reason: 'NO HIGH-QUALITY BIOMEDICAL RESULTS FOUND',
      };
      setCached(cacheKey, emptyResponse, 10_000);
      logger.info('search_done_empty', { query, latencyMs: elapsed() });
      return res.status(200).set(CORS).json(emptyResponse);
    }

    // Re-apply tiered sort within the filtered set so ordering is preserved.
    // Tag each result with match_stage so consumers know which stage produced it.
    limited = tieredSort(bioFiltered.map(p => ({ ...p, match_stage: matchStage })));

    // ══════════════════════════════════════════════════════════════════
    // STEP 13 — Paginate + respond
    // ══════════════════════════════════════════════════════════════════
    const total    = limited.length;
    const pageData = limited.slice(fromIdx, fromIdx + perPage);
    const facets   = buildFacets(limited);

    const response = {
      query:        qi.original,
      cleaned_query: qi.geneClassification?.finalQuery || qi.extractedQuery || qi.normalized,
      intent:       qi.intent,
      match_stage:  matchStage,
      total,
      page:         pageNum,
      per_page:     perPage,
      results:      pageData,
      facets,
      latency_ms:   elapsed(),
      sources:      summarizeSources(limited),
      ...(isDecomposed && {
        decomposed:  true,
        subqueries:  subqueries.map(s => s._subqueryLabel),
      }),
      ...(qi.geneClassification?.isValid && {
        gene_groups: qi.geneClassification.activeGroups,
        gene_symbols: qi.geneClassification.allSymbols,
      }),
    };

    setCached(cacheKey, response, 10_000); // 10s TTL — short for debug visibility
    logger.info('search_done', { query, total, latencyMs: elapsed() });
    return res.status(200).set(CORS).json(response);

  } catch (err) {
    logger.error('search_error', { query, err: err.message, stack: err.stack });
    try {
      const fallback = await directPubMedFallback(query);
      return res.status(200).set(CORS).json(fallback);
    } catch (_) {}
    return res.status(500).set(CORS).json({ error: 'Search service temporarily unavailable.' });
  }
}

// ── Output shape (§16) ───────────────────────────────────────────────────
function toOutput(p, score, matchType) {
  return {
    id:              p.id,
    title:           p.title           || '',
    abstract:        p.abstract        || '',
    authors:         p.authors         || [],
    journal:         p.journal         || '',
    year:            p.year            || null,
    doi:             p.doi             || null,
    pmid:            p.pmid            || null,
    citations:       p.citations       || 0,
    study_type:      p.study_type      || 'Other',
    domain:          p.domain          || 'Pharmacology',
    journal_quality: p.journal_quality || 'Low',
    mesh_terms:      p.mesh_terms      || [],
    keywords:        p.keywords        || [],
    source:          p.pmid && !(p.source || []).includes('pubmed')
                       ? [...(p.source || []), 'pubmed']
                       : (p.source || []),
    link:            p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : (p.link || (p.doi ? `https://doi.org/${p.doi}` : null)),
    content_type:    p.content_type    || null,
    is_reference:    p._is_reference   || false,
    is_citation:     p._is_citation    || false,
    score,
    match_type:      matchType,
    _level:          p._level          || 'D',
  };
}

// ── Broad relevance check — title, abstract, mesh, keywords, journal ────────
// A paper passes if ANY query term appears ANYWHERE in its searchable text.
// This is intentionally permissive — final ranking handles precision.
function broadlyRelevant(p, qi) {
  if (!qi.keyTerms?.length) return true;

  const searchableText = [
    p.title       || '',
    p.abstract    || '',
    p.journal     || '',
    ...(p.mesh_terms || []),
    ...(p.keywords   || []),
  ].join(' ').toLowerCase();

  // Accept if any key term appears anywhere in any field
  if (qi.keyTerms.some(t => searchableText.includes(t.toLowerCase()))) return true;

  // Accept if keyword overlap is even slightly above zero
  if (keywordOverlapScore(p, qi.allTerms) > 0.02) return true;

  return false;
}

// ── Elasticsearch retrieval (§22: ES is optional signal if sparse) ────────
async function fetchFromElasticsearch(qi, filterArgs) {
  try {
    const es      = getClient();
    const filters = buildFilters(filterArgs);

    const [lexicalRes, embedding] = await Promise.all([
      es.search({
        index: INDEX,
        size:  100,
        query: buildLexicalQuery(qi.normalized, filters),
        _source: true,
      }).catch(() => null),
      embedText(qi.normalized).catch(() => new Array(384).fill(0)),
    ]);

    const lexicalHits  = lexicalRes?.hits?.hits || [];
    let   semanticHits = [];

    if (!embedding.every(v => v === 0)) {
      try {
        const knnRes = await es.search({
          index: INDEX,
          knn: {
            field: 'embedding', query_vector: embedding,
            k: 100, num_candidates: 500,
            filter: filters.length ? filters : undefined,
          },
          size: 100, _source: true,
        });
        semanticHits = knnRes.hits?.hits || [];
      } catch (_) {}
    }

    if (!lexicalHits.length && !semanticHits.length) return [];

    // §22: if index is sparse (< 10k), treat ES as signal only (weight 0.3)
    const totalHits = lexicalRes?.hits?.total?.value || lexicalHits.length;
    const esSparse  = totalHits < 10_000;

    const fused = reciprocalRankFusion(lexicalHits, semanticHits);
    const maxRRF = fused[0]?._rrfScore || 1;

    return fused.slice(0, 60).map(hit => ({
      ...(hit._source || {}),
      id: hit._id,
      _retrievalScore: esSparse
        ? ((hit._rrfScore || 0) / maxRRF) * 0.3   // downweight sparse ES
        : (hit._rrfScore || 0) / maxRRF,
    }));
  } catch (_) {
    return [];
  }
}

// ── Live multi-source fetch (§2: all 7 sources) ──────────────────────────
async function fetchLiveSources(qi, maxPerSource) {
  const papers = [];
  const q      = qi.original || qi.normalized;

  const [pm, cr, oa, ss, ct, gl, crBk, oaBk, pt] = await Promise.allSettled([
    fetchPubMed(qi.normalized,                   Math.min(maxPerSource, 30)),
    fetchCrossRef(qi.normalized,                 Math.min(maxPerSource, 30)),
    fetchOpenAlex(qi.normalized,                 Math.min(maxPerSource, 30)),
    fetchSemanticScholar(qi.normalized,          Math.min(maxPerSource, 50)),
    fetchClinicalTrials(q,                       15),
    fetchGuidelines(q,                           10),
    fetchCrossRefBooks(q,                        20),
    fetchOpenAlexBooks(q,                        20),
    fetchPatents(q,                              10),
  ]);

  // Articles
  for (const raw of (pm.value   || [])) { try { papers.push(normalizePubMed(raw)); } catch (_) {} }
  for (const raw of (cr.value   || [])) { try { papers.push(normalizeCrossRef(raw)); } catch (_) {} }
  for (const raw of (oa.value   || [])) { try { papers.push(normalizeOpenAlex(raw)); } catch (_) {} }
  for (const raw of (ss.value   || [])) { try { papers.push(normalizeSemanticScholar(raw)); } catch (_) {} }

  // Clinical trials
  for (const raw of (ct.value   || [])) { try { papers.push(normalizeClinicalTrial(raw)); } catch (_) {} }

  // Guidelines (come back as PubMed summaries with _content_type override)
  for (const raw of (gl.value   || [])) {
    try {
      const p = normalizePubMed({
        art: raw._pubmed_raw || raw, pmid: raw.pmid, doi: null,
        abstract: raw.abstract || '', authors: [], year: raw.year, meshTerms: [],
      });
      papers.push({ ...p, content_type: 'Guideline', _level: 'A' });
    } catch (_) {}
  }

  // Books (CrossRef + OpenAlex)
  for (const raw of (crBk.value || [])) {
    try {
      const p = normalizeCrossRef(raw);
      papers.push({ ...p, content_type: 'Book Chapter' });
    } catch (_) {}
  }
  for (const raw of (oaBk.value || [])) {
    try {
      const p = normalizeOpenAlex(raw);
      papers.push({ ...p, content_type: 'Book Chapter' });
    } catch (_) {}
  }

  // Patents
  for (const raw of (pt.value   || [])) { try { papers.push(normalizePatent(raw)); } catch (_) {} }

  logger.info('live_sources', {
    pubmed:       pm.value?.length   ?? 0,
    crossref:     cr.value?.length   ?? 0,
    openalex:     oa.value?.length   ?? 0,
    semanticscholar: ss.value?.length ?? 0,
    clinicaltrials:  ct.value?.length ?? 0,
    guidelines:   gl.value?.length   ?? 0,
    books_cr:     crBk.value?.length ?? 0,
    books_oa:     oaBk.value?.length ?? 0,
    patents:      pt.value?.length   ?? 0,
  });

  return papers;
}

// ── Citation expansion (§6, §8, §12, §19, §20) ───────────────────────────
// Runs up to 5 concurrent SS requests; exponential backoff; partial-ok
async function expandWithCitations(seeds, allTerms, keyTerms) {
  const MAX_EXPANDED = 100;
  const KEEP_PER_TYPE = 20;
  const CONCURRENCY = 5;

  const expanded = [];

  // ✅ normalize (correct version — single source of truth)
  const normalize = (arr, sourceType, sourcePaperId) => arr.map(p => {
    if (!p?.title) return null;

    try {
      const norm = normalizeSemanticScholar(p);

      norm._is_reference = sourceType === 'reference';
      norm._is_citation  = sourceType === 'citation';
      norm._source_paper = sourcePaperId;

      norm._overlapScore   = keywordOverlapScore(norm, allTerms);
      norm._retrievalScore = norm._overlapScore;

      return norm;

    } catch (_) {
      return null;
    }
  }).filter(Boolean);

  // ✅ batch processing (rate safe)
  for (let i = 0; i < seeds.length; i += CONCURRENCY) {
    const batch = seeds.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(batch.map(async (seed) => {
      let paperId = null;

      try {
        paperId = await resolveSemanticScholarId(seed.doi, seed.title, seed.year);
      } catch (_) {}

      if (!paperId) return [];

      // Per-seed 5s timeout so a slow SS response doesn't block the batch
      const withTimeout = (p) => Promise.race([p, new Promise(r => setTimeout(() => r([]), 5_000))]);
      const [refsRes, citesRes] = await Promise.allSettled([
        withTimeout(fetchReferences(paperId, 50)),
        withTimeout(fetchCitations(paperId, 50)),
      ]);

      const rawRefs  = refsRes.value  || [];
      const rawCites = citesRes.value || [];

      // ✅ correct normalization
      const normRefs  = normalize(rawRefs,  'reference', paperId);
      const normCites = normalize(rawCites, 'citation',  paperId);

      // ✅ relaxed relevance filter (FIXED)
      const filterFn = (p) =>
        passesRelevanceFilter(p, keyTerms, 0.08) ||
        keywordOverlapScore(p, allTerms) > 0.06;

      const filteredRefs  = normRefs.filter(filterFn);
      const filteredCites = normCites.filter(filterFn);

      // ✅ ranking inside expansion
      const rank = (arr) => arr
        .sort((a, b) => {
          const sa = (a.citations || 0) * 0.6 + (a._overlapScore || 0) * 0.4;
          const sb = (b.citations || 0) * 0.6 + (b._overlapScore || 0) * 0.4;
          return sb - sa;
        })
        .slice(0, KEEP_PER_TYPE);

      return [
        ...rank(filteredRefs),
        ...rank(filteredCites),
      ];
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') {
        expanded.push(...r.value);
      }
    }
  }

  // ✅ expansion cap (global)
  if (expanded.length > MAX_EXPANDED) {
    expanded.sort((a, b) => {
      const sa = (a.citations || 0) * 0.6 + (a._overlapScore || 0) * 0.4;
      const sb = (b.citations || 0) * 0.6 + (b._overlapScore || 0) * 0.4;
      return sb - sa;
    });
    expanded.length = MAX_EXPANDED;
  }

  return expanded;
}

// ── Deduplication (§7, §17) ──────────────────────────────────────────────
function deduplicatePapers(papers) {
  const byId    = new Map();
  const byTitle = new Map();

  for (const p of papers) {
    if (!p?.title) continue;

    if (byId.has(p.id)) {
      byId.set(p.id, mergeRecords(byId.get(p.id), p));
      continue;
    }

    const tk = dedupKey(p.title, p.year);
    if (byTitle.has(tk)) {
      const existId = byTitle.get(tk);
      byId.set(existId, mergeRecords(byId.get(existId), p));
      continue;
    }

    byId.set(p.id, p);
    byTitle.set(tk, p.id);
  }

  return [...byId.values()];
}

// ── Final dedup safety pass on output objects (§24) ──────────────────────
function finalDedup(papers) {
  const seen = new Set();
  return papers.filter(p => {
    const key = p.doi ? `doi:${p.doi}` : dedupKey(p.title, p.year);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── User filter application ───────────────────────────────────────────────
function applyUserFilters(papers, { domain, study_type, year_min, year_max, journal_quality }) {
  return papers.filter(p => {
    if (domain          && p.domain          !== domain)          return false;
    if (study_type      && p.study_type      !== study_type)      return false;
    if (journal_quality && p.journal_quality !== journal_quality) return false;
    if (year_min && p.year && p.year < parseInt(year_min))        return false;
    if (year_max && p.year && p.year > parseInt(year_max))        return false;
    return true;
  });
}

// ── ES helpers ────────────────────────────────────────────────────────────
function buildFilters({ domain, study_type, year_min, year_max, journal_quality }) {
  const f = [];
  if (domain)          f.push({ term: { domain } });
  if (study_type)      f.push({ term: { study_type } });
  if (journal_quality) f.push({ term: { journal_quality } });
  if (year_min || year_max) {
    f.push({ range: { year: {
      ...(year_min ? { gte: parseInt(year_min) } : {}),
      ...(year_max ? { lte: parseInt(year_max) } : {}),
    }}});
  }
  return f;
}

function buildLexicalQuery(normalized, filters) {
  return {
    bool: {
      must: {
        multi_match: {
          query: normalized,
          fields: ['title^3', 'abstract^2', 'mesh_terms^1.5', 'keywords^1.5', 'authors'],
          type: 'best_fields', fuzziness: 'AUTO', minimum_should_match: '50%',
        },
      },
      ...(filters.length ? { filter: filters } : {}),
    },
  };
}

// ── Facets ────────────────────────────────────────────────────────────────
function buildFacets(hits) {
  const domains = {}, types = {}, years = {}, quality = {};
  for (const h of hits) {
    domains[h.domain]          = (domains[h.domain]          || 0) + 1;
    types[h.study_type]        = (types[h.study_type]        || 0) + 1;
    quality[h.journal_quality] = (quality[h.journal_quality] || 0) + 1;
    if (h.year) {
      const dec = Math.floor(h.year / 10) * 10;
      years[dec] = (years[dec] || 0) + 1;
    }
  }
  const sorted = obj => Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
  return { domains: sorted(domains), study_types: sorted(types), years: sorted(years), journal_quality: sorted(quality) };
}

function summarizeSources(hits) {
  const c = {};
  for (const h of hits) for (const s of (h.source || [])) c[s] = (c[s] || 0) + 1;
  return c;
}

// ── Direct PubMed fallback (§14, §I) ─────────────────────────────────────
async function directPubMedFallback(query) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const sRes = await fetch(`${base}esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=20&retmode=json&sort=relevance`, { signal: AbortSignal.timeout(8000) });
  const sData = await sRes.json();
  const ids   = sData.esearchresult?.idlist || [];
  if (!ids.length) return { query, total: 0, results: [], facets: {}, fallback: true };

  const sumRes  = await fetch(`${base}esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`, { signal: AbortSignal.timeout(8000) });
  const sumData = await sumRes.json();

  const results = ids.map(id => {
    const art = sumData.result?.[id];
    if (!art) return null;
    return {
      id: `pubmed:${id}`, title: art.title || '', abstract: '', authors: [],
      journal: art.fulljournalname || art.source || '',
      year: art.pubdate ? parseInt(art.pubdate) : null,
      doi: null, pmid: id, citations: 0,
      study_type: 'Other', domain: 'Pharmacology', journal_quality: 'Low',
      source: ['pubmed'], link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      score: 50, match_type: 'partial', _level: 'D',
    };
  }).filter(Boolean);

  return { query, total: results.length, results, facets: {}, fallback: true, latency_ms: 0 };
}
