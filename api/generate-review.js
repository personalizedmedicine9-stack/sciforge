// POST /api/generate-review
// Deterministic evidence-based review generator.
// Mode A (basic): templates + evidence counts
// Mode B (structured): Mode A + mechanism extraction + evidence density
// Mode C (ai): Mode B + AI polish (Gemini preferred, OpenAI fallback)
//
// Evidence pipeline shared with generate-chapter.js via evidence-processor.js.
// All logic is server-side. No API keys ever reach the frontend.

import {
  processEvidence,
  preprocessPapers,
} from './_lib/evidence-processor.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Section builders ──────────────────────────────────────────────────────

function buildOverview(query, counts, groups) {
  const parts = [];
  if (groups.clinical.length    > 0) parts.push(`${groups.clinical.length} clinical study${groups.clinical.length > 1 ? 'ies' : 'y'}`);
  const mechN = groups.mechanistic.length + groups.preclinical.length;
  if (mechN > 0)                     parts.push(`${mechN} preclinical/mechanistic study${mechN > 1 ? 'ies' : 'y'}`);
  if (groups.review.length      > 0) parts.push(`${groups.review.length} review${groups.review.length > 1 ? 's' : ''}`);

  const highQ = counts.rct > 0
    ? `${counts.rct} randomised controlled trial${counts.rct > 1 ? 's' : ''} represent${counts.rct === 1 ? 's' : ''} the highest level of clinical evidence.`
    : 'No randomised controlled trial data were identified in the current result set.';

  const openings = [
    `The current evidence base for ${query ? `"${query}"` : 'this query'} encompasses ${counts.total} studies (${parts.join(', ') || 'various study types'}).`,
    `A systematic examination of ${query ? `"${query}"` : 'the queried topic'} yields ${counts.total} studies (${parts.join(', ') || 'various study types'}), forming the basis of this synthesis.`,
    `Reviewing the available literature on ${query ? `"${query}"` : 'this subject'}, ${counts.total} studies (${parts.join(', ') || 'various study types'}) were identified and appraised.`,
    `The scholarly landscape surrounding ${query ? `"${query}"` : 'this query'} comprises ${counts.total} retrieved studies (${parts.join(', ') || 'various study types'}).`,
  ];
  const opening = openings[Math.floor(Math.random() * openings.length)];

  return `${opening} ${highQ} The body of evidence spans multiple experimental approaches, reflecting the translational spectrum of research in this domain.`;
}

function buildMechanisticSection(groups, mechanisms, papers) {
  const relevant = [...groups.mechanistic, ...groups.preclinical];
  if (relevant.length === 0) {
    return {
      text:             'No mechanistic or preclinical studies were identified in the retrieved evidence set.',
      citations:        [],
      evidence_summary: '0 studies',
    };
  }
  const pathwayStr = mechanisms.length > 0
    ? mechanisms.slice(0, 5).join(', ')
    : 'multiple intracellular signaling cascades';
  const evParts = [];
  if (groups.mechanistic.length > 0) evParts.push(`${groups.mechanistic.length} in vitro`);
  if (groups.preclinical.length > 0) evParts.push(`${groups.preclinical.length} animal`);
  const cites = relevant.slice(0, 5).map(p => papers.indexOf(p) + 1).filter(i => i > 0);

  const mechTransitions = [
    `Mechanistic investigations indicate modulation of`,
    `At the molecular level, the evidence implicates modulation of`,
    `Preclinical data reveal engagement of`,
    `Emerging mechanistic evidence points to modulation of`,
    `The mechanistic landscape is characterised by modulation of`,
  ];
  const mechTransition = mechTransitions[Math.floor(Math.random() * mechTransitions.length)];

  const mechCaveats = [
    'These findings derive primarily from in vitro and animal model systems, which provide mechanistic plausibility but require validation in human subjects.',
    'While these preclinical observations establish biological plausibility, extrapolation to clinical contexts demands careful consideration of model-to-human translational validity.',
    'Although such model systems afford mechanistic resolution, the extent to which these pathways operate comparably in vivo in humans warrants further investigation.',
    'These in vitro and animal model findings offer mechanistic insight; however, their relevance to human physiology must be corroborated through appropriately designed clinical studies.',
  ];
  const mechCaveat = mechCaveats[Math.floor(Math.random() * mechCaveats.length)];

  return {
    text:             `${mechTransition} ${pathwayStr}, particularly within inflammatory and cell-survival signaling cascades [${cites.join(', ')}]. ${mechCaveat}`,
    citations:        cites,
    evidence_summary: evParts.join(', ') || `${relevant.length} preclinical`,
  };
}

function buildClinicalSection(groups, papers) {
  const relevant = groups.clinical;
  if (relevant.length === 0) {
    return {
      text:             'Clinical evidence remains limited in the current result set, with most findings derived from preclinical or mechanistic models. Human clinical data are needed to establish efficacy and safety in patient populations.',
      citations:        [],
      evidence_summary: '0 clinical studies',
    };
  }
  const rctPapers    = relevant.filter(p => (p.study_type || '').toLowerCase().includes('rct'));
  const cohortPapers = relevant.filter(p => !rctPapers.includes(p));
  const evParts = [];
  if (rctPapers.length    > 0) evParts.push(`${rctPapers.length} RCT${rctPapers.length > 1 ? 's' : ''}`);
  if (cohortPapers.length > 0) evParts.push(`${cohortPapers.length} observational`);
  const cites = relevant.slice(0, 5).map(p => papers.indexOf(p) + 1).filter(i => i > 0);
  const text = rctPapers.length > 0
    ? (() => {
        const rctOpenings = [
          `Clinical trials suggest potential benefits, although variability in study design, sample size, and primary endpoints introduces uncertainty [${cites.join(', ')}].`,
          `Evidence from randomised clinical settings points toward measurable effects, yet significant heterogeneity in methodological frameworks, sample characteristics, and endpoint definitions precludes definitive conclusions [${cites.join(', ')}].`,
          `Analysis of the available trial data reveals indications of therapeutic potential; nonetheless, the diversity of experimental designs and outcome measures tempers the certainty of these findings [${cites.join(', ')}].`,
        ];
        const rctOpening = rctOpenings[Math.floor(Math.random() * rctOpenings.length)];
        const rctCaveats = [
          'Interpretation should account for heterogeneity across trial populations.',
          'Caution is warranted in generalising these findings given the methodological variability across included studies.',
          'Cross-study comparability remains limited by divergent inclusion criteria and endpoint assessments.',
        ];
        return `${rctOpening} ${rctCaveats[Math.floor(Math.random() * rctCaveats.length)]}`;
      })()
    : (() => {
        const obsOpenings = [
          `Observational clinical data indicate associations of interest; however, the absence of randomised controlled trials limits causal inference [${cites.join(', ')}].`,
          `The clinical evidence base consists exclusively of observational data, which, while suggestive of relevant associations, does not permit causal attribution [${cites.join(', ')}].`,
          `Non-randomised clinical observations provide preliminary evidence of association, yet the inherent susceptibility to confounding precludes robust causal inference [${cites.join(', ')}].`,
        ];
        const obsOpening = obsOpenings[Math.floor(Math.random() * obsOpenings.length)];
        const obsCaveats = [
          'Prospective designs are warranted to confirm these observations.',
          'Well-controlled prospective investigations are needed to substantiate these preliminary observations.',
          'Rigorous prospective study designs would be required to validate these findings.',
        ];
        return `${obsOpening} ${obsCaveats[Math.floor(Math.random() * obsCaveats.length)]}`;
      })();
  return { text, citations: cites, evidence_summary: evParts.join(', ') || `${relevant.length} clinical` };
}

function buildLimitations(counts, groups) {
  const items = [];
  const preclinPct = counts.total > 0
    ? (groups.preclinical.length + groups.mechanistic.length) / counts.total : 0;
  if (preclinPct > 0.6)
    items.push(`Over ${Math.round(preclinPct * 100)}% of the retrieved evidence derives from preclinical or mechanistic models. Translational relevance to human clinical outcomes cannot be assumed without corroborating clinical data.`);
  if (counts.rct === 0)
    items.push('No randomised controlled trial data were identified. Evidence hierarchy is limited to observational and exploratory study designs.');
  else if (counts.rct < 3)
    items.push(`The limited number of RCTs (n=${counts.rct}) constrains the strength of clinical validation. Larger, adequately powered trials are required.`);
  if (counts.total < 10)
    items.push('The overall volume of retrieved literature is modest. The conclusions drawn should be regarded as preliminary pending a more comprehensive systematic review.');
  if (groups.review.length > 0 && groups.review.length / counts.total > 0.3)
    items.push('A substantial proportion of included studies are review articles, which may introduce circular citation biases rather than novel empirical findings.');
  items.push('Publication bias, heterogeneity in study populations, dose regimens, and outcome measures further limit cross-study comparability.');
  return items.join(' ');
}

function buildConclusion(query, counts, mechanisms) {
  const mechStr = mechanisms.length > 0
    ? `The mechanistic evidence points to modulation of ${mechanisms.slice(0, 3).join(', ')} pathways.`
    : 'A plausible biological mechanism is supported by preclinical evidence.';
  const clinStr = counts.rct > 0
    ? (() => {
        const opts = [
          'Clinical data, while present, require replication in larger and more rigorous trials.',
          'Although clinical evidence is available, the existing trial data require independent replication under more stringent experimental conditions.',
          'The clinical evidence, while encouraging, remains preliminary and would benefit from confirmatory trials with enhanced methodological rigour.',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
      })()
    : (() => {
        const opts = [
          'Direct clinical evidence is currently insufficient to support definitive recommendations.',
          'In the absence of direct clinical trial evidence, definitive therapeutic recommendations cannot be advanced at this juncture.',
          'The current lack of clinical trial data precludes the formulation of evidence-based recommendations.',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
      })();

  const closings = [
    `Overall, the available evidence supports a biologically plausible effect for ${query ? `"${query}"` : 'the queried topic'}, grounded in ${counts.total} retrieved studies. ${mechStr} ${clinStr} Further well-designed clinical studies remain essential before translating these findings into clinical practice.`,
    `In summary, ${counts.total} studies substantiate a biologically plausible effect for ${query ? `"${query}"` : 'the queried topic'}. ${mechStr} ${clinStr} The translation of these findings into practice will require a more robust clinical evidence base.`,
    `Synthesising the available evidence from ${counts.total} studies, a biologically plausible effect for ${query ? `"${query}"` : 'the queried topic'} is supported. ${mechStr} ${clinStr} Continued clinical investigation is imperative to bridge the translational gap.`,
  ];
  return closings[Math.floor(Math.random() * closings.length)];
}

// ── Deterministic review (Modes A + B) ───────────────────────────────────
function generateDeterministicReview(query, evidence, mode) {
  const { papers, groups, counts, mechanisms, density, references } = evidence;
  return {
    mode,
    overview:             buildOverview(query, counts, groups),
    mechanistic_insights: [buildMechanisticSection(groups, mechanisms, papers)],
    clinical_evidence:    [buildClinicalSection(groups, papers)],
    limitations:          buildLimitations(counts, groups),
    conclusion:           buildConclusion(query, counts, mechanisms),
    evidence_summary:     counts,
    evidence_density:     density,
    mechanisms,
    references,
    papers_used:          papers.length,
    query,
  };
}

// ── Mode C: OpenAI polish (disabled unless OPENAI_API_KEY present) ────────
const REVIEW_POLISH_PROMPT = `You are an evidence-grounded academic enhancement engine within SciForge Engine. Your ONLY function is to improve the scholarly prose of scientific/academic review text that is already grounded in verified references.

ABSOLUTE RULES:
1. Do NOT change any citation numbering or remove citations.
2. Do NOT add new scientific claims, references, or unsupported statements.
3. Do NOT alter any numerical values, p-values, or statistical data.
4. Do NOT fabricate any DOI, PMID, or reference.
5. Do NOT remove any information from the source text.

You MAY ONLY improve prose clarity, academic tone, scholarly transitions, and readability.
Return the same JSON structure with improved text fields only.`;

async function polishWithAI(review, query) {
  // Try Gemini first
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            systemInstruction: { parts: [{ text: REVIEW_POLISH_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: `Improve prose clarity and academic tone of the text fields only: overview, mechanistic_insights[].text, clinical_evidence[].text, limitations, conclusion. Do NOT change citations, add claims, or remove information. Return the same JSON structure.\n\n${JSON.stringify(review, null, 2)}` }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
          }),
          signal: AbortSignal.timeout(40_000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (cleaned) {
          try {
            const polished = JSON.parse(cleaned);
            return { ...polished, mode: 'ai', papers_used: review.papers_used, query };
          } catch { /* parse error, fall through */ }
        }
      }
    } catch { /* Gemini unavailable */ }
  }
  // Fallback to OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return review;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:      'gpt-4o-mini',
        max_tokens: 3000,
        temperature: 0.2,
        messages:   [{ role: 'user', content: `${REVIEW_POLISH_PROMPT}\n\nImprove prose clarity and academic tone of the text fields only: overview, mechanistic_insights[].text, clinical_evidence[].text, limitations, conclusion. Do NOT change citations, add claims, or remove information. Return the same JSON structure.\n\n${JSON.stringify(review, null, 2)}` }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return review;
    const data    = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!cleaned) return review;
    let polished;
    try { polished = JSON.parse(cleaned); }
    catch { return review; }
    return { ...polished, mode: 'ai', papers_used: review.papers_used, query };
  } catch {
    return review;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();
  if (req.method !== 'POST')    return res.status(405).set(CORS).json({ error: 'POST only' });

  try {
    const { query, papers: rawPapers, mode: requestedMode } = req.body || {};
    if (!rawPapers?.length) return res.status(400).set(CORS).json({ error: 'papers[] is required' });

    const evidence = processEvidence(rawPapers);
    if (evidence.papers.length === 0) return res.status(400).set(CORS).json({ error: 'No valid papers after preprocessing' });

    const hasAI = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    const mode      = requestedMode === 'basic' ? 'basic'
      : requestedMode === 'ai' && hasAI ? 'ai'
      : 'structured';

    let review = generateDeterministicReview(query || '', evidence, mode === 'ai' ? 'structured' : mode);
    if (mode === 'ai') review = await polishWithAI(review, query || '');

    return res.status(200).set(CORS).json(review);
  } catch (err) {
    return res.status(500).set(CORS).json({ error: err.message || 'Internal error' });
  }
}
