// POST /api/rewrite-selection
// SciForge Engine — Controlled Academic Enhancement Engine
// Uses Google Gemini 2.0 Flash if GEMINI_API_KEY is set; falls back to OpenAI
// if OPENAI_API_KEY is set; otherwise applies a rule-based academic tone
// transformation so something always works.
//
// Safety constraints enforced at all times:
//  - Do NOT introduce unsupported scientific claims
//  - Do NOT invent references or fabricate citations
//  - Do NOT generate fake DOI or PMID values
//  - Preserve all citation numbering exactly
//  - Preserve all numerical/statistical values exactly
//  - Preserve scientific meaning exactly

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Master System Prompt — Source-Locked Evidence Preservation ──────────────
const MASTER_SAFETY_PROMPT = `You are an evidence-grounded academic enhancement engine within SciForge Engine. Your ONLY function is to improve the scholarly quality of scientific/academic text that is already grounded in verified, DOI/PMID-linked references.

ABSOLUTE RULES — VIOLATION IS FORBIDDEN:
1. Do NOT introduce any scientific claim not present in the source text.
2. Do NOT invent, fabricate, or hallucinate any reference, citation, DOI, or PMID.
3. Do NOT add new biological pathways, therapeutic claims, or mechanisms.
4. Do NOT change any citation numbering — preserve [1], [2], etc. exactly.
5. Do NOT alter any numerical values, statistical data, p-values, or dosages.
6. Do NOT remove any factual claim or evidence statement.
7. Do NOT introduce external unsupported scientific knowledge.

You MAY ONLY:
- Improve sentence sophistication and scholarly rhythm
- Improve paragraph continuity and transitions
- Improve readability and conceptual clarity
- Restructure for better logical flow
- Enhance academic tone and register
- Add scholarly transitional phrases
- Improve narrative coherence
- Clarify existing explanations using wording from the source text

You are NOT a free scientific content generator. You are NOT an autonomous content creator. You are a source-locked academic enhancement tool that preserves evidence fidelity absolutely.`;

// ── 10 Enhancement Mode Prompts ────────────────────────────────────────────
const MODE_PROMPTS = {
  publication_ready: `${MASTER_SAFETY_PROMPT}

MODE: Publication Ready
Transform the text into publication-grade academic prose suitable for a peer-reviewed scientific journal.
- Elevate sentence sophistication and coherence
- Improve scholarly rhythm and register
- Remove repetitive phrasing and informal constructions
- Ensure each paragraph flows logically to the next
- Preserve all factual content, citations, and numerical values exactly`,

  narrative_review: `${MASTER_SAFETY_PROMPT}

MODE: Narrative Review
Optimize the text for biomedical review writing.
- Improve review-style synthesis and transitions
- Enhance scholarly flow between evidence domains
- Improve conceptual continuity across paragraphs
- Strengthen integrative narrative connections
- Preserve all factual content, citations, and numerical values exactly`,

  book_chapter: `${MASTER_SAFETY_PROMPT}

MODE: Book Chapter
Optimize the text for academic textbook writing.
- Improve educational narration and explanatory richness
- Increase readability for graduate-level readers
- Improve paragraph continuity and pedagogical flow
- Enhance transitions between conceptual sections
- Add clarifying scholarly phrasing where the original text implies but does not explicitly state connections
- Preserve all factual content, citations, and numerical values exactly`,

  formal_academic: `${MASTER_SAFETY_PROMPT}

MODE: Formal Academic
Enhance the text with a traditional peer-reviewed scientific tone.
- Adopt rigorous formal scientific register
- Improve precision of academic expression
- Eliminate colloquialisms and informal constructions
- Ensure methodological language accuracy
- Preserve all factual content, citations, and numerical values exactly`,

  explanatory_expansion: `${MASTER_SAFETY_PROMPT}

MODE: Explanatory Expansion
Controlled expansion WITHOUT adding unsupported evidence.
- Add scholarly transitions and explanatory narration
- Clarify concepts explicitly mentioned or strongly implied in the source
- Restructure for improved readability and comprehension
- Enhance educational wording using only information from the source
- Do NOT introduce new pathways, mechanisms, or claims
- Preserve all factual content, citations, and numerical values exactly`,

  critical_review: `${MASTER_SAFETY_PROMPT}

MODE: Critical Review
Analytical scholarly refinement while preserving evidence integrity.
- Strengthen critical analytical perspective
- Highlight methodological limitations and evidence quality
- Improve balanced scholarly assessment language
- Enhance analytical transitions between evidence domains
- Preserve all factual content, citations, and numerical values exactly`,

  concise: `${MASTER_SAFETY_PROMPT}

MODE: Concise
Compress the text while preserving all scientific meaning.
- Remove redundancy and wordiness
- Eliminate passive voice where active is clearer
- Condense without losing any factual claims or citations
- Maintain all statistical values and evidence statements
- Preserve all factual content, citations, and numerical values exactly`,

  simplified_scientific: `${MASTER_SAFETY_PROMPT}

MODE: Simplified Scientific
Improve accessibility for graduate-level readers while maintaining scientific precision.
- Reduce unnecessary jargon while preserving technical accuracy
- Improve clarity of complex concepts
- Make dense academic prose more approachable
- Maintain all scientific precision and evidence grounding
- Preserve all factual content, citations, and numerical values exactly`,

  scientific_academic: `${MASTER_SAFETY_PROMPT}

MODE: Scientific Academic
Enhance the text with rigorous scientific register suitable for peer-reviewed journals across all scientific disciplines.
- Adopt precise scientific terminology appropriate to the discipline
- Improve methodological and analytical expression
- Strengthen logical coherence and argumentative structure
- Ensure consistency with conventions of formal scientific writing
- Preserve all factual content, citations, and numerical values exactly`,

  graduate_student: `${MASTER_SAFETY_PROMPT}

MODE: Graduate Student
Improve clarity and structure for graduate-level academic writing. Enhance educational value while maintaining scientific precision. Improve explanatory flow and conceptual connections.
- Clarify complex concepts with well-structured explanations
- Improve transitions between ideas and sections
- Enhance educational readability without oversimplification
- Strengthen conceptual connections and logical progression
- Preserve all factual content, citations, and numerical values exactly`,
};

// ── Dynamic Token Allocation ────────────────────────────────────────────────
function computeMaxTokens(text, tone) {
  const words = text.split(/\s+/).length;
  if (tone === 'book_chapter')    return Math.min(words * 4, 4000);
  if (tone === 'narrative_review') return Math.min(words * 3, 3000);
  if (tone === 'explanatory_expansion') return Math.min(words * 2.5, 2200);
  if (tone === 'scientific_academic') return 1200;
  if (tone === 'graduate_student') return Math.min(words * 2.5, 2200);
  return 1200;
}

// ── Rule-based fallback ───────────────────────────────────────────────────
function ruleBasedRewrite(text, tone) {
  let out = text
    .replace(/\bdon't\b/gi,    'do not')
    .replace(/\bcan't\b/gi,    'cannot')
    .replace(/\bwon't\b/gi,    'will not')
    .replace(/\bisn't\b/gi,    'is not')
    .replace(/\baren't\b/gi,   'are not')
    .replace(/\bwasn't\b/gi,   'was not')
    .replace(/\bweren't\b/gi,  'were not')
    .replace(/\bhasn't\b/gi,   'has not')
    .replace(/\bhaven't\b/gi,  'have not')
    .replace(/\bhadn't\b/gi,   'had not')
    .replace(/\bshould've\b/gi,'should have')
    .replace(/\bcould've\b/gi, 'could have')
    .replace(/\bwould've\b/gi, 'would have')
    .replace(/\bit's\b/gi,     'it is')
    .replace(/\bthat's\b/gi,   'that is')
    .replace(/\bthere's\b/gi,  'there is')
    .replace(/\bthey're\b/gi,  'they are')
    .replace(/\bwe're\b/gi,    'we are')
    .replace(/\byou're\b/gi,   'you are');

  if (tone === 'formal_academic' || tone === 'publication_ready' || tone === 'explanatory_expansion' || tone === 'book_chapter' || tone === 'narrative_review' || tone === 'scientific_academic' || tone === 'graduate_student') {
    out = out
      .replace(/\bshows that\b/gi,     'demonstrates that')
      .replace(/\bfound that\b/gi,     'reported that')
      .replace(/\buse of\b/gi,         'utilisation of')
      .replace(/\bused\b/gi,           'employed')
      .replace(/\bhelps to\b/gi,       'facilitates')
      .replace(/\bgood results\b/gi,   'favourable outcomes')
      .replace(/\bbig\b/gi,            'substantial')
      .replace(/\bsmall\b/gi,          'modest')
      .replace(/\blot of\b/gi,         'considerable')
      .replace(/\blooks like\b/gi,     'appears to be')
      .replace(/\bget\b/gi,            'obtain')
      .replace(/\bgot\b/gi,            'obtained');
  }

  if (tone === 'concise') {
    out = out
      .replace(/\bin order to\b/gi,          'to')
      .replace(/\bdue to the fact that\b/gi, 'because')
      .replace(/\bat this point in time\b/gi,'currently')
      .replace(/\bit is important to note that\b/gi, '')
      .replace(/\bit should be noted that\b/gi, '')
      .replace(/\bbasically\b/gi,            '')
      .replace(/\bactually\b/gi,             '')
      .replace(/\bvery\b/gi,                 '')
      .replace(/\breally\b/gi,               '');
    out = out.replace(/\s{2,}/g, ' ').trim();
  }

  return out;
}

// ── Gemini 2.0 Flash rewrite ──────────────────────────────────────────────
async function rewriteWithGemini(text, tone) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = MODE_PROMPTS[tone] || MODE_PROMPTS.formal_academic;
  const maxTokens = computeMaxTokens(text, tone);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// ── OpenAI fallback rewrite ────────────────────────────────────────────────
async function rewriteWithOpenAI(text, tone) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = MODE_PROMPTS[tone] || MODE_PROMPTS.formal_academic;
  const maxTokens = computeMaxTokens(text, tone);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({
      model:       'gpt-4o-mini',
      max_tokens:  maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();
  if (req.method !== 'POST')    return res.status(405).set(CORS).json({ error: 'POST only' });

  try {
    const { text, tone = 'formal_academic' } = req.body || {};
    if (!text?.trim()) return res.status(400).set(CORS).json({ error: 'text is required' });

    const validModes = Object.keys(MODE_PROMPTS);
    const safeTone   = validModes.includes(tone) ? tone : 'formal_academic';

    // Try Gemini first, then OpenAI, then rule-based
    let rewritten = null;
    let mode = 'rule_based';

    try {
      rewritten = await rewriteWithGemini(text.trim(), safeTone);
      if (rewritten) mode = 'gemini';
    } catch { /* Gemini unavailable */ }

    if (!rewritten) {
      try {
        rewritten = await rewriteWithOpenAI(text.trim(), safeTone);
        if (rewritten) mode = 'openai';
      } catch { /* OpenAI unavailable */ }
    }

    if (!rewritten) rewritten = ruleBasedRewrite(text.trim(), safeTone);

    // Compute output metrics
    const originalWordCount = text.trim().split(/\s+/).length;
    const rewrittenWordCount = rewritten.split(/\s+/).length;
    const expansionRatio = Math.round((rewrittenWordCount / originalWordCount) * 100);

    return res.status(200).set(CORS).json({
      original:             text.trim(),
      rewritten,
      tone:                 safeTone,
      mode,
      original_word_count:  originalWordCount,
      rewritten_word_count: rewrittenWordCount,
      expansion_ratio:      expansionRatio,
      enhancement_mode:     safeTone,
      ai_assisted:          mode !== 'rule_based',
    });
  } catch (err) {
    return res.status(500).set(CORS).json({ error: err.message || 'Internal error' });
  }
}
