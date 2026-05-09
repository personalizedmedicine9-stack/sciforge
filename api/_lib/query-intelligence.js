// ═══════════════════════════════════════════════════════════════════════════
// QUERY NORMALIZATION LAYER (Step 1 of pipeline)
//
// For queries > 12 words (sentences / paragraphs):
//   → Strip narrative phrasing and filler language
//   → Extract core scientific / mechanistic / pharmacological concepts only
//   → Never search the raw sentence
//
// For short queries (≤ 12 words):
//   → Pass through to synonym + concept expansion as before
// ═══════════════════════════════════════════════════════════════════════════

// Narrative / filler phrases to strip before concept extraction
const NARRATIVE_PATTERNS = [
  /\b(i am (looking|searching|trying) (for|to find)?)\b/gi,
  /\b(can you (find|search|look up|retrieve|give me|show me|help me))\b/gi,
  /\b(please (find|search|show|give|provide|list|retrieve))\b/gi,
  /\b(what (is|are|does|do) the (evidence|research|literature|studies|papers|data))\b/gi,
  /\b(tell me (about|regarding))\b/gi,
  /\b(research (on|about|regarding|into))\b/gi,
  /\b(papers? (on|about|regarding|related to|discussing))\b/gi,
  /\b(studies? (on|about|regarding|of|examining|investigating|exploring))\b/gi,
  /\b(literature (on|about|regarding))\b/gi,
  /\b(evidence (for|that|of|about|regarding|supporting))\b/gi,
  /\b(the (role|effect|impact|influence|function) of)\b/gi,
  /\b(how (does|do|can|is|are))\b/gi,
  /\b(which (compounds?|plants?|herbs?|molecules?|drugs?))\b/gi,
  /\b(that (can|could|may|might|will|would|has|have))\b/gi,
  /\b(in (the context of|relation to|terms of|cases of|patients with))\b/gi,
  /\b(with (regard to|respect to|reference to))\b/gi,
  /\b(through (a|the|their|its))\b/gi,
  /\b(via (a|the|their|its))\b/gi,
  /\b(as (a|an|the) (result|consequence|mechanism|pathway|approach|strategy|tool|method))\b/gi,
  /\b(multi.target(ed)?|network equilibrium|systems? approach|holistic approach)\b/gi,
  /\b(emerging (evidence|research|data|literature|field))\b/gi,
  /\b(current(ly)? (known|understood|established|recognized))\b/gi,
  /\b(there (is|are|exists?|have been))\b/gi,
  /\b(it (is|has been|was) (known|shown|demonstrated|reported|established|found))\b/gi,
];

// Scientific concept terms — preserved during extraction
const SCIENTIFIC_CONCEPT_TERMS = new Set([
  // Phytochemistry / botanicals
  'alkaloid','flavonoid','terpenoid','saponin','phenolic','polyphenol','tannin',
  'anthocyanin','carotenoid','isoflavone','lignan','stilbene','coumarin','quinone',
  'curcumin','quercetin','resveratrol','berberine','artemisinin','epigallocatechin',
  'silymarin','ginsenoside','withanolide','thymoquinone','piperine','eugenol',
  'camptothecin','taxol','paclitaxel','vincristine','colchicine','morphine',
  'phytochemical','botanical','plant-derived','natural product','herbal extract',
  'essential oil','plant extract','medicinal plant','traditional medicine',
  'ethnopharmacology','pharmacognosy','phytotherapy','nutraceutical',
  // Mechanism / pharmacology
  'pharmacokinetic','bioavailability','pharmacodynamic','pharmacology',
  'anti-inflammatory','antioxidant','anticancer','antimicrobial','antiviral',
  'neuroprotective','hepatoprotective','cardioprotective','immunomodulatory',
  'apoptosis','autophagy','angiogenesis','metastasis','cytotoxic',
  'nf-kb','nf-κb','cox','tnf','il-6','il-1β','mapk','pi3k','akt','mtor',
  'reactive oxygen species','ros','oxidative stress','free radical',
  'mitochondrial','endoplasmic reticulum','proteasome',
  'receptor','agonist','antagonist','inhibitor','inducer','transporter',
  'cyp450','cyp3a4','cyp2c9','p-glycoprotein','enzyme',
  'biomarker','cytokine','chemokine','interleukin','interferon',
  // Systems biology / network pharmacology
  'network pharmacology','polypharmacology','multi-target','systems biology',
  'molecular docking','molecular dynamics','in silico','computational',
  'protein-protein interaction','gene ontology','kegg pathway','reactome',
  'gene expression','transcriptomics','proteomics','metabolomics','lipidomics',
  // Disease areas
  'cancer','tumor','carcinoma','neoplasm','oncology','chemotherapy',
  'diabetes','insulin','glucose','hyperglycemia','metabolic syndrome',
  'inflammation','arthritis','sepsis','neuroinflammation',
  'alzheimer','parkinson','dementia','neurodegeneration',
  'cardiovascular','hypertension','atherosclerosis','ischemia',
  'infection','antimicrobial','antibiotic','antifungal',
  'liver','hepatic','hepatoprotective','cirrhosis','fibrosis',
  // Formulation / delivery
  'nanoparticle','liposome','nanoemulsion','micelle','hydrogel','nanoformulation',
  'drug delivery','controlled release','encapsulation','biofilm',
  // Gene symbols / oncogenes (lowercase — matching is case-insensitive)
  'kras','egfr','her2','erbb2','braf','alk','met','ros1','ret','ntrk',
  'tp53','brca1','brca2','pten','rb1','apc','vhl','cdh1','smad4','stk11',
  'myc','nras','hras','kras','jak2','stat3','ctnnb1','notch1','fbxw7',
  'abl1','bcr-abl','pml-rara','npm1','flt3','dnmt3a','tet2','idh1','idh2',
  // Metabolic enzymes / CYP family
  'cyp3a4','cyp2d6','cyp2c9','cyp2c19','cyp1a2','cyp2b6','cyp2e1','cyp2a6',
  'cyp450','ugt1a1','ugt2b7','sult1a1','nat2','tpmt','dpyd','comt',
  'mao-a','mao-b','aldh','adh','gst','nos','cox-2','cox-1',
  // Transporters / membrane proteins
  'abcb1','abcg2','abcc1','abcc2','slco1b1','slco1b3','slc22a1','slc22a2',
  'p-glycoprotein','mdr1','mrp1','mrp2','bcrp','oatp1b1','oatp1b3',
  'oct1','oct2','mate1','mate2','oat1','oat3','ent1','cnt3',
]);

// Filler words that are not scientific concepts
const CONCEPT_STOPWORDS = new Set([
  'a','an','the','in','on','at','of','for','to','by','with','and','or','not',
  'is','are','was','were','be','has','have','do','does','did','that','this',
  'those','these','it','its','about','from','between','among',
  'new','novel','recent','current','potential','possible','various','several',
  'important','significant','major','key','main','primary','secondary',
  'including','such','many','most','some','few','more','less','very','quite',
  'also','well','even','still','yet','but','however','therefore','thus',
  'which','who','what','where','when','how','why','both','either','neither',
  'their','them','they','we','our','us','you','your','he','she','him','her',
  'show','shows','shown','demonstrate','demonstrates','demonstrated',
  'suggest','suggests','suggested','indicate','indicates','indicated',
  'result','results','resulted','find','finds','found','report','reports','reported',
  'known','unknown','clear','unclear','remain','remains','remained',
  'different','similar','same','other','another','additional','further',
  'compound','compounds','molecule','molecules','substance','substances',
  'activity','activities','action','actions','ability','abilities',
  'level','levels','amount','amounts','concentration','concentrations',
  'model','models','system','systems','process','processes','pathway','pathways',
  'type','types','form','forms','group','groups','class','classes',
]);

// Gene symbol pattern — matches standard HGNC symbols:
//   2-6 uppercase letters optionally followed by digits/letters (e.g. KRAS, EGFR, CYP3A4, ABCB1)
//   Also matches lowercase equivalents used in text
const GENE_SYMBOL_PATTERN = /\b([A-Z]{2,6}\d*[A-Z0-9]*)\b/g;

// Extract core scientific concepts from a long/sentence query
export function extractCoreConcepts(raw) {
  let text = raw.trim();

  // Strip narrative phrases
  for (const pattern of NARRATIVE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  // Tokenize — preserve hyphenated and slash-separated terms
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s\-\/]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^[-\/]+|[-\/]+$/g, ''))
    .filter(t => t.length >= 3);

  const concepts = [];
  const seen = new Set();

  // Pass 0: preserve gene symbols verbatim from original text (before lowercasing)
  // Gene symbols are typically short uppercase and would be missed by length filters
  const geneMatches = [...text.matchAll(GENE_SYMBOL_PATTERN)]
    .map(m => m[1].toLowerCase());
  for (const sym of geneMatches) {
    if (SCIENTIFIC_CONCEPT_TERMS.has(sym) && !seen.has(sym)) {
      concepts.push(sym);
      seen.add(sym);
    }
  }

  // Pass 1: exact matches to known scientific terms
  for (const token of tokens) {
    if (SCIENTIFIC_CONCEPT_TERMS.has(token) && !seen.has(token)) {
      concepts.push(token);
      seen.add(token);
    }
  }

  // Pass 2: tokens not in stopwords, length ≥ 5
  for (const token of tokens) {
    if (!seen.has(token) && !CONCEPT_STOPWORDS.has(token) && token.length >= 5) {
      if (!/^(about|after|along|among|apart|based|being|beyond|bring|carry|cause|comes|doing|given|going|hence|large|later|leads|light|makes|means|might|needs|often|other|place|plays|quite|range|since|small|taken|under|until|usage|using|where|which|while|whose|wider|within|would)$/.test(token)) {
        concepts.push(token);
        seen.add(token);
      }
    }
  }

  return concepts.slice(0, 15); // cap at 15 concepts
}

// ── Synonym / expansion dictionary ───────────────────────────────────────
const SYNONYMS = new Map([
  // Common names → scientific + related terms
  ["st john's wort",   'Hypericum perforatum hypericin hyperforin'],
  ["st. john's wort",  'Hypericum perforatum hypericin hyperforin'],
  ['hypericum',        'Hypericum perforatum hypericin hyperforin'],
  ['garlic',           'Allium sativum allicin allyl sulfide organosulfur'],
  ['turmeric',         'Curcuma longa curcumin curcuminoids diferuloylmethane'],
  ['ginger',           'Zingiber officinale gingerol shogaol zingerone'],
  ['green tea',        'Camellia sinensis epigallocatechin EGCG catechin polyphenol'],
  ['black seed',       'Nigella sativa thymoquinone thymohydroquinone carvacrol'],
  ['black cumin',      'Nigella sativa thymoquinone thymohydroquinone'],
  ['ginkgo',           'Ginkgo biloba flavonoids terpenoids bilobalide ginkgolides'],
  ['ginseng',          'Panax ginseng ginsenosides panaxadiol saponins'],
  ['echinacea',        'Echinacea purpurea alkylamides polysaccharides cichoric acid'],
  ['milk thistle',     'Silybum marianum silymarin silybin flavonolignan'],
  ['valerian',         'Valeriana officinalis valerenic acid isovaleric valeropetriates'],
  ['ashwagandha',      'Withania somnifera withanolides adaptogens'],
  ['moringa',          'Moringa oleifera isothiocyanates glucosinolates moringin'],
  ['pomegranate',      'Punica granatum punicalagins ellagic acid urolithin'],
  ['resveratrol',      'resveratrol stilbene Vitis vinifera polyphenol sirtuin'],
  ['quercetin',        'quercetin flavonol bioavailability polyphenol anti-inflammatory'],
  ['curcumin',         'curcumin Curcuma longa anti-inflammatory NF-kB turmeric'],
  ['artemisinin',      'artemisinin Artemisia annua antimalarial artesunate artemether'],
  ['cinnamon',         'Cinnamomum verum cinnamaldehyde cinnamic acid cassia'],
  ['licorice',         'Glycyrrhiza glabra glycyrrhizin glycyrrhizinic acid'],
  ['elderberry',       'Sambucus nigra anthocyanins flavonoids immunostimulant'],
  ['berberine',        'berberine Berberis alkaloid isoquinoline anti-diabetic'],
  ['colchicine',       'colchicine Colchicum autumnale alkaloid gout'],
  ['taxol',            'paclitaxel Taxus brevifolia taxane anticancer'],
  ['vincristine',      'vincristine Catharanthus roseus vinca alkaloid chemotherapy'],
  // Drug interaction terms
  ['interaction',      'drug interaction pharmacokinetic herb-drug CYP enzyme'],
  ['herb drug',        'herb-drug interaction pharmacokinetic inhibitor inducer'],
  ['warfarin',         'warfarin anticoagulant bleeding INR coumarin antiplatelet'],
  // Study design abbreviations
  ['rct',              'randomized controlled trial placebo-controlled double-blind'],
  ['sr',               'systematic review meta-analysis evidence synthesis'],
  ['copd',             'chronic obstructive pulmonary disease bronchitis emphysema'],
  ['t2dm',             'type 2 diabetes mellitus insulin resistance hyperglycemia'],
  ['cvd',              'cardiovascular disease heart failure coronary artery disease'],
  ['htn',              'hypertension high blood pressure antihypertensive'],
  ['ibd',              'inflammatory bowel disease Crohn colitis'],
  // Mechanism terms
  ['anti-inflammatory','anti-inflammatory anti-inflammation COX prostaglandin NF-kB cytokine'],
  ['antioxidant',      'antioxidant reactive oxygen species ROS free radical superoxide'],
  ['anticancer',       'anticancer antitumor cytotoxic apoptosis cancer tumor'],
  ['antimicrobial',    'antimicrobial antibacterial antifungal MIC bactericidal'],
  ['antiviral',        'antiviral antivirus viral inhibition replication'],
]);

// ── Stopwords to remove from key-term extraction ─────────────────────────
const STOPWORDS = new Set([
  'a','an','the','in','on','at','of','for','to','by','with',
  'and','or','not','is','are','was','were','be','has','have',
  'do','does','did','that','this','those','these','it','its',
  'about','from','between','among','study','studies','review',
  'effect','effects','role','use','using','based','related',
  'new','novel','recent','current','potential','possible',
  'human','patient','patients','clinical','clinical trial',
  'treatment','therapy','therapeutic','versus','compared',
]);

// ── Concept expansion map — expands single concept to related cluster ────
const CONCEPT_EXPANSIONS = new Map([
  ['cancer',       'cancer tumor neoplasm carcinoma malignant oncology'],
  ['diabetes',     'diabetes mellitus insulin glucose glycemic hyperglycemia'],
  ['inflammation', 'inflammation inflammatory cytokines TNF interleukin NF-kB'],
  ['infection',    'infection bacterial viral fungal antimicrobial antibiotic'],
  ['pain',         'pain analgesic nociception anti-nociceptive'],
  ['anxiety',      'anxiety anxiolytic GABA benzodiazepine stress'],
  ['depression',   'depression antidepressant serotonin dopamine SSRI'],
  ['liver',        'liver hepatic hepatoprotective hepatotoxicity ALT AST'],
  ['kidney',       'kidney renal nephrotoxicity creatinine GFR'],
  ['heart',        'heart cardiac cardioprotective myocardial ischemia'],
  ['alzheimer',    'Alzheimer dementia neurodegeneration amyloid tau cognitive'],
  ['parkinson',    'Parkinson dopaminergic neurodegeneration alpha-synuclein'],
  ['obesity',      'obesity adipose adipogenesis leptin adipokine BMI metabolic'],
]);

// ── Intent detection ──────────────────────────────────────────────────────
export function detectIntent(query) {
  const q = query.toLowerCase();
  if (/interaction|herb.drug|drug.drug|combined|combination/i.test(q)) return 'interaction';
  if (/mechanism|pathway|signaling|molecular|how does|mode of action/i.test(q)) return 'mechanism';
  if (/clinical|trial|rct|patient|human|efficacy|safety|dose/i.test(q)) return 'clinical';
  if (/in vitro|cell|cytotoxic|ic50|ic 50/i.test(q)) return 'in_vitro';
  if (/review|overview|systematic|meta/i.test(q)) return 'review';
  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════════
// GENE QUERY CLASSIFIER — STEPS 0–4
//
// STEP 0: Strip filler words, lowercase everything except gene symbols
// STEP 1: Extract gene symbols via [A-Z0-9]{3,} regex
// STEP 2: Classify into oncogenes / enzymes / transporters; require ≥2 groups
// STEP 3: Auto-add context terms per group
// STEP 4: Build final structured query string
//
// Returns null if not a gene query or invalid (<2 groups).
// Returns GeneQueryResult if valid.
// ═══════════════════════════════════════════════════════════════════════════

// Filler words to strip before gene extraction (STEP 0)
const GENE_FILLER_WORDS = new Set([
  'evidence','suggests','may','role','indicates','study','analysis','that','which',
  'the','a','an','in','on','of','for','to','by','with','and','or','not','is','are',
  'was','were','has','have','be','do','does','did','its','it','this','these','those',
  'could','would','should','can','will','been','being','each','from','about',
  'show','shows','shown','effect','effects','associated','involved','related',
]);

// Known gene/enzyme/transporter symbol registry — maps symbol → group
// Mirrors GENE_GROUPS in biomedical-pipeline.js but keyed for O(1) lookup
const GENE_SYMBOL_REGISTRY = new Map([
  // Oncogenes
  ...['KRAS','EGFR','HER2','ERBB2','BRAF','ALK','MET','ROS1','RET','NTRK',
      'TP53','BRCA1','BRCA2','PTEN','RB1','APC','VHL','CDH1','SMAD4','STK11',
      'MYC','NRAS','HRAS','JAK2','STAT3','CTNNB1','NOTCH1','FBXW7',
      'ABL1','NPM1','FLT3','DNMT3A','TET2','IDH1','IDH2',
      'ERBB3','ERBB4','FGFR1','FGFR2','FGFR3','PDGFRA','PDGFRB','KIT',
      'CDK4','CDKN2A','MDM2','VEGFA','SRC','RAC1','RHOA','GLI1',
  ].map(s => [s, 'oncogene']),
  // Metabolic enzymes
  ...['CYP3A4','CYP2D6','CYP2C9','CYP2C19','CYP1A2','CYP2B6','CYP2E1','CYP2A6',
      'CYP450','UGT1A1','UGT2B7','UGT1A9','SULT1A1','NAT2','TPMT','DPYD','COMT',
      'MAOA','MAOB','ALDH','ADH','GST','NOS','COX2','COX1',
      'CYP3A5','CYP4F2','CYP2J2','UGT1A3','UGT1A4','UGT2B15','FMO3',
      'PON1','BCHE','CES1','CES2','EPHX1','NQO1','HMGCR',
      'AMPK','PARP','HDAC','DNMT','EZH2',
  ].map(s => [s, 'enzyme']),
  // Transporters
  ...['ABCB1','ABCG2','ABCC1','ABCC2','ABCC4','ABCA1','ABCB4','ABCB11',
      'SLCO1B1','SLCO1B3','SLC22A1','SLC22A2','SLC22A6','SLC22A8',
      'OAT1','OAT3','OCT1','OCT2','MATE1','MATE2','ENT1','CNT3',
      'PEPT1','PEPT2','MCT1','MCT4','LAT1','ASCT2','GLUT1','GLUT4',
      'MDR1','MRP1','MRP2','MRP4','BCRP',
  ].map(s => [s, 'transporter']),
]);

// Context terms added automatically per group (STEP 3)
const GROUP_CONTEXT = {
  oncogene:    'oncogene mutation cancer',
  enzyme:      'drug metabolism CYP enzyme',
  transporter: 'drug transport efflux membrane',
};
const MULTI_GROUP_CONTEXT = 'pharmacogenomics';

export function classifyGeneQuery(raw) {
  // STEP 0 — preserve gene symbols before lowercasing
  // Extract [A-Z0-9]{3,} tokens from original cased text first
  const rawTokens = raw.split(/\s+/);
  const symbolCandidates = rawTokens
    .map(t => t.replace(/[^A-Z0-9]/g, ''))
    .filter(t => /^[A-Z][A-Z0-9]{2,}$/.test(t)); // must start with letter, ≥3 chars

  // STEP 1 — classify each candidate against registry
  const groups = { oncogene: [], enzyme: [], transporter: [] };
  for (const sym of symbolCandidates) {
    const group = GENE_SYMBOL_REGISTRY.get(sym);
    if (group && !groups[group].includes(sym)) {
      groups[group].push(sym);
    }
  }

  const activeGroups = Object.entries(groups)
    .filter(([, syms]) => syms.length > 0)
    .map(([g]) => g);

  // Not a gene query if no symbols found
  if (activeGroups.length === 0) return null;

  // STEP 2 — require ≥2 distinct groups for valid gene query
  const isValid = activeGroups.length >= 2;

  // STEP 3 — build context terms
  const contextTerms = [];
  for (const g of activeGroups) {
    contextTerms.push(...GROUP_CONTEXT[g].split(' '));
  }
  if (activeGroups.length >= 2) {
    contextTerms.push(MULTI_GROUP_CONTEXT);
  }

  // STEP 4 — build final query
  const allSymbols = activeGroups.flatMap(g => groups[g]);
  const finalQuery = [...allSymbols, ...new Set(contextTerms)].join(' ');

  return {
    isGeneQuery:   true,
    isValid,
    groups,
    activeGroups,
    allSymbols,
    contextTerms:  [...new Set(contextTerms)],
    finalQuery,
    // invalid message when <2 groups
    invalidReason: isValid ? null : `Only 1 gene group detected (${activeGroups[0]}). Require ≥2 of: oncogene, enzyme, transporter.`,
  };
}

// ── Query normalization pipeline ─────────────────────────────────────────
export function normalizeQuery(raw) {
  const wordCount = raw.trim().split(/\s+/).length;
  const isSentence = wordCount > 12;

  // ── GENE QUERY PATH (STEPS 0–4) ──────────────────────────────────────
  // Check first — gene symbol queries bypass sentence normalization entirely.
  // The gene classifier produces a clean, structured final query.
  const geneClassification = classifyGeneQuery(raw);
  if (geneClassification?.isGeneQuery && geneClassification.isValid) {
    const gq = geneClassification;
    const normalized = gq.finalQuery.toLowerCase();
    const keyTerms = [...gq.allSymbols.map(s => s.toLowerCase()), ...gq.contextTerms.map(s => s.toLowerCase())];
    const allTerms = [...new Set(keyTerms)];
    return {
      original:           raw.trim(),
      normalized,
      keyTerms,
      allTerms,
      intent:             'mechanism',
      expanded:           true,
      conceptExtracted:   true,
      extractedQuery:     gq.finalQuery,
      geneClassification: gq,
    };
  }

  // ── STEP 1: Concept extraction for long queries ───────────────────────
  // Force concept extraction — never search raw sentences
  let workingQuery = raw.trim();
  let conceptExtracted = false;

  if (isSentence) {
    const concepts = extractCoreConcepts(raw);
    if (concepts.length >= 2) {
      workingQuery = concepts.join(' ');
      conceptExtracted = true;
    }
    // If extraction yields < 2 concepts, fall through to standard normalization
    // (query is long but may be a list of terms, not a sentence)
  }

  let q = workingQuery.toLowerCase();

  // Always preserve the original working words before synonym replacement
  const rawTokens = workingQuery.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.replace(/[^\w-]/g, ''));

  // Apply synonym expansions
  const expansions = [];
  for (const [key, expansion] of SYNONYMS) {
    if (q.includes(key)) {
      q = q.replace(key, expansion);
      expansions.push(...expansion.split(' '));
    }
  }

  // Apply concept expansions
  for (const [concept, cluster] of CONCEPT_EXPANSIONS) {
    if (q.includes(concept)) {
      expansions.push(...cluster.split(' '));
    }
  }

  // Remove stopwords from individual tokens
  const tokens = q.split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
  const cleaned = tokens.join(' ');

  const keyTerms = [...new Set([
    ...rawTokens.filter(w => w.length >= 2 && !STOPWORDS.has(w)),
    ...tokens.filter(w => w.length > 3),
  ])];

  const allTerms = [...new Set([
    ...keyTerms,
    ...expansions.filter(w => w.length > 2 && !STOPWORDS.has(w)),
  ])];

  return {
    original:          raw.trim(),
    normalized:        cleaned,
    keyTerms,
    allTerms,
    intent:            detectIntent(workingQuery),
    expanded:          expansions.length > 0,
    conceptExtracted,
    extractedQuery:    conceptExtracted ? workingQuery : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY DECOMPOSITION ENGINE
//
// If query contains multiple mechanisms → split into independent subqueries.
// If query is a sentence → convert to multi-query expansion.
//
// Generates:
//   1. Core query          (entity terms only)
//   2. Mechanism subqueries (entity + each mechanism cluster)
//   3. Entity-mechanism combinations
//
// Returns array of qi-shaped objects. Caller runs retrieval on each in
// parallel, merges pools, then feeds into single pipeline.
// ═══════════════════════════════════════════════════════════════════════════

// Mechanism clusters — semantically grouped for subquery generation.
// Each cluster: { label, terms[] } — terms used to detect presence in query
// and to build focused subquery strings.
const MECHANISM_CLUSTERS = [
  {
    label: 'anti-inflammatory',
    terms: ['anti-inflammatory','nf-kb','nf-κb','cox-2','cox2','prostaglandin',
             'tnf','il-6','il-1','cytokine','interleukin','nlrp3','inflammasome',
             'neuroinflammation','microglia','macrophage','inflammation'],
  },
  {
    label: 'antioxidant',
    terms: ['antioxidant','oxidative stress','reactive oxygen species','ros',
             'free radical','superoxide','malondialdehyde','mda','nrf2',
             'glutathione','catalase','superoxide dismutase','sod','lipid peroxidation'],
  },
  {
    label: 'apoptosis',
    terms: ['apoptosis','caspase','bcl-2','bax','cytochrome c','p53','cell death',
             'programmed death','mitochondrial pathway','intrinsic pathway',
             'extrinsic pathway','death receptor','trail','fas'],
  },
  {
    label: 'autophagy',
    terms: ['autophagy','autophagic','beclin','lc3','mtor','atg','lysosome',
             'mitophagy','selective autophagy','autophagic flux'],
  },
  {
    label: 'serotonergic',
    terms: ['serotonin','serotonergic','5-ht','5ht','ssri','serotonin transporter',
             'sert','serotonin receptor','tryptophan','5-hydroxytryptamine'],
  },
  {
    label: 'dopaminergic',
    terms: ['dopamine','dopaminergic','d1','d2','dopamine receptor','dopamine transporter',
             'dat','tyrosine hydroxylase','levodopa','catecholamine'],
  },
  {
    label: 'gabaergic',
    terms: ['gaba','gabaergic','gaba receptor','gabaa','gabab','benzodiazepine',
             'gaba transaminase','glutamic acid decarboxylase','gad'],
  },
  {
    label: 'neurotrophic',
    terms: ['bdnf','ngf','gdnf','neurotrophic','neurotrophin','trk','p75ntr',
             'neuroplasticity','synaptic plasticity','long-term potentiation','ltp',
             'creb','neuroprotective','neurogenesis'],
  },
  {
    label: 'mitochondrial',
    terms: ['mitochondrial dysfunction','mitochondria','electron transport chain',
             'atp synthesis','membrane potential','mitochondrial membrane',
             'complex i','complex ii','complex iii','complex iv','respiratory chain'],
  },
  {
    label: 'pi3k-akt-mtor',
    terms: ['pi3k','akt','mtor','phosphoinositide','pten','s6k','4ebp1',
             'rapamycin','insulin signaling','igf','growth factor receptor'],
  },
  {
    label: 'mapk',
    terms: ['mapk','erk','jnk','p38','ras','raf','mek','kinase cascade',
             'stress kinase','mitogen-activated'],
  },
  {
    label: 'anticancer',
    terms: ['anticancer','antitumor','cytotoxic','apoptosis','cell cycle arrest',
             'angiogenesis','metastasis','invasion','migration','proliferation',
             'tumor suppressor','oncogene','chemotherapy','cancer'],
  },
  {
    label: 'antimicrobial',
    terms: ['antimicrobial','antibacterial','antifungal','antiviral','mic',
             'bactericidal','bacteriostatic','pathogen','biofilm','resistance'],
  },
  {
    label: 'pharmacokinetic',
    terms: ['bioavailability','pharmacokinetic','absorption','distribution',
             'metabolism','cyp450','cyp3a4','p-glycoprotein','first pass',
             'half-life','clearance','adme'],
  },
  {
    label: 'metabolic',
    terms: ['insulin resistance','glucose','glycolysis','gluconeogenesis','ampk',
             'glut4','ppar','fatty acid','lipogenesis','lipolysis','adipogenesis',
             'diabetes','obesity','metabolic syndrome'],
  },
];

// Detect which mechanism clusters are present in a normalized query string.
// Uses word-boundary matching to avoid substring false positives
// (e.g. "ros" inside "prostaglandin", "il" inside "alkaloid").
function detectMechanismClusters(normalizedText) {
  const text = ' ' + normalizedText.toLowerCase() + ' ';
  return MECHANISM_CLUSTERS.filter(cluster =>
    cluster.terms.some(t => {
      // Wrap term in non-word boundaries (spaces or start/end)
      const escaped = t.replace(/[-/]/g, '\\$&');
      return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i').test(text);
    })
  );
}

// Build a minimal qi-shaped object for a subquery string
function makeSubQi(subQueryStr, parentQi, label) {
  const sub = normalizeQuery(subQueryStr);
  return {
    ...sub,
    // Preserve parent's original for logging/cache purposes
    _parentOriginal: parentQi.original,
    _subqueryLabel:  label,
    // Merge allTerms so post-retrieval pipeline has the full picture
    allTerms: [...new Set([...sub.allTerms, ...parentQi.allTerms])],
  };
}

// Extract entity tokens from a qi (terms NOT matching any mechanism cluster term)
function extractEntityTokens(qi) {
  const allMechanismTerms = new Set(
    MECHANISM_CLUSTERS.flatMap(c => c.terms)
  );
  return qi.keyTerms.filter(t =>
    !allMechanismTerms.has(t.toLowerCase()) && t.length >= 3
  );
}

// ── Main decomposition function ───────────────────────────────────────────
// Returns an array of qi-shaped objects (subqueries) to run retrieval on.
// Returns [qi] unchanged (single-element) when decomposition is not needed.
export function decomposeQuery(qi) {
  // Detect mechanisms from keyTerms only (pre-expansion) to avoid false multi-mechanism
  // signals introduced by synonym expansion (e.g. "antioxidant" added for "anti-inflammatory")
  const keyText   = qi.keyTerms.join(' ');
  const clusters  = detectMechanismClusters(keyText);
  const entities  = extractEntityTokens(qi);
  const isSentence = qi.conceptExtracted;

  // Decompose when: ≥2 mechanism clusters detected, OR sentence input
  const shouldDecompose = clusters.length >= 2 || isSentence;
  if (!shouldDecompose || clusters.length === 0) return [qi];

  const subqueries = [];
  const seen       = new Set();

  function addSub(str, label) {
    const key = str.trim().toLowerCase();
    if (seen.has(key) || !key) return;
    seen.add(key);
    subqueries.push(makeSubQi(str.trim(), qi, label));
  }

  // 1. Core query — entity terms only (no mechanisms)
  if (entities.length > 0) {
    addSub(entities.join(' '), 'core:entities');
  }

  // 2. Full combined query — always included
  addSub(qi.normalized, 'core:full');

  // 3. One subquery per detected mechanism cluster (entity + cluster label)
  //    Cap at 3 mechanism subqueries to control API budget
  const mechSubset = clusters.slice(0, 3);
  for (const cluster of mechSubset) {
    const entityPart = entities.slice(0, 4).join(' ');
    const mechPart   = cluster.label;
    const subStr     = entityPart
      ? `${entityPart} ${mechPart}`
      : mechPart;
    addSub(subStr, `mechanism:${cluster.label}`);
  }

  // 4. Entity-mechanism combinations for top 2 clusters
  if (entities.length > 0 && clusters.length >= 2) {
    const top2 = clusters.slice(0, 2);
    const entityStr = entities.slice(0, 3).join(' ');
    addSub(
      `${entityStr} ${top2[0].label} ${top2[1].label}`,
      `combo:${top2[0].label}+${top2[1].label}`
    );
  }

  // Cap total subqueries at 5 to stay within API budget
  return subqueries.slice(0, 5);
}

// ── Domain boost weights ─────────────────────────────────────────────────
export const DOMAIN_BOOST = {
  'Pharmacognosy':   1.20,
  'Natural Products': 1.15,
  'Phytochemistry':  1.10,
  'Pharmacology':    1.05,
  'Pharmaceutics':   1.0,
  'Biology':         0.95,
};

// ── Content-type priority weights ─────────────────────────────────────────
export const CONTENT_TYPE_WEIGHT = {
  'Guideline':    1.30,
  'Clinical Trial': 1.20,
  'Meta-analysis': 1.20,
  'Systematic Review': 1.15,
  'RCT':          1.15,
  'Article':      1.0,
  'Book Chapter': 0.90,
  'Patent':       0.70,
  'Other':        0.85,
};
