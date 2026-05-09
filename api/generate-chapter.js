// POST /api/generate-chapter
// Long-form academic chapter generator.
// Consumes processEvidence(papers) — never re-parses abstracts directly.
//
// Modes:
//   chapter_basic    — template-based, fully deterministic
//   chapter_enhanced — richer transitions + compound class detection
//   chapter_ai       — enhanced + AI prose polish (Gemini preferred, OpenAI fallback)

import { processEvidence } from './_lib/evidence-processor.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Compound class detection (for Chemical Profile section) ──────────────
const COMPOUND_CLASSES = [
  { name: 'polyphenol',    re: /polyphenol|flavonoid|phenolic|curcumin|quercetin|resveratrol|kaempferol|luteolin|apigenin|catechin|anthocyanin/i },
  { name: 'alkaloid',      re: /alkaloid|berberine|colchicine|morphine|caffeine|piperine|capsaicin|vincristine|taxol/i },
  { name: 'terpenoid',     re: /terpen|terpene|sesquiterpen|diterpen|triterpen|artemisinin|limonene|thymol|carvacrol|ursolic/i },
  { name: 'glycoside',     re: /glycoside|saponin|digitalis|ginsenoside/i },
  { name: 'essential oil', re: /essential oil|volatile oil|aromatic/i },
  { name: 'peptide',       re: /peptide|protein|amino acid|lactoferrin|collagen/i },
  { name: 'fatty acid',    re: /fatty acid|omega[- ]?[36]|EPA|DHA|linoleic|arachidonic/i },
  { name: 'steroid',       re: /steroid|sterol|phytosterol|cholesterol|cortisol|dexamethasone/i },
  { name: 'cannabinoid',   re: /cannabinoid|CBD|THC|cannabis|hemp/i },
  { name: 'probiotic',     re: /probiotic|lactobacillus|bifidobacterium|microbiome|gut flora/i },
];

function detectCompoundClass(evidence) {
  const allText = evidence.papers
    .map(p => `${p.title || ''} ${p.abstract || ''}`)
    .join(' ');
  for (const { name, re } of COMPOUND_CLASSES) {
    if (re.test(allText)) return name;
  }
  return null;
}

// ── Citation helper: get index of a paper in the ranked list ─────────────
function cite(papers, paper) {
  const i = papers.indexOf(paper);
  return i >= 0 ? i + 1 : null;
}

function citeList(papers, subset, max = 5) {
  return subset
    .slice(0, max)
    .map(p => cite(papers, p))
    .filter(Boolean);
}

function citeSuffix(cites) {
  return cites.length > 0 ? ` [${cites.join(', ')}]` : '';
}

// ── 7-section chapter generators ─────────────────────────────────────────

// Section 1 — Introduction
function buildIntroduction(query, evidence, mode) {
  const { counts, groups, mechanisms } = evidence;
  const topicLabel = query ? `"${query}"` : 'the subject under investigation';

  const scopeStr = (() => {
    const parts = [];
    if (groups.clinical.length    > 0) parts.push(`${groups.clinical.length} clinical study${groups.clinical.length > 1 ? 'ies' : 'y'}`);
    const preclinN = groups.preclinical.length + groups.mechanistic.length;
    if (preclinN > 0) parts.push(`${preclinN} preclinical or mechanistic investigation${preclinN > 1 ? 's' : ''}`);
    if (groups.review.length      > 0) parts.push(`${groups.review.length} review${groups.review.length > 1 ? 's' : ''} or meta-analysis${groups.review.length > 1 ? 'es' : ''}`);
    return parts.join(', ');
  })();

  const mechHint = mechanisms.length > 0
    ? ` Emerging mechanistic insights implicate signaling pathways including ${mechanisms.slice(0, 3).join(', ')}, suggesting a biologically plausible basis for the observed effects.`
    : '';

  const enhanced = mode !== 'chapter_basic'
    ? ` Research interest has intensified in recent years, driven by advances in molecular pharmacology and a growing demand for evidence-based applications in clinical and therapeutic contexts.`
    : '';

  return `The present chapter synthesizes the current scientific evidence on ${topicLabel}, integrating mechanistic, preclinical, and clinical findings from ${counts.total} retrieved studies (${scopeStr || 'various study designs'}).${mechHint}${enhanced} The chapter aims to provide a comprehensive, structured overview of the available evidence, its limitations, and directions for future investigation, serving as a reference for researchers and clinicians working in this domain.`;
}

// Section 2 — Chemical & Pharmacological Profile
function buildChemicalProfile(query, evidence, compoundClass, mode) {
  const { counts } = evidence;

  if (!compoundClass) {
    return mode === 'chapter_basic'
      ? `The pharmacological profile of ${query || 'the investigated subject'} has not been fully characterised within the retrieved evidence set. Relevant physicochemical and pharmacokinetic properties should be evaluated using primary characterisation studies not included in the current corpus.`
      : `Based on the retrieved literature, definitive compound classification was not possible from the available abstracts alone. The pharmacological properties — including bioavailability, metabolic stability, and target selectivity — remain to be systematically characterised. Readers are directed to primary pharmacognosy and pharmaceutical sciences literature for a comprehensive physicochemical profile.`;
  }

  const classDescriptions = {
    polyphenol:    'a polyphenolic compound characterised by one or more hydroxyl groups on aromatic ring systems. Polyphenols exhibit broad pharmacological activities including antioxidant, anti-inflammatory, and chemopreventive properties, mediated partly through redox chemistry and modulation of transcription factors such as NF-κB and Nrf2',
    alkaloid:      'a nitrogen-containing heterocyclic compound belonging to the alkaloid class. Alkaloids are characterised by diverse pharmacological activities including analgesic, antimicrobial, and antineoplastic effects, often mediated through receptor binding or enzyme inhibition',
    terpenoid:     'a terpenoid compound derived from the universal five-carbon isoprene precursor. Terpenoids exhibit a wide spectrum of biological activities, including antimicrobial, anti-inflammatory, and antitumour effects, often related to their lipophilic nature and capacity to interact with membrane-associated targets',
    glycoside:     'a glycosidic compound in which an aglycone moiety is linked to one or more sugar residues. Glycosides display diverse pharmacological profiles, with activities influenced by the nature of the aglycone and the pattern of glycosylation',
    'essential oil':'an essential oil or aromatic compound, typically composed of complex mixtures of volatile terpenoids and phenylpropanoids. Essential oils demonstrate multifaceted pharmacological activities including antimicrobial, anti-inflammatory, and antioxidant effects',
    peptide:       'a bioactive peptide or protein-derived compound. Bioactive peptides exhibit targeted pharmacological activities, including immunomodulatory, antimicrobial, and receptor-mediated hormonal effects, depending on their sequence and structural configuration',
    'fatty acid':  'a polyunsaturated fatty acid (PUFA) or lipid-derived bioactive compound. Fatty acids, particularly omega-3 and omega-6 species, modulate eicosanoid biosynthesis, membrane fluidity, and inflammatory signaling through COX and LOX pathways',
    steroid:       'a steroidal compound characterised by the cyclopentanoperhydrophenanthrene ring system. Steroids and phytosterols interact with nuclear hormone receptors and modulate gene expression in multiple tissues',
    cannabinoid:   'a cannabinoid compound acting on the endocannabinoid system (CB1/CB2 receptors). Cannabinoids modulate neurotransmission, immune function, and pain signaling through both receptor-dependent and receptor-independent mechanisms',
    probiotic:     'a probiotic or microbiome-modulating agent. Probiotic organisms interact with the gut epithelium and immune system through pattern recognition receptors and metabolite production, influencing systemic inflammatory and metabolic pathways',
  };

  const desc = classDescriptions[compoundClass] || `a compound classified under ${compoundClass}, with specific pharmacological activities documented in the literature`;

  const pkStr = mode !== 'chapter_basic'
    ? ` Pharmacokinetic considerations — including absorption, distribution, metabolism, and excretion (ADME) — are critical determinants of in vivo efficacy and should be evaluated in the context of the available clinical data.`
    : '';

  return `${query || 'The investigated compound'} belongs to the ${compoundClass} class of bioactive compounds, specifically ${desc}. This chemical class is characterised by distinctive structural features that confer both target selectivity and susceptibility to metabolic transformation.${pkStr} The pharmacological profile is further shaped by dose, formulation, and the biological context of administration, factors that introduce variability across the retrieved studies.`;
}

// Section 3 — Mechanisms of Action
function buildMechanisms(evidence, mode) {
  const { papers, groups, mechanisms } = evidence;
  const relevant = [...groups.mechanistic, ...groups.preclinical];

  if (mechanisms.length === 0 && relevant.length === 0) {
    return 'The retrieved evidence set did not yield mechanistic data sufficient to characterise molecular targets or intracellular signaling pathways. Mechanistic elucidation will require targeted experimental studies using appropriate cell-based and biochemical assays.';
  }

  const cites      = citeList(papers, relevant);
  const pathways   = mechanisms.length > 0 ? mechanisms : ['undefined signaling pathways'];
  const primary    = pathways.slice(0, 3);
  const secondary  = pathways.slice(3, 6);

  const primaryStr   = primary.join(', ');
  const secondaryStr = secondary.length > 0 ? ` Secondary modulation of ${secondary.join(', ')} pathways has also been reported.` : '';

  const depthStr = mode !== 'chapter_basic'
    ? ` At the molecular level, these interactions involve upstream receptor engagement or direct enzymatic inhibition, leading to downstream transcriptional reprogramming. The convergence of multiple signaling nodes suggests pleiotropic pharmacological activity rather than a single mechanism of action, a characteristic common to naturally derived compounds with complex chemical structures.`
    : '';

  return `Mechanistic studies consistently indicate modulation of ${primaryStr}, particularly involving inflammatory, oxidative stress, and cell-survival signaling cascades${citeSuffix(cites)}.${secondaryStr} These observations derive predominantly from in vitro cell-based assays and, to a lesser extent, ex vivo preparations, providing molecular-level insights into target engagement and downstream effector responses.${depthStr} The translation of these mechanistic findings to in vivo and clinical contexts remains an active area of investigation and is addressed in subsequent sections.`;
}

// Section 4 — Preclinical Evidence
function buildPreclinical(evidence, mode) {
  const { papers, groups, counts } = evidence;
  const relevant = [...groups.preclinical, ...groups.mechanistic];

  if (relevant.length === 0) {
    return 'No preclinical or mechanistic studies were identified within the retrieved evidence set. This absence may reflect search strategy limitations or a research gap in experimental model investigation for this topic.';
  }

  const animalPapers = groups.preclinical;
  const cellPapers   = groups.mechanistic;
  const cites        = citeList(papers, relevant);

  const animalStr = animalPapers.length > 0
    ? `Animal model studies (n=${animalPapers.length}) provide in vivo evidence of pharmacological activity, demonstrating effects on biomarker levels, organ function, and pathological endpoints under controlled experimental conditions${citeSuffix(citeList(papers, animalPapers, 3))}. `
    : '';

  const cellStr = cellPapers.length > 0
    ? `Cellular and biochemical investigations (n=${cellPapers.length}) elucidate molecular mechanisms and dose-response relationships at the subcellular level${citeSuffix(citeList(papers, cellPapers, 3))}. `
    : '';

  const caveatStr = mode !== 'chapter_basic'
    ? ` Species differences in drug metabolism, receptor expression, and disease physiology limit the direct extrapolation of animal findings to human pathology. Dose equivalence calculations and allometric scaling are required when interpreting animal data in the context of human pharmacokinetics.`
    : ' Caution is warranted when extrapolating these findings to human subjects given interspecies physiological differences.';

  return `${animalStr}${cellStr}Collectively, the preclinical evidence (n=${relevant.length}) provides proof-of-concept support for biological activity, identifying candidate molecular targets and dose ranges for further investigation.${caveatsStr(citeList(papers, relevant, 5))}${caveatStr}`;
}

function caveatsStr(cites) {
  return cites.length > 0 ? ` These findings are supported by ${cites.length} preclinical study${cites.length > 1 ? 'ies' : 'y'} [${cites.join(', ')}].` : '';
}

// Section 5 — Clinical Evidence
function buildClinical(evidence, mode) {
  const { papers, groups, counts } = evidence;
  const relevant = groups.clinical;

  if (relevant.length === 0) {
    const preclinHint = mode !== 'chapter_basic'
      ? ' The absence of clinical data represents a critical translational gap. Regulatory-grade evidence from well-designed randomised controlled trials is required before any clinical recommendations can be formulated.'
      : ' Further clinical investigation is warranted.';
    return `Clinical evidence for the investigated topic is absent from the current result set. All retrieved studies derive from preclinical or mechanistic experimental systems, which, while informative regarding biological plausibility, do not constitute sufficient evidence for clinical efficacy or safety.${preclinHint}`;
  }

  const rctPapers    = relevant.filter(p => (p.study_type || '').toLowerCase().includes('rct'));
  const cohortPapers = relevant.filter(p => (p.study_type || '').toLowerCase().includes('cohort') || (p.study_type || '').toLowerCase().includes('case'));
  const cites        = citeList(papers, relevant);

  const rctStr = rctPapers.length > 0
    ? `${rctPapers.length} randomised controlled trial${rctPapers.length > 1 ? 's' : ''} provide${rctPapers.length === 1 ? 's' : ''} the highest level of clinical evidence${citeSuffix(citeList(papers, rctPapers, 3))}. `
    : 'No randomised controlled trials were identified; ';

  const obsStr = cohortPapers.length > 0
    ? `${cohortPapers.length} observational study${cohortPapers.length > 1 ? 'ies' : 'y'} contribute${cohortPapers.length === 1 ? 's' : ''} supporting data from naturalistic clinical settings${citeSuffix(citeList(papers, cohortPapers, 3))}.`
    : rctPapers.length === 0 ? `clinical evidence derives from ${relevant.length} non-randomised study${relevant.length > 1 ? 'ies' : 'y'}${citeSuffix(cites)}.` : '';

  const hetStr = mode !== 'chapter_basic'
    ? ` Heterogeneity in patient populations, intervention protocols, dosing regimens, and outcome assessment methodologies limits the poolability of these findings and introduces uncertainty in effect size estimation. Meta-analytic synthesis should be approached with caution given these sources of variability.`
    : ' Variability across studies limits generalisation.';

  return `${rctStr}${obsStr} Collectively, the clinical evidence base (n=${relevant.length}) provides ${rctPapers.length > 0 ? 'moderate' : 'limited'} support for translational relevance.${hetStr}`;
}

// Section 6 — Limitations
function buildLimitations(evidence, mode) {
  const { counts, groups } = evidence;
  const items = [];
  const preclinPct = counts.total > 0
    ? (groups.preclinical.length + groups.mechanistic.length) / counts.total : 0;

  if (preclinPct > 0.6) {
    items.push(`Over ${Math.round(preclinPct * 100)}% of the included evidence derives from preclinical or mechanistic models, creating a translational gap between experimental observations and clinical applicability. The biological plausibility established in laboratory settings does not guarantee equivalent efficacy or safety in human populations.`);
  }

  if (counts.rct === 0) {
    items.push('The complete absence of randomised controlled trial data represents the most critical methodological limitation. Without prospective experimental designs with appropriate controls, the directionality and causality of observed associations cannot be established.');
  } else if (counts.rct < 3) {
    items.push(`The limited number of RCTs (n=${counts.rct}) is insufficient to establish robust clinical evidence. Statistical power, blinding adequacy, and allocation concealment require scrutiny in the available trials.`);
  }

  if (counts.total < 10) {
    items.push('The modest volume of retrieved literature (n=' + counts.total + ') limits the breadth of conclusions and increases the likelihood that the synthesis does not capture the full scope of available evidence. A comprehensive systematic review with broader search strategies is recommended.');
  }

  if (groups.review.length > 0 && groups.review.length / counts.total > 0.3) {
    items.push('A disproportionate representation of review articles introduces the risk of circular citation and secondary synthesis artefacts. Primary empirical data are needed to substantiate the claims advanced in the narrative literature.');
  }

  if (mode !== 'chapter_basic') {
    items.push('Additional methodological concerns include heterogeneity in compound sources, purity, and standardisation; inconsistent dosing across studies; absence of long-term follow-up data; and the predominance of single-centre investigations that may not generalise to diverse patient populations.');
  }

  items.push('Publication bias represents an inherent limitation of any literature synthesis, as negative or null findings are systematically under-reported relative to positive findings, potentially inflating apparent effect sizes.');

  return items.join(' ');
}

// Section 7 — Future Directions
function buildFutureDirections(query, evidence, mode) {
  const { counts, groups, mechanisms } = evidence;
  const topicLabel = query ? `${query}` : 'this area';

  const rctNeed = counts.rct < 2
    ? `Well-designed, adequately powered randomised controlled trials with pre-specified primary endpoints, standardised interventions, and appropriate control conditions are urgently required to establish the clinical efficacy of ${topicLabel}.`
    : `Further large-scale randomised controlled trials with longer follow-up periods and diverse patient populations are needed to consolidate existing clinical findings.`;

  const mechNeed = mechanisms.length > 0
    ? `Mechanistic investigations should move beyond isolated pathway analysis toward systems-level approaches, including multi-omics integration, to characterise the full pharmacodynamic profile and identify predictive biomarkers of response.`
    : `Systematic mechanistic characterisation using modern molecular and cellular tools is required to identify primary molecular targets and elucidate dose-response relationships.`;

  const pkNeed = mode !== 'chapter_basic'
    ? ` Pharmacokinetic–pharmacodynamic (PK/PD) modelling studies should be prioritised to define optimal dosing regimens and identify patient populations most likely to benefit from intervention.`
    : '';

  const safetyNeed = ` Long-term safety surveillance studies, including assessment of drug interactions, organ toxicity, and potential for resistance development, are essential prerequisites for clinical translation.`;

  const standardNeed = mode !== 'chapter_basic'
    ? ` Standardisation of research methodologies — including compound characterisation, dose specification, and outcome measurement — is necessary to enable cross-study comparisons and facilitate regulatory-grade evidence synthesis.`
    : '';

  return `${rctNeed} ${mechNeed}${pkNeed}${safetyNeed}${standardNeed} Collaborative multi-centre research networks and pre-competitive data sharing initiatives would accelerate the translation of preclinical findings into validated clinical applications for ${topicLabel}.`;
}

// ── Deterministic chapter assembly ───────────────────────────────────────
function generateDeterministicChapter(query, evidence, mode, previousChapters) {
  const compoundClass = detectCompoundClass(evidence);
  const title = query
    ? `Scientific Chapter: ${query.charAt(0).toUpperCase() + query.slice(1)}`
    : 'Scientific Chapter: Evidence Synthesis';

  // Build continuity note if previous chapters exist
  let continuityNote = '';
  if (previousChapters && previousChapters.length > 0) {
    const prevTitles = previousChapters.map(ch => ch.title || 'Untitled').join(', ');
    continuityNote = ` Previous chapters covered: ${prevTitles}.`;
  }

  return {
    mode,
    title,
    compound_class:    compoundClass,
    introduction:      buildIntroduction(query, evidence, mode) + continuityNote,
    chemical_profile:  buildChemicalProfile(query, evidence, compoundClass, mode),
    mechanisms:        buildMechanisms(evidence, mode),
    preclinical:       buildPreclinical(evidence, mode),
    clinical:          buildClinical(evidence, mode),
    limitations:       buildLimitations(evidence, mode),
    future_directions: buildFutureDirections(query, evidence, mode),
    evidence_summary:  evidence.counts,
    evidence_density:  evidence.density,
    mechanisms_list:   evidence.mechanisms,
    references:        evidence.references,
    papers_used:       evidence.papers.length,
    query,
  };
}

// ── Mode C: OpenAI prose polish ───────────────────────────────────────────
const CHAPTER_POLISH_PROMPT = `You are an evidence-grounded academic enhancement engine within SciForge Engine. Your ONLY function is to improve the scholarly prose of scientific/academic chapter text that is already grounded in verified references.

ABSOLUTE RULES:
1. Do NOT change any citation numbering [n] or remove citations.
2. Do NOT add new scientific claims, references, or unsupported statements.
3. Do NOT alter any numerical values, p-values, or statistical data.
4. Do NOT fabricate any DOI, PMID, or reference.
5. Do NOT remove any information from the source text.
6. Do NOT introduce new biological pathways or mechanisms.

You MAY ONLY improve prose clarity, academic tone, scholarly transitions, and readability.
Return the same JSON structure with improved text fields only.`;

async function polishChapterWithAI(chapter, query, continuityContext = '') {
  const fields = ['introduction','chemical_profile','mechanisms','preclinical','clinical','limitations','future_directions'];
  const inputJSON = JSON.stringify(Object.fromEntries(fields.map(f => [f, chapter[f]])), null, 2);
  const continuityInstruction = continuityContext ? `\n\n${continuityContext}` : '';

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
            systemInstruction: { parts: [{ text: CHAPTER_POLISH_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: `Improve the prose clarity and academic register of these chapter sections. DO NOT add new claims, change citation numbers [n], introduce new references, or remove any information.${continuityInstruction} Return a JSON object with only these keys: ${fields.join(', ')}.\n\nInput:\n${inputJSON}` }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 6000 },
          }),
          signal: AbortSignal.timeout(50_000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (cleaned) {
          try {
            const polished = JSON.parse(cleaned);
            return { ...chapter, ...polished, mode: 'chapter_ai' };
          } catch { /* parse error, fall through */ }
        }
      }
    } catch { /* Gemini unavailable */ }
  }
  // Fallback to OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return chapter;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:      'gpt-4o-mini',
        max_tokens: 4000,
        temperature: 0.2,
        messages:   [{ role: 'user', content: `${CHAPTER_POLISH_PROMPT}\n\nImprove the prose clarity and academic register of these chapter sections. DO NOT add new claims, change citation numbers [n], introduce new references, or remove any information.${continuityInstruction} Return a JSON object with only these keys: ${fields.join(', ')}.\n\nInput:\n${inputJSON}` }],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) return chapter;
    const data    = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const polished = JSON.parse(cleaned);
    return { ...chapter, ...polished, mode: 'chapter_ai' };
  } catch {
    return chapter;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();
  if (req.method !== 'POST')    return res.status(405).set(CORS).json({ error: 'POST only' });

  try {
    const { query, papers: rawPapers, mode: requestedMode, previousChapters } = req.body || {};
    if (!rawPapers?.length) return res.status(400).set(CORS).json({ error: 'papers[] is required' });

    // processEvidence is the single entry point — no direct paper parsing here
    const evidence = processEvidence(rawPapers);
    if (evidence.papers.length === 0) {
      return res.status(400).set(CORS).json({ error: 'No valid papers after preprocessing' });
    }

    const hasAI = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    const mode = requestedMode === 'chapter_basic' ? 'chapter_basic'
      : requestedMode === 'chapter_ai' && hasAI ? 'chapter_ai'
      : 'chapter_enhanced';

    let chapter = generateDeterministicChapter(
      query || '',
      evidence,
      mode === 'chapter_ai' ? 'chapter_enhanced' : mode,
      previousChapters,
    );

    if (mode === 'chapter_ai') {
      // Include previous chapters context in AI prompt for continuity
      const continuityContext = previousChapters && previousChapters.length > 0
        ? ` Previous chapters covered: ${previousChapters.map(ch => ch.title || 'Untitled').join(', ')}. Maintain continuity with prior content.`
        : '';
      chapter = await polishChapterWithAI(chapter, query || '', continuityContext);
    }

    return res.status(200).set(CORS).json(chapter);
  } catch (err) {
    return res.status(500).set(CORS).json({ error: err.message || 'Internal error' });
  }
}
