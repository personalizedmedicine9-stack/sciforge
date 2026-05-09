// POST /api/generate-outline
// Deterministic academic book outline generator.
// Given a book title (+ optional description), produces a structured TOC with
// chapter titles and subheadings appropriate for a scientific/academic text.
//
// Modes:
//   basic    — template-based pattern matching, no API required
//   ai       — AI-enhanced outline (Gemini preferred, OpenAI fallback)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Domain pattern library ────────────────────────────────────────────────
// Each entry: { patterns[], chapters[] }
// Patterns matched against lowercased title+description.

const DOMAIN_TEMPLATES = [
  // ── Pharmacology / Drug ───────────────────────────────────────────────
  {
    patterns: ['pharmacol', 'drug', 'medication', 'therapeutic', 'pharma', 'medicine', 'clinical'],
    template: 'pharmacology',
    chapters: (title) => [
      {
        title: 'Introduction and Historical Perspective',
        subheadings: ['Historical Development', 'Therapeutic Rationale', 'Scope and Significance'],
      },
      {
        title: 'Chemical and Pharmacological Classification',
        subheadings: ['Chemical Structure and Properties', 'Pharmacological Class', 'Structure–Activity Relationships'],
      },
      {
        title: 'Pharmacokinetics and Drug Metabolism',
        subheadings: ['Absorption and Bioavailability', 'Distribution and Protein Binding', 'Metabolism (CYP450)', 'Excretion and Half-Life'],
      },
      {
        title: 'Pharmacodynamics and Mechanisms of Action',
        subheadings: ['Primary Molecular Targets', 'Signaling Pathways', 'Receptor Binding Profiles', 'Dose–Response Relationships'],
      },
      {
        title: 'Preclinical Evidence',
        subheadings: ['In Vitro Studies', 'Animal Model Data', 'Toxicology and Safety Profile'],
      },
      {
        title: 'Clinical Evidence and Therapeutic Applications',
        subheadings: ['Randomised Controlled Trials', 'Observational Studies', 'Dosing and Administration', 'Therapeutic Indications'],
      },
      {
        title: 'Drug Interactions and Adverse Effects',
        subheadings: ['Pharmacokinetic Interactions', 'Pharmacodynamic Interactions', 'Adverse Event Profile', 'Contraindications'],
      },
      {
        title: 'Limitations and Current Evidence Gaps',
        subheadings: ['Methodological Limitations', 'Population Gaps', 'Long-Term Safety Data'],
      },
      {
        title: 'Future Directions and Emerging Research',
        subheadings: ['Novel Formulations', 'Combination Strategies', 'Ongoing Clinical Trials'],
      },
      {
        title: 'Conclusions',
        subheadings: ['Summary of Evidence', 'Clinical Implications', 'Research Priorities'],
      },
    ],
  },

  // ── Natural Products / Phytotherapy ──────────────────────────────────
  {
    patterns: ['herb', 'plant', 'natural', 'phyto', 'botanica', 'extract', 'essential oil', 'polyphenol', 'flavonoid', 'curcumin', 'quercetin', 'resveratrol', 'terpene', 'alkaloid', 'mushroom', 'traditional'],
    template: 'natural_products',
    chapters: (title) => [
      {
        title: 'Introduction to Natural Products Research',
        subheadings: ['Definition and Classification', 'Traditional Use and Ethnopharmacology', 'Modern Research Context'],
      },
      {
        title: 'Botanical Characterisation and Taxonomy',
        subheadings: ['Plant Source and Taxonomy', 'Geographic Distribution', 'Cultivation and Harvesting'],
      },
      {
        title: 'Phytochemical Composition and Analysis',
        subheadings: ['Primary Bioactive Compounds', 'Extraction and Isolation Methods', 'Analytical Characterisation (HPLC, NMR, MS)', 'Standardisation of Extracts'],
      },
      {
        title: 'Pharmacological Profile and Biological Activity',
        subheadings: ['Anti-inflammatory Activity', 'Antioxidant Mechanisms', 'Antimicrobial Properties', 'Other Pharmacological Effects'],
      },
      {
        title: 'Molecular Mechanisms of Action',
        subheadings: ['Signaling Pathway Modulation', 'Molecular Targets (NF-κB, Nrf2, MAPK)', 'Epigenetic Mechanisms', 'Cellular Effects'],
      },
      {
        title: 'Preclinical Evidence',
        subheadings: ['In Vitro Cell-Based Studies', 'Animal Model Studies', 'Biomarker Effects', 'Toxicity Assessments'],
      },
      {
        title: 'Clinical Studies and Human Evidence',
        subheadings: ['Randomised Controlled Trials', 'Open-Label and Pilot Studies', 'Bioavailability in Humans', 'Safety and Tolerability'],
      },
      {
        title: 'Bioavailability, Formulation and Drug Delivery',
        subheadings: ['Pharmacokinetic Challenges', 'Nanoformulations', 'Synergistic Combinations', 'Stability Studies'],
      },
      {
        title: 'Regulatory Status and Safety Considerations',
        subheadings: ['Regulatory Classification', 'Herb–Drug Interactions', 'Quality Control Standards', 'Toxicology Profile'],
      },
      {
        title: 'Limitations and Future Research Directions',
        subheadings: ['Methodological Gaps', 'Need for Standardisation', 'Clinical Trial Design', 'Translational Opportunities'],
      },
      {
        title: 'Conclusions',
        subheadings: ['Evidence Summary', 'Therapeutic Potential', 'Recommendations'],
      },
    ],
  },

  // ── Oncology / Cancer ─────────────────────────────────────────────────
  {
    patterns: ['cancer', 'oncol', 'tumor', 'tumour', 'carcinoma', 'neoplasm', 'malignant', 'antitumor', 'antineoplastic'],
    template: 'oncology',
    chapters: (title) => [
      {
        title: 'Introduction: Cancer Biology and Therapeutic Landscape',
        subheadings: ['Cancer Epidemiology and Burden', 'Hallmarks of Cancer', 'Current Treatment Paradigms', 'Scope of This Review'],
      },
      {
        title: 'Molecular Biology of Tumour Development',
        subheadings: ['Oncogenes and Tumour Suppressors', 'Tumour Microenvironment', 'Metastatic Mechanisms', 'Drug Resistance'],
      },
      {
        title: 'Chemical Characterisation of the Investigated Agent',
        subheadings: ['Chemical Class and Structure', 'Physicochemical Properties', 'Mechanism Overview'],
      },
      {
        title: 'Antitumour Mechanisms of Action',
        subheadings: ['Apoptosis Induction', 'Cell Cycle Arrest', 'Anti-angiogenic Activity', 'Epigenetic Regulation'],
      },
      {
        title: 'Preclinical Antitumour Evidence',
        subheadings: ['In Vitro Cancer Cell Models', 'In Vivo Xenograft Models', 'Combination Studies', 'Biomarker Data'],
      },
      {
        title: 'Clinical Evidence in Oncology',
        subheadings: ['Phase I/II Trials', 'Phase III Randomised Trials', 'Combination Chemotherapy', 'Targeted Therapy Integration'],
      },
      {
        title: 'Pharmacokinetics in Cancer Patients',
        subheadings: ['Absorption in Oncology Settings', 'Drug–Drug Interactions', 'Dosing Strategies', 'Special Populations'],
      },
      {
        title: 'Safety and Toxicological Profile',
        subheadings: ['Acute and Chronic Toxicity', 'Organ-Specific Toxicity', 'Dose-Limiting Effects', 'Quality of Life Data'],
      },
      {
        title: 'Limitations and Evidence Gaps',
        subheadings: ['Translational Challenges', 'Biomarker Gaps', 'Heterogeneity in Trials'],
      },
      {
        title: 'Future Directions: Precision Oncology',
        subheadings: ['Biomarker-Driven Patient Selection', 'Immunotherapy Combinations', 'Nanotechnology Delivery', 'Emerging Targets'],
      },
      { title: 'Conclusions', subheadings: ['Summary', 'Clinical Implications', 'Research Agenda'] },
    ],
  },

  // ── Inflammation / Immunology ─────────────────────────────────────────
  {
    patterns: ['inflamm', 'immune', 'immunol', 'autoimmun', 'cytokine', 'interleukin', 'arthritis', 'allergy'],
    template: 'immunology',
    chapters: (title) => [
      {
        title: 'Introduction to Inflammation and Immune Dysregulation',
        subheadings: ['Innate vs. Adaptive Immunity', 'Chronic Inflammation', 'Disease Burden', 'Research Context'],
      },
      {
        title: 'Inflammatory Signaling: Key Pathways and Mediators',
        subheadings: ['NF-κB Pathway', 'MAPK Cascades', 'JAK/STAT Signaling', 'Eicosanoid Biosynthesis', 'Pro-inflammatory Cytokines'],
      },
      {
        title: 'Chemical Profile of the Investigated Agent',
        subheadings: ['Chemical Class', 'Structural Features', 'Pharmacological Overview'],
      },
      {
        title: 'Anti-inflammatory Mechanisms',
        subheadings: ['Cytokine Suppression (TNF-α, IL-6, IL-1β)', 'COX/LOX Inhibition', 'Oxidative Stress Modulation', 'Immune Cell Regulation'],
      },
      {
        title: 'Preclinical Anti-inflammatory Evidence',
        subheadings: ['Cell Culture Models', 'Animal Inflammation Models', 'Biomarker Profiles'],
      },
      {
        title: 'Clinical Evidence in Inflammatory Conditions',
        subheadings: ['Rheumatoid Arthritis Trials', 'Inflammatory Bowel Disease', 'Other Autoimmune Conditions', 'Biomarker Outcomes'],
      },
      {
        title: 'Safety, Tolerability and Drug Interactions',
        subheadings: ['Adverse Effects', 'Immunosuppression Concerns', 'Interactions with Biologics'],
      },
      {
        title: 'Limitations and Evidence Gaps',
        subheadings: ['Heterogeneity Issues', 'Biomarker Standardisation', 'Population Coverage'],
      },
      {
        title: 'Future Research Directions',
        subheadings: ['Targeted Delivery', 'Personalised Anti-inflammatory Therapy', 'Combination Approaches'],
      },
      { title: 'Conclusions', subheadings: ['Evidence Summary', 'Clinical Relevance', 'Recommendations'] },
    ],
  },

  // ── Neuroscience / CNS ────────────────────────────────────────────────
  {
    patterns: ['neuro', 'brain', 'cognit', 'alzheimer', 'parkinson', 'dementia', 'cns', 'neuroprotect', 'psychiatric', 'anxiety', 'depression'],
    template: 'neuroscience',
    chapters: (title) => [
      {
        title: 'Introduction: Neurological Disorders and Therapeutic Need',
        subheadings: ['Epidemiology', 'Pathophysiology Overview', 'Current Treatment Limitations'],
      },
      {
        title: 'Neurobiology and Disease Mechanisms',
        subheadings: ['Neuroinflammation', 'Oxidative Stress in CNS', 'Neurodegeneration Pathways', 'Blood–Brain Barrier'],
      },
      {
        title: 'Chemical and Pharmacological Profile',
        subheadings: ['Compound Class', 'CNS Penetration', 'Receptor Interactions'],
      },
      {
        title: 'Neuroprotective Mechanisms',
        subheadings: ['Antioxidant Defence', 'Anti-neuroinflammatory Effects', 'Neurotrophic Factor Modulation', 'Mitochondrial Protection'],
      },
      {
        title: 'Preclinical CNS Evidence',
        subheadings: ['In Vitro Neuronal Models', 'Animal Models of Neurodegeneration', 'Behavioural Outcomes', 'Biomarker Data'],
      },
      {
        title: 'Clinical Evidence in Neurological Conditions',
        subheadings: ['Cognitive Function Trials', 'Neuroprotection Studies', 'Psychiatric Outcomes'],
      },
      {
        title: 'CNS Drug Delivery Challenges',
        subheadings: ['Blood–Brain Barrier Permeability', 'Nanocarrier Systems', 'Targeted Delivery Strategies'],
      },
      {
        title: 'Safety and Neurological Tolerability',
        subheadings: ['CNS Adverse Effects', 'Drug Interactions in CNS Pharmacotherapy'],
      },
      {
        title: 'Limitations and Evidence Gaps',
        subheadings: ['Translational Challenges from Animal to Human', 'Biomarker Standardisation'],
      },
      {
        title: 'Future Directions',
        subheadings: ['Precision Neurology', 'Combination Neuroprotection', 'Biomarker Development'],
      },
      { title: 'Conclusions', subheadings: ['Summary', 'Clinical Implications'] },
    ],
  },

  // ── Metabolic / Diabetes / Obesity ────────────────────────────────────
  {
    patterns: ['diabet', 'metabol', 'obes', 'insulin', 'glucose', 'lipid', 'cardiovascular', 'hypertension', 'atherosclerosis'],
    template: 'metabolic',
    chapters: (title) => [
      {
        title: 'Introduction: Metabolic Disease Burden',
        subheadings: ['Global Epidemiology', 'Metabolic Syndrome', 'Unmet Clinical Need'],
      },
      {
        title: 'Pathophysiology of Metabolic Dysregulation',
        subheadings: ['Insulin Resistance Mechanisms', 'Adipose Tissue Dysfunction', 'Dyslipidaemia', 'Endothelial Dysfunction'],
      },
      {
        title: 'Chemical and Pharmacological Profile',
        subheadings: ['Compound Classification', 'Physicochemical Properties', 'Metabolic Targets'],
      },
      {
        title: 'Mechanisms of Metabolic Action',
        subheadings: ['Glucose Metabolism Modulation', 'Lipid Metabolism Effects', 'Adipogenesis Inhibition', 'AMPK Pathway Activation'],
      },
      {
        title: 'Preclinical Metabolic Evidence',
        subheadings: ['Diabetic Animal Models', 'Obesity Model Studies', 'Cardiovascular Effect Data'],
      },
      {
        title: 'Clinical Evidence in Metabolic Conditions',
        subheadings: ['Glycaemic Control Trials', 'Lipid-Lowering Studies', 'Cardiovascular Outcome Trials'],
      },
      {
        title: 'Safety and Drug Interactions',
        subheadings: ['Hypoglycaemia Risk', 'Interactions with Antidiabetics', 'Organ Safety Profile'],
      },
      {
        title: 'Limitations and Evidence Gaps',
        subheadings: ['Short-Term Study Duration', 'Surrogate vs. Hard Outcomes', 'Population Representativeness'],
      },
      {
        title: 'Future Directions',
        subheadings: ['Combination Metabolic Therapy', 'Precision Medicine in Metabolic Disease', 'Long-Term Outcome Trials'],
      },
      { title: 'Conclusions', subheadings: ['Evidence Summary', 'Clinical Recommendations'] },
    ],
  },

  // ── Antimicrobial / Infectious Disease ────────────────────────────────
  {
    patterns: ['antimicro', 'antibiot', 'antifungal', 'antiviral', 'infect', 'pathogen', 'bacteria', 'virus', 'fungal', 'parasite', 'malaria', 'tuberculosis'],
    template: 'antimicrobial',
    chapters: (title) => [
      {
        title: 'Introduction: Infectious Disease and Antimicrobial Resistance',
        subheadings: ['Global Burden of Infectious Disease', 'Antimicrobial Resistance Crisis', 'Scope of the Review'],
      },
      {
        title: 'Chemical Profile and Classification',
        subheadings: ['Chemical Class', 'Spectrum of Activity', 'Mechanism Overview'],
      },
      {
        title: 'Mechanisms of Antimicrobial Action',
        subheadings: ['Cell Wall / Membrane Disruption', 'Nucleic Acid Synthesis Inhibition', 'Protein Synthesis Targets', 'Metabolic Pathway Inhibition'],
      },
      {
        title: 'In Vitro Antimicrobial Activity',
        subheadings: ['MIC and MBC Determinations', 'Biofilm Inhibition', 'Synergy Studies', 'Resistance Development'],
      },
      {
        title: 'In Vivo Preclinical Evidence',
        subheadings: ['Animal Infection Models', 'Pharmacokinetics in Infection', 'Immunomodulatory Effects'],
      },
      {
        title: 'Clinical Evidence and Therapeutic Use',
        subheadings: ['Clinical Trials Data', 'Empirical vs. Targeted Therapy', 'Special Populations'],
      },
      {
        title: 'Resistance Mechanisms and Countermeasures',
        subheadings: ['Resistance Mechanisms', 'Combination Strategies', 'Novel Targets'],
      },
      {
        title: 'Safety, Toxicity and Drug Interactions',
        subheadings: ['Organ Toxicity Profile', 'Pharmacokinetic Interactions', 'Microbiome Effects'],
      },
      {
        title: 'Limitations and Evidence Gaps',
        subheadings: ['In Vitro-to-In Vivo Translation', 'Clinical Evidence Quality', 'Resistance Surveillance Gaps'],
      },
      {
        title: 'Future Directions',
        subheadings: ['Novel Antimicrobial Strategies', 'Phage Therapy Integration', 'Diagnostic-Guided Therapy'],
      },
      { title: 'Conclusions', subheadings: ['Summary', 'Clinical and Public Health Implications'] },
    ],
  },
];

// ── Generic fallback template ─────────────────────────────────────────────
function genericChapters(title) {
  return [
    {
      title: 'Introduction',
      subheadings: ['Background and Context', 'Research Rationale', 'Scope of the Book', 'Overview of Evidence Base'],
    },
    {
      title: 'Chemical and Molecular Profile',
      subheadings: ['Classification', 'Structural Characteristics', 'Physicochemical Properties', 'Key Bioactive Constituents'],
    },
    {
      title: 'Pharmacological Properties and Mechanisms',
      subheadings: ['Primary Targets', 'Signaling Pathways', 'Dose–Response Characteristics', 'Comparative Pharmacology'],
    },
    {
      title: 'Preclinical Evidence Base',
      subheadings: ['In Vitro Studies', 'Animal Models', 'Biomarker Analysis', 'Toxicity and Safety'],
    },
    {
      title: 'Clinical Evidence and Human Studies',
      subheadings: ['Randomised Controlled Trials', 'Observational Studies', 'Efficacy Outcomes', 'Safety in Humans'],
    },
    {
      title: 'Pharmacokinetics and Drug Delivery',
      subheadings: ['Absorption and Bioavailability', 'Distribution and Metabolism', 'Formulation Strategies', 'Delivery Systems'],
    },
    {
      title: 'Safety Profile and Drug Interactions',
      subheadings: ['Adverse Effects', 'Toxicological Data', 'Drug–Drug Interactions', 'Contraindications'],
    },
    {
      title: 'Regulatory and Quality Considerations',
      subheadings: ['Regulatory Status', 'Quality Control Standards', 'Standardisation Challenges', 'Good Manufacturing Practice'],
    },
    {
      title: 'Limitations and Critical Appraisal',
      subheadings: ['Methodological Limitations', 'Evidence Hierarchy Analysis', 'Publication Bias', 'Research Gaps'],
    },
    {
      title: 'Future Research Directions',
      subheadings: ['Emerging Therapeutic Applications', 'Clinical Trial Priorities', 'Technological Advances', 'Translational Opportunities'],
    },
    {
      title: 'Conclusions and Recommendations',
      subheadings: ['Evidence Synthesis', 'Clinical Implications', 'Research Agenda', 'Practical Recommendations'],
    },
  ];
}

// ── Domain matching ───────────────────────────────────────────────────────
function detectTemplate(title, description) {
  const haystack = `${title} ${description || ''}`.toLowerCase();
  for (const entry of DOMAIN_TEMPLATES) {
    if (entry.patterns.some(p => haystack.includes(p))) {
      return entry;
    }
  }
  return null;
}

// ── Core generator ────────────────────────────────────────────────────────
function generateDeterministicOutline(title, description) {
  const match    = detectTemplate(title, description);
  const template = match?.template || 'general';
  const rawChaps = match ? match.chapters(title) : genericChapters(title);

  const chapters = rawChaps.map((ch, i) => ({
    id:          `ch-${Date.now()}-${i}`,
    order:       i + 1,
    title:       ch.title,
    subheadings: ch.subheadings || [],
  }));

  return {
    mode:        'outline_basic',
    book_title:  title,
    description: description || '',
    template,
    chapters,
    total:       chapters.length,
  };
}

// ── Optional AI enhancement ───────────────────────────────────────────────
const OUTLINE_ENHANCE_PROMPT = `You are an evidence-grounded academic enhancement engine within SciForge Engine. Your ONLY function is to improve chapter titles and subheadings for academic books.

ABSOLUTE RULES:
1. Do NOT add scientific claims not supported by the source text.
2. Do NOT invent references, DOIs, or PMIDs.
3. Keep the same number of chapters — do NOT add or remove any.
4. Improve specificity, academic rigor, and scholarly precision only.

Return JSON with the same structure.`;

async function enhanceWithAI(outline, title, description) {
  const prompt = `${OUTLINE_ENHANCE_PROMPT}\n\nGiven the book title and description, improve the chapter titles and subheadings to be more specific and academically rigorous. Keep the same number of chapters (${outline.chapters.length}). Return JSON array with objects having 'title' and 'subheadings' keys.\n\nTitle: "${title}"\nDescription: "${description || 'Academic scientific text'}"\n\nChapters JSON:\n${JSON.stringify(outline.chapters.map(c => ({ id: c.id, title: c.title, subheadings: c.subheadings })), null, 2)}`;

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
            systemInstruction: { parts: [{ text: OUTLINE_ENHANCE_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
          }),
          signal: AbortSignal.timeout(25_000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const enhanced = JSON.parse(cleaned);
        if (Array.isArray(enhanced)) {
          const mergedChapters = outline.chapters.map((ch, i) => ({
            ...ch,
            title:       enhanced[i]?.title       || ch.title,
            subheadings: enhanced[i]?.subheadings || ch.subheadings,
          }));
          return { ...outline, mode: 'outline_ai', chapters: mergedChapters };
        }
      }
    } catch { /* Gemini unavailable */ }
  }
  // Fallback to OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return outline;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:       'gpt-4o-mini',
        max_tokens:  2000,
        temperature: 0.2,
        messages:    [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return outline;
    const data    = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const enhanced = JSON.parse(cleaned);
    if (!Array.isArray(enhanced)) return outline;
    const mergedChapters = outline.chapters.map((ch, i) => ({
      ...ch,
      title:       enhanced[i]?.title       || ch.title,
      subheadings: enhanced[i]?.subheadings || ch.subheadings,
    }));
    return { ...outline, mode: 'outline_ai', chapters: mergedChapters };
  } catch {
    return outline;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();
  if (req.method !== 'POST')    return res.status(405).set(CORS).json({ error: 'POST only' });

  try {
    const { title, description, mode: requestedMode } = req.body || {};

    if (!title?.trim()) {
      return res.status(400).set(CORS).json({ error: 'title is required' });
    }

    let outline = generateDeterministicOutline(title.trim(), (description || '').trim());

    const hasAI = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    if ((requestedMode === 'ai' || requestedMode === 'outline_ai') && hasAI) {
      outline = await enhanceWithAI(outline, title.trim(), (description || '').trim());
    }

    return res.status(200).set(CORS).json(outline);
  } catch (err) {
    return res.status(500).set(CORS).json({ error: err.message || 'Internal error' });
  }
}
