import { EVIDENCE_SCORE, QUALITY_SCORE } from './classify.js';
import { DOMAIN_BOOST } from './query-intelligence.js';

const CURRENT_YEAR = new Date().getFullYear();

// ── Type weights (§9) ─────────────────────────────────────────────────────
const TYPE_BONUS = {
  'Guideline':         30,
  'Clinical Trial':    25,
  'Meta-analysis':     20,
  'Systematic Review': 20,
  'RCT':               20,
  'Article':           15,
  'Book Chapter':      10,
  'Patent':             5,
  'Other':             10,
};

// ── Citation expansion bonus (§9) ─────────────────────────────────────────
const EXPANSION_BONUS = {
  reference: 15,
  citation:  10,
};

function recencyScore(year) {
  if (!year || year <= 0) return 0;
  const age = CURRENT_YEAR - year;
  if (age <= 1)  return 1.0;
  if (age <= 3)  return 0.8;
  if (age <= 5)  return 0.6;
  if (age <= 10) return 0.35;
  if (age <= 20) return 0.15;
  return 0.05;
}

function citationScore(count) {
  if (!count || count <= 0) return 0;
  return Math.min(1.0, Math.log1p(count) / Math.log1p(1000));
}

// ── Final score (0–100) + location weight + type bonus + expansion bonus ──
export function computeFinalScore({
  retrievalScore,
  studyType,
  level,
  citations,
  journalQuality,
  year,
  domain,
  contentType,
  isReference   = false,
  isCitation    = false,
  locationBonus = 0,   // +40 for title/abstract, +20 for text/refs, +0 for extended
}) {
  const relevance = Math.min(1.0, Math.max(0, retrievalScore || 0));
  const evidence  = EVIDENCE_SCORE[level]          || 0.1;
  const quality   = QUALITY_SCORE[journalQuality]  || 0.1;
  const recency   = recencyScore(year);
  const cite      = citationScore(citations);
  const domBoost  = DOMAIN_BOOST[domain]           || 1.0;

  const baseRaw =
    relevance * 0.40 +
    evidence  * 0.20 +
    cite      * 0.15 +
    quality   * 0.10 +
    recency   * 0.10 +
    (domBoost - 1.0) * 0.05;

  let score = Math.round(Math.min(95, Math.max(0, baseRaw * 100)));

  // Location weight — keyword in title/abstract outranks everything else
  score += locationBonus;

  // Type bonus (§9)
  const effectiveType = contentType || studyType || 'Other';
  score += TYPE_BONUS[effectiveType] || TYPE_BONUS['Other'];

  // Expansion bonus (§9)
  if (isReference) score += EXPANSION_BONUS.reference;
  if (isCitation)  score += EXPANSION_BONUS.citation;

  return Math.min(200, score); // allow > 100 so tiers don't compress
}

// ── Reciprocal Rank Fusion ────────────────────────────────────────────────
export function reciprocalRankFusion(lexicalHits, semanticHits, k = 60) {
  const scores = new Map();

  function addList(hits, weight) {
    hits.forEach((hit, rank) => {
      const id = hit._id || hit.id;
      const existing = scores.get(id) || { score: 0, hit };
      existing.score += weight * (1 / (k + rank + 1));
      existing.hit = hit;
      scores.set(id, existing);
    });
  }

  addList(lexicalHits,  0.5);
  addList(semanticHits, 0.3);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ hit, score }) => ({ ...hit, _rrfScore: score }));
}

// ── Match type detection (§10) ────────────────────────────────────────────
export function detectMatchType(hit, queryKeywords) {
  if (!queryKeywords?.length) return 'semantic';
  const src      = hit._source || hit;
  const title    = (src.title    || '').toLowerCase();
  const abstract = (src.abstract || '').toLowerCase();

  const titleMatches = queryKeywords.filter(w => title.includes(w)).length;
  if (titleMatches >= Math.ceil(queryKeywords.length * 0.5)) return 'exact';
  if (queryKeywords.some(w => abstract.includes(w)))          return 'partial';
  return 'semantic';
}

// ── Location tier detection ───────────────────────────────────────────────
// Tier 1 (primary)  : keyword in title OR abstract
// Tier 2 (secondary): keyword in mesh_terms, keywords, is_reference, is_citation
// Tier 3 (extended) : Books, Patents, Clinical Trials, Guidelines
// Returns 1, 2, or 3
export function detectLocationTier(paper, queryKeywords) {
  if (!queryKeywords?.length) return 2;

  const kws = queryKeywords.map(w => w.toLowerCase());

  // Tier 3 — non-article content types regardless of keyword location
  const ct = (paper.content_type || '').toLowerCase();
  const isExtended = ct === 'book chapter' || ct === 'patent' ||
                     ct === 'clinical trial' || ct === 'guideline';

  const title    = (paper.title    || '').toLowerCase();
  const abstract = (paper.abstract || '').toLowerCase();
  const inTitleOrAbstract = kws.some(w => title.includes(w) || abstract.includes(w));

  if (isExtended) {
    // Extended sources still get Tier 1 if strongly matched in title/abstract
    return inTitleOrAbstract ? 1 : 3;
  }

  if (inTitleOrAbstract) return 1;

  // Tier 2 — keyword in mesh_terms, keywords fields, or from expansion
  const secondaryText = [
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();

  if (
    kws.some(w => secondaryText.includes(w)) ||
    paper._is_reference ||
    paper._is_citation
  ) return 2;

  return 2; // default to secondary rather than dropping
}

// ── Location weight per tier ──────────────────────────────────────────────
export const LOCATION_WEIGHT = { 1: 40, 2: 20, 3: 0 };

// ── Tiered deterministic sort ─────────────────────────────────────────────
// Guarantees: Tier 1 always before Tier 2, Tier 2 always before Tier 3.
// Within each tier: score desc → citations desc → year desc → title asc
export function tieredSort(papers) {
  return [...papers].sort((a, b) => {
    const ta = a._tier || 2;
    const tb = b._tier || 2;
    if (ta !== tb) return ta - tb;                          // lower tier # = higher priority
    if (b.score       !== a.score)       return b.score       - a.score;
    if (b.citations   !== a.citations)   return b.citations   - a.citations;
    if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
    return (a.title || '').localeCompare(b.title || '');
  });
}

// ── Keyword overlap score (0–1) ───────────────────────────────────────────
export function keywordOverlapScore(paper, allTerms) {
  if (!allTerms?.length) return 0;
  const text = [
    paper.title    || '',
    paper.abstract || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();

  const matched = allTerms.filter(t => text.includes(t.toLowerCase())).length;
  return matched / allTerms.length;
}

// ── Soft relevance filter (§3, §6) ───────────────────────────────────────
// Pass if: any key term in title  OR  keyword overlap ≥ threshold
// §18: no hard dependency on abstract — abstract-less papers may still pass
export function passesRelevanceFilter(paper, keyTerms, threshold = 0.08) {
  if (!keyTerms?.length) return true;
  const title = (paper.title || '').toLowerCase();
  if (keyTerms.some(t => title.includes(t.toLowerCase()))) return true;
  return keywordOverlapScore(paper, keyTerms) >= threshold;
}

// ── Stable deterministic sort (§23) ──────────────────────────────────────
// 1) score desc  2) citations desc  3) year desc  4) title asc
export function stableSort(papers) {
  return [...papers].sort((a, b) => {
    if (b.score       !== a.score)       return b.score       - a.score;
    if (b.citations   !== a.citations)   return b.citations   - a.citations;
    if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
    return (a.title || '').localeCompare(b.title || '');
  });
}

// ── Seed diversity (§21): max 50% from same study_type ───────────────────
export function enforceSeedDiversity(seeds, candidates) {
  if (!seeds.length) return seeds;
  const MAX_RATIO = 0.5;
  const maxAllowed = Math.ceil(seeds.length * MAX_RATIO);

  const typeCounts = {};
  const result     = [];
  const overflow   = [];

  for (const s of seeds) {
    const t = s.study_type || 'Other';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (typeCounts[t] <= maxAllowed) {
      result.push(s);
    } else {
      overflow.push(s);
    }
  }

  // Fill vacated slots with next-best candidates not already in result
  const resultIds = new Set(result.map(p => p.id));
  const pool = (candidates || []).filter(p => !resultIds.has(p.id) && !overflow.some(o => o.id === p.id));

  for (const candidate of pool) {
    if (result.length >= seeds.length) break;
    result.push(candidate);
  }

  // Re-sort by prescore so order is still meaningful
  return result.sort((a, b) => (b._prescore || 0) - (a._prescore || 0));
}
