// ═══════════════════════════════════════════════════════════════════════════
// BIOMEDICAL PIPELINE — 4-step filter + scoring layer
//
// Step 0: Domain hard filter — reject non-biomedical results
// Step 1: Exact match — keyword in title OR abstract (highest priority)
// Step 2: Secondary match — activated only when Step 1 yields nothing
// Step 3: Keyword anchoring — neuroscience queries require ≥2 anchor terms
// Step 4: Relevance scoring — additive scores; keep only score ≥ 8
// ═══════════════════════════════════════════════════════════════════════════

// ── Step 0: Non-biomedical content patterns (title/journal/keyword level) ─
// Applied regardless of the domain label — classifiers can mislabel
const NON_BIOMEDICAL_PATTERNS = [
  /\b(marketing strateg|brand awareness|consumer behav|customer relation|customer.based|sales strateg|market segmentation|market share)/i,
  /\b(human resources|HR management|talent acquisition|employee retention|workforce planning|organizational behav)/i,
  /\b(financial statement|balance sheet|stock market|investment strateg|portfolio manag|capital market|asset pricing)/i,
  /\b(business administration|supply chain|logistics management|operations management|business performance|firm performance)/i,
  /\b(pedagogical|curriculum design|e-learning|student learning|academic performance|classroom|higher education.*learning)/i,
  /\b(sociolog|ethnograph|qualitative research.*social|focus group.*social|social capital|social media strateg)/i,
  /\b(legal framework|jurisprudence|constitutional law|criminal law|civil law)\b/i,
  /\b(architecture design|urban planning|real estate market|construction management)/i,
  /\b(machine learning.*image classif|deep learning.*object detect|computer vision.*recognition|natural language processing.*text classif)/i,
  /\b(tourism destination|hospitality industry|hotel management|travel behavior)/i,
  /\b(corporate governance|stakeholder theory|shareholder value|mergers? and acquisitions?)/i,
  /\b(strategic management|competitive advantage|business strateg|organizational strateg)/i,
];

// Biomedical signal terms — a paper must contain at least one, OR come from
// a trusted biomedical source
const BIOMEDICAL_SIGNALS = [
  'pharmacol', 'drug', 'medicine', 'clinical', 'patient', 'disease', 'therapy',
  'treatment', 'diagnosis', 'symptom', 'syndrome', 'molecular', 'cell', 'gene',
  'protein', 'enzyme', 'receptor', 'pathway', 'biomarker', 'plasma', 'serum',
  'cancer', 'tumor', 'carcinoma', 'oncol', 'chemotherapy', 'radiation',
  'infect', 'bacteria', 'virus', 'fungal', 'pathogen', 'antibiotic', 'antiviral',
  'inflam', 'cytokine', 'immune', 'antibody', 'antigen', 'vaccine',
  'metabol', 'biochem', 'pharma', 'toxicol', 'oxidative', 'antioxidant',
  'neural', 'neuro', 'brain', 'cognitive', 'psychiatric', 'dopamine', 'serotonin',
  'cardiovascular', 'cardiac', 'hypertension', 'diabetes', 'insulin',
  'hepat', 'renal', 'pulmonar', 'respiratory', 'gastrointestinal',
  'herb', 'plant', 'phyto', 'extract', 'alkaloid', 'flavonoid', 'terpenoid',
  'nanoparticle', 'formulation', 'bioavailability', 'pharmacokinetic',
  'in vitro', 'in vivo', 'randomized', 'placebo', 'double-blind',
  'systematic review', 'meta-analysis', 'clinical trial',
];

// Biomedical journals — any result from these is always accepted
const BIOMEDICAL_JOURNAL_SIGNALS = [
  'journal', 'medicine', 'medical', 'clinical', 'pharmacol', 'biomed',
  'biochem', 'cell', 'molecular', 'nature', 'lancet', 'plos', 'frontiers',
  'toxicol', 'oncol', 'neuro', 'immun', 'pathol', 'physiol', 'nutrit',
];

const BIOMEDICAL_SOURCES = new Set(['pubmed', 'clinicaltrials', 'semanticscholar']);

export function passesDomainFilter(paper) {
  const sources = paper.source || [];

  // Hard reject on non-biomedical title patterns — applied to ALL sources
  if (NON_BIOMEDICAL_PATTERNS.some(p => p.test(paper.title || ''))) return false;

  // PubMed / MEDLINE — always biomedical after pattern check
  if (sources.includes('pubmed') || paper.pmid) return true;

  const journalLower = (paper.journal || '').toLowerCase();

  // ClinicalTrials — accept only if journal/title contains biomedical signals
  // (CT can return nutrition, education, and social science trials)
  if (sources.includes('clinicaltrials')) {
    const ctText = ((paper.title || '') + ' ' + (paper.abstract || '') + ' ' + journalLower).toLowerCase();
    return BIOMEDICAL_SIGNALS.some(sig => ctText.includes(sig));
  }

  // Accept if journal name contains biomedical signal
  if (BIOMEDICAL_JOURNAL_SIGNALS.some(s => journalLower.includes(s))) return true;

  // For all other sources (Semantic Scholar, CrossRef, OpenAlex):
  // require at least one biomedical signal in searchable text
  const searchableText = [
    paper.title    || '',
    paper.abstract || '',
    paper.journal  || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();

  return BIOMEDICAL_SIGNALS.some(sig => searchableText.includes(sig));
}

// ── Step 1/2: Exact vs secondary match classification ────────────────────
// Returns 1 (exact: keyword in title or abstract) or 2 (secondary)
export function classifyMatchStep(paper, keyTerms) {
  if (!keyTerms?.length) return 2;
  const kws   = keyTerms.map(w => w.toLowerCase());
  const title = (paper.title    || '').toLowerCase();
  const abst  = (paper.abstract || '').toLowerCase();
  if (kws.some(w => title.includes(w) || abst.includes(w))) return 1;
  return 2;
}

// ── Botanical context filter ──────────────────────────────────────────────
// When the query is botanical in nature, every result MUST contain at least
// one botanical/phytochemical/plant-derived signal. Results without → DROP.
const BOTANICAL_QUERY_SIGNALS = [
  'botanical', 'phytochemical', 'plant-derived', 'plant derived', 'herbal',
  'medicinal plant', 'natural product', 'phytotherapy', 'ethnopharmacology',
  'pharmacognosy', 'phytomedicine', 'plant extract', 'herb', 'alkaloid',
  'flavonoid', 'terpenoid', 'polyphenol', 'phenolic', 'saponin', 'tannin',
  'essential oil', 'nutraceutical', 'phytocompound', 'plant compound',
  'curcumin', 'quercetin', 'resveratrol', 'berberine', 'artemisinin',
  'silymarin', 'ginsenoside', 'withanolide', 'thymoquinone', 'piperine',
  'curcuma', 'zingiber', 'allium', 'panax', 'nigella', 'hypericum',
  'silybum', 'withania', 'camellia sinensis', 'ginkgo', 'valerian',
  'polypharmacology', 'network pharmacology', 'multi-target',
];

const BOTANICAL_RESULT_SIGNALS = [
  'plant', 'herb', 'botanical', 'phytochem', 'phyto', 'natural product',
  'alkaloid', 'flavonoid', 'terpenoid', 'polyphenol', 'phenolic', 'saponin',
  'tannin', 'anthocyanin', 'stilbene', 'coumarin', 'isoflavone', 'lignan',
  'essential oil', 'extract', 'curcum', 'quercetin', 'resveratrol', 'berberine',
  'artemisinin', 'silymarin', 'ginsenoside', 'withanolide', 'thymoquinone',
  'piperine', 'eugenol', 'camphor', 'menthol', 'limonene', 'linalool',
  'medicinal', 'ethnopharmacol', 'pharmacognosy', 'nutraceutical',
  'traditional medicine', 'ayurvedic', 'chinese medicine', 'folk medicine',
];

export function isBotanicalQuery(keyTerms, allTerms) {
  const combined = [...(keyTerms || []), ...(allTerms || [])]
    .map(w => w.toLowerCase()).join(' ');
  return BOTANICAL_QUERY_SIGNALS.some(sig => combined.includes(sig));
}

export function passesBotanicalFilter(paper, isBotanical) {
  if (!isBotanical) return true; // filter only active for botanical queries
  const text = [
    paper.title    || '',
    paper.abstract || '',
    paper.journal  || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();
  return BOTANICAL_RESULT_SIGNALS.some(sig => text.includes(sig));
}

// ── Step 3: Neuroscience keyword anchoring ────────────────────────────────
// Only active when the query is demonstrably neuroscience-domain.
// Requires ≥2 of the anchor terms to appear in the paper text.
const NEURO_QUERY_SIGNALS = [
  'serotonin', 'dopamine', 'norepinephrine', 'noradrenaline',
  'mitochondrial dysfunction', 'mitochondria', 'oxidative stress',
  'microglia', 'neuroinflammation', 'neurodegenerative', 'alzheimer',
  'parkinson', 'depression', 'anxiety', 'schizophrenia', 'autism',
  'neuroprotect', 'neurogenesis', 'synapt', 'glutamate', 'gaba',
  'blood-brain barrier', 'bbb', 'hippocampus', 'amygdala', 'cortex',
];

const ANCHOR_TERMS = [
  'serotonin', 'dopamine', 'mitochondrial dysfunction', 'oxidative stress',
  'microglia', 'neuroinflammation',
];

export function isNeuroscienceQuery(keyTerms, allTerms) {
  const combined = [...(keyTerms || []), ...(allTerms || [])]
    .map(w => w.toLowerCase()).join(' ');
  const matchCount = NEURO_QUERY_SIGNALS.filter(sig => combined.includes(sig)).length;
  return matchCount >= 2;
}

export function passesAnchorFilter(paper, isNeuro) {
  if (!isNeuro) return true; // anchoring only active for neuro queries
  const text = [
    paper.title    || '',
    paper.abstract || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();
  const matched = ANCHOR_TERMS.filter(a => text.includes(a)).length;
  return matched >= 2;
}

// ── Concept Coherence Filter ──────────────────────────────────────────────
// Runs AFTER retrieval, BEFORE scoring.
// Extracts concept groups from the query:
//   Entity    — what compound/herb/class is being queried
//   Mechanism — what pharmacological/biochemical mechanism
//   System    — what physiological system or pathway
//
// A result MUST match ≥1 entity + ≥1 mechanism.
// Entity mismatch → REJECT immediately.

// Entity group: compound classes, herbs, phytochemicals
const ENTITY_TERMS = [
  // Compound classes
  'phytochemical','botanical','herbal','flavonoid','alkaloid','terpenoid','polyphenol',
  'phenolic','saponin','tannin','anthocyanin','stilbene','coumarin','lignan','isoflavone',
  'essential oil','plant extract','natural product','nutraceutical',
  // Named compounds
  'curcumin','quercetin','resveratrol','berberine','artemisinin','silymarin',
  'ginsenoside','withanolide','thymoquinone','piperine','epigallocatechin','egcg',
  'allicin','gingerol','eugenol','apigenin','luteolin','kaempferol','naringenin',
  'catechin','rutin','hesperidin','emodin','baicalein','wogonin','oroxylin',
  'hypericin','hyperforin','valerenic acid','andrographolide','boswellic acid',
  // Drug classes (pharmaceutical entities)
  'antibiotic','antiviral','antifungal','anticancer','anti-inflammatory','antioxidant',
  'antidiabetic','antihypertensive','neuroprotective','hepatoprotective',
  'immunomodulatory','anticoagulant','analgesic','sedative','anxiolytic',
  // Conventional drugs (when queried as entity)
  'metformin','aspirin','ibuprofen','paracetamol','warfarin','statins',
  'insulin','glucocorticoid','nsaid','ssri','snri','maoi',
];

// Mechanism group: pharmacological / biochemical mechanisms
const MECHANISM_TERMS = [
  // Signaling pathways
  'nf-kb','nf-κb','nfkb','mapk','pi3k','akt','mtor','jak-stat','wnt','hedgehog',
  'notch','p53','bcl-2','caspase','cytochrome c','erk','jnk','p38',
  // Neurotransmitter / receptor systems
  'serotonin','serotonergic','dopamine','dopaminergic','gaba','gabaergic',
  'glutamate','glutamatergic','acetylcholine','cholinergic','norepinephrine',
  'adrenergic','opioid','cannabinoid','adenosine','histamine',
  // Receptor types
  'receptor','agonist','antagonist','inhibitor','inducer','modulator','ligand',
  'binding','affinity','ic50','ki','ec50',
  // Cellular mechanisms
  'apoptosis','autophagy','necrosis','ferroptosis','pyroptosis','senescence',
  'oxidative stress','ros','reactive oxygen species','free radical','lipid peroxidation',
  'mitochondrial dysfunction','mitochondria','electron transport','atp synthesis',
  'endoplasmic reticulum stress','unfolded protein response',
  'dna damage','dna repair','cell cycle','g1','s phase','g2','mitosis',
  'angiogenesis','metastasis','invasion','migration','proliferation',
  // Inflammation mechanisms
  'cytokine','interleukin','il-6','il-1','tnf','interferon','chemokine',
  'cox-2','cox2','prostaglandin','leukotriene','arachidonic acid',
  'nlrp3','inflammasome','nod','toll-like receptor','tlr',
  'microglia','macrophage','neutrophil','lymphocyte','t cell','b cell','nk cell',
  // Metabolic mechanisms
  'insulin resistance','glucose uptake','glycolysis','gluconeogenesis',
  'lipogenesis','lipolysis','fatty acid oxidation','beta oxidation',
  'ampk','glut4','ppar','lxr','foxo',
  // Epigenetic / gene regulation
  'histone','methylation','acetylation','epigenetic','microrna','mirna','sirna',
  'transcription factor','gene expression','mrna','protein expression',
  // Bioavailability / PK mechanisms
  'bioavailability','pharmacokinetic','absorption','distribution','metabolism',
  'cyp450','cyp3a4','p-glycoprotein','first pass','half-life','clearance',
];

// System group: physiological systems and pathways
const SYSTEM_TERMS = [
  'stress system','hpa axis','hypothalamic','neurotrophic','bdnf','ngf','gdnf',
  'immune system','adaptive immunity','innate immunity','complement system',
  'cardiovascular system','renin-angiotensin','coagulation cascade',
  'gastrointestinal','gut microbiome','microbiota','intestinal barrier',
  'liver','hepatic','renal','kidney','pulmonary','respiratory','endocrine',
  'nervous system','central nervous system','peripheral nervous system',
  'blood-brain barrier','bbb','neuroplasticity','synaptic plasticity',
  'hypothalamus','pituitary','adrenal','thyroid','pancreas',
];

// Domain-specific entities that FORCE their presence in results when queried
const DOMAIN_SPECIFIC_ENTITIES = [
  'phytochemical', 'herbal', 'botanical', 'plant-derived', 'plant derived',
  'natural product', 'medicinal plant', 'phytotherapy', 'ethnopharmacology',
  'pharmacognosy',
];

// Extract which concept groups are present in the query terms
export function extractQueryConceptGroups(keyTerms, allTerms) {
  const combined = [...(keyTerms || []), ...(allTerms || [])]
    .map(w => w.toLowerCase()).join(' ');

  const entities   = ENTITY_TERMS.filter(t => combined.includes(t));
  const mechanisms = MECHANISM_TERMS.filter(t => combined.includes(t));
  const systems    = SYSTEM_TERMS.filter(t => combined.includes(t));

  // Domain-specific entities present in query (these FORCE results to contain them)
  const forcedEntities = DOMAIN_SPECIFIC_ENTITIES.filter(t => combined.includes(t));

  return {
    hasEntities:    entities.length   > 0,
    hasMechanisms:  mechanisms.length > 0,
    hasSystems:     systems.length    > 0,
    entities,
    mechanisms,
    systems,
    forcedEntities,
    hasForcedEntities: forcedEntities.length > 0,
    // Coherence check is active only when query has both entity AND mechanism concepts
    coherenceActive: entities.length > 0 && mechanisms.length > 0,
  };
}

// Check if a paper's text contains a concept term from a given list
function paperContainsConcept(paper, terms) {
  if (!terms.length) return false;
  const text = [
    paper.title    || '',
    paper.abstract || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();
  return terms.some(t => text.includes(t));
}

export function passesCoherenceFilter(paper, conceptGroups) {
  // Coherence filter only active when query has both entity + mechanism groups
  if (!conceptGroups.coherenceActive) return true;

  const text = [
    paper.title    || '',
    paper.abstract || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();

  const hasEntity    = conceptGroups.entities.some(t => text.includes(t));
  const hasMechanism = conceptGroups.mechanisms.some(t => text.includes(t));

  // Must match ≥1 entity + ≥1 mechanism
  if (!hasEntity || !hasMechanism) return false;

  // If query contains domain-specific entity (phytochemical/herbal/botanical),
  // FORCE that entity to appear in results — missing → DROP
  if (conceptGroups.hasForcedEntities) {
    const hasForcedEntity = conceptGroups.forcedEntities.some(t => text.includes(t));
    if (!hasForcedEntity) return false;
  }

  return true;
}

// ── Entity Boosting (BM25 override) ──────────────────────────────────────
// Applied inside computePipelineScore when query contains domain-specific entities.
// +8  → domain entity in title
// +5  → domain entity in abstract
// -15 → domain entity missing completely (forced entity absent)
function computeEntityBoost(paper, conceptGroups) {
  if (!conceptGroups.hasForcedEntities) return 0;

  const title = (paper.title    || '').toLowerCase();
  const abst  = (paper.abstract || '').toLowerCase();

  const inTitle    = conceptGroups.forcedEntities.some(t => title.includes(t));
  const inAbstract = conceptGroups.forcedEntities.some(t => abst.includes(t));
  const inAnyText  = inTitle || inAbstract || (() => {
    const rest = [...(paper.mesh_terms || []), ...(paper.keywords || [])]
      .join(' ').toLowerCase();
    return conceptGroups.forcedEntities.some(t => rest.includes(t));
  })();

  if (inTitle)    return +8;
  if (inAbstract) return +5;
  if (!inAnyText) return -15;
  return 0;
}

// ── Gene / Structured Entity System (STEP 5) ─────────────────────────────
// Detects gene symbols, enzymes, and transporters in a query.
// Groups them into three buckets:
//   oncogenes   — driver mutations and tumour suppressor genes
//   enzymes     — CYP/UGT/metabolic enzymes
//   transporters — ABC/SLC membrane transporters
//
// Multi-group enforcement:
//   When ≥2 gene groups are present in the query, a result MUST match ≥2 groups.
//   Single-group match → downrank (−5 to pipeline score).
//
// Gene-aware boosting (BM25 override):
//   +8  → any query gene symbol found in title
//   +5  → found in abstract only
//   −12 → none of the query gene symbols present anywhere in paper text

const GENE_GROUPS = {
  oncogenes: new Set([
    'kras','egfr','her2','erbb2','braf','alk','met','ros1','ret','ntrk',
    'tp53','brca1','brca2','pten','rb1','apc','vhl','cdh1','smad4','stk11',
    'myc','nras','hras','jak2','stat3','ctnnb1','notch1','fbxw7',
    'abl1','bcr-abl','pml-rara','npm1','flt3','dnmt3a','tet2','idh1','idh2',
    'erbb3','erbb4','fgfr1','fgfr2','fgfr3','pdgfra','pdgfrb','kit','cdk4',
    'cdkn2a','mdm2','vegfa','vegfr2','src','fak','rac1','rho','rhoa',
    'wnt1','wnt3a','β-catenin','axin','gsk3b','gli1','shh','smo','ptch1',
  ]),
  enzymes: new Set([
    'cyp3a4','cyp2d6','cyp2c9','cyp2c19','cyp1a2','cyp2b6','cyp2e1','cyp2a6',
    'cyp450','ugt1a1','ugt2b7','ugt1a9','sult1a1','nat2','tpmt','dpyd','comt',
    'mao-a','mao-b','aldh','adh','gst','nos','cox-2','cox-1','cox2','cox1',
    'cyp3a5','cyp4f2','cyp2j2','ugt1a3','ugt1a4','ugt2b15','fmo3',
    'pon1','bche','achs','ces1','ces2','ephx1','nqo1','hmgcr',
    'ampk','parp','hdac','dnmt','ezh2','lsd1','kdm5c','hat',
  ]),
  transporters: new Set([
    'abcb1','abcg2','abcc1','abcc2','abcc4','abca1','abcb4','abcb11',
    'slco1b1','slco1b3','slc22a1','slc22a2','slc22a6','slc22a8',
    'p-glycoprotein','pgp','mdr1','mrp1','mrp2','mrp4','bcrp',
    'oatp1b1','oatp1b3','oatp2b1','oat1','oat3','oct1','oct2',
    'mate1','mate2','ent1','cnt3','pept1','pept2','mct1','mct4',
    'lat1','4f2hc','asct2','slc7a5','slc1a5','glut1','glut4',
  ]),
};

// Detect which gene groups are present in a combined query text string
export function detectGeneGroups(keyTerms, allTerms) {
  const combined = [...(keyTerms || []), ...(allTerms || [])]
    .map(w => w.toLowerCase());
  const combinedSet = new Set(combined);
  const combinedStr = combined.join(' ');

  const result = { oncogenes: [], enzymes: [], transporters: [] };

  for (const [group, symbols] of Object.entries(GENE_GROUPS)) {
    for (const sym of symbols) {
      // Word-boundary check to avoid partial matches
      const escaped = sym.replace(/[-]/g, '\\-');
      const re = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i');
      if (combinedSet.has(sym) || re.test(combinedStr)) {
        result[group].push(sym);
      }
    }
  }

  const activeGroups = Object.entries(result)
    .filter(([, hits]) => hits.length > 0)
    .map(([name]) => name);

  return {
    oncogenes:    result.oncogenes,
    enzymes:      result.enzymes,
    transporters: result.transporters,
    activeGroups,
    isGeneQuery:    activeGroups.length > 0,
    multiGroup:     activeGroups.length >= 2,
    allQueryGenes:  [...result.oncogenes, ...result.enzymes, ...result.transporters],
  };
}

// Multi-group enforcement + gene-aware scoring adjustment
// Returns a delta to add to the pipeline score (can be negative).
export function computeGeneGroupScore(paper, geneGroups) {
  if (!geneGroups.isGeneQuery) return 0;

  const title = (paper.title    || '').toLowerCase();
  const abst  = (paper.abstract || '').toLowerCase();
  const rest  = [
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();
  const fullText = title + ' ' + abst + ' ' + rest;

  const allGenes = geneGroups.allQueryGenes;

  // Gene-aware boosting
  const inTitle    = allGenes.some(g => {
    const re = new RegExp(`(?<![\\w-])${g.replace(/[-]/g,'\\-')}(?![\\w-])`, 'i');
    return re.test(title);
  });
  const inAbstract = !inTitle && allGenes.some(g => {
    const re = new RegExp(`(?<![\\w-])${g.replace(/[-]/g,'\\-')}(?![\\w-])`, 'i');
    return re.test(abst);
  });
  const inAny = inTitle || inAbstract || allGenes.some(g => {
    const re = new RegExp(`(?<![\\w-])${g.replace(/[-]/g,'\\-')}(?![\\w-])`, 'i');
    return re.test(fullText);
  });

  let delta = 0;
  if (inTitle)         delta += 8;
  else if (inAbstract) delta += 5;
  else if (!inAny)     delta -= 12;

  // Multi-group enforcement: when query spans ≥2 gene groups,
  // count how many groups have a match in this paper
  if (geneGroups.multiGroup) {
    let matchedGroups = 0;
    for (const [group, symbols] of Object.entries(GENE_GROUPS)) {
      if (!geneGroups[group]?.length) continue; // group not in query
      const hasGroupMatch = symbols.size > 0 && [...symbols].some(g => {
        if (!geneGroups[group].includes(g)) return false; // only check query genes in this group
        const re = new RegExp(`(?<![\\w-])${g.replace(/[-]/g,'\\-')}(?![\\w-])`, 'i');
        return re.test(fullText);
      });
      if (hasGroupMatch) matchedGroups++;
    }
    // Fewer than 2 groups matched → downrank
    if (matchedGroups < 2) delta -= 5;
  }

  return delta;
}

// ── Step 4: Pipeline relevance score ─────────────────────────────────────
// Independent additive score used for the ≥8 threshold.
// Intentionally separate from the existing computeFinalScore system.
// conceptGroups and geneGroups are optional — when provided, entity/gene
// boosting is applied.
export function computePipelineScore(paper, keyTerms, conceptGroups, geneGroups) {
  let score = 0;

  const kws   = (keyTerms || []).map(w => w.toLowerCase());
  const title = (paper.title    || '').toLowerCase();
  const abst  = (paper.abstract || '').toLowerCase();
  const refs  = [...(paper.mesh_terms || []), ...(paper.keywords || [])].join(' ').toLowerCase();

  const inTitle    = kws.some(w => title.includes(w));
  const inAbstract = kws.some(w => abst.includes(w));
  const inFullText = kws.some(w => refs.includes(w));
  const inRefs     = paper._is_reference || paper._is_citation;

  if (inTitle)    score += 5;
  if (inAbstract) score += 3;
  if (inFullText) score += 2;
  if (inRefs)     score += 1;

  // Source bonus
  const sources = paper.source || [];
  if (sources.includes('pubmed') || paper.pmid) score += 5;

  // Study type bonus
  const st = (paper.study_type || '').toLowerCase();
  if (st.includes('rct') || st.includes('clinical') || st.includes('trial') ||
      st.includes('systematic') || st.includes('meta')) {
    score += 3; // clinical study
  } else if (st.includes('mechanistic') || st.includes('in vitro') ||
             st.includes('animal') || st.includes('pharmacokinetic')) {
    score += 2; // mechanistic study
  }

  // Entity boosting (BM25 override) — applied when query has forced domain entities
  if (conceptGroups) {
    score += computeEntityBoost(paper, conceptGroups);
  }

  // Gene-aware boosting + multi-group enforcement
  if (geneGroups) {
    score += computeGeneGroupScore(paper, geneGroups);
  }

  // Non-biomedical penalty (hard exclusion via domain filter, but score it too)
  if (!passesDomainFilter(paper)) score -= 10;

  return score;
}

// ── Gene hard filter (STEP 6) ─────────────────────────────────────────────
// Active only when query is a multi-group gene query (≥2 gene groups).
// A paper is rejected when ALL of the following are true:
//   - it matches fewer than 2 of the queried gene groups in its full text
//   - it lacks drug/metabolism/genetic context signals
//
// This prevents papers about a single gene in a completely unrelated context
// from appearing when the query spans multiple pharmacogenomic layers.

const GENE_CONTEXT_SIGNALS = [
  'drug','metabol','pharma','transport','resistance','interaction',
  'genetic','genomic','mutation','variant','polymorphism','genotype',
  'expression','inhibit','inducer','substrate','clearance','disposition',
];

function passesGeneHardFilter(paper, geneGroups) {
  if (!geneGroups.isGeneQuery || !geneGroups.multiGroup) return true;

  const text = [
    paper.title    || '',
    paper.abstract || '',
    ...(paper.mesh_terms || []),
    ...(paper.keywords   || []),
  ].join(' ').toLowerCase();

  // Count how many queried gene groups are present in paper text
  let matchedGroups = 0;
  for (const group of geneGroups.activeGroups) {
    const querySymbols = geneGroups[group] || [];
    if (querySymbols.some(sym => {
      const re = new RegExp(`(?<![\\w-])${sym.replace(/[-]/g,'\\-')}(?![\\w-])`, 'i');
      return re.test(text);
    })) {
      matchedGroups++;
    }
  }

  if (matchedGroups >= 2) return true;

  // Fewer than 2 groups matched — check for drug/metabolism/genetic context
  const hasContext = GENE_CONTEXT_SIGNALS.some(sig => text.includes(sig));
  return hasContext;
}

// ── Master pipeline filter ────────────────────────────────────────────────
// Takes the full deduplicated pool and returns results classified by step,
// filtered by domain, anchoring (if neuro), and score threshold.
//
// Returns { step1, step2, hasExactMatches, isEmpty }
// - step1: papers with exact keyword match in title/abstract, score ≥ 8
// - step2: remaining papers, score ≥ 8 (only used when step1 is empty)
// - hasExactMatches: true when step1 is non-empty
// - isEmpty: true when both step1 and step2 are empty after all filters
export function applyBiomedicalPipeline(papers, keyTerms, allTerms) {
  const isNeuro       = isNeuroscienceQuery(keyTerms, allTerms);
  const isBotanical   = isBotanicalQuery(keyTerms, allTerms);
  const conceptGroups = extractQueryConceptGroups(keyTerms, allTerms);
  const geneGroups    = detectGeneGroups(keyTerms, allTerms);

  const step1 = [];
  const step2 = [];

  for (const paper of papers) {
    // Step 0 — domain hard filter
    if (!passesDomainFilter(paper)) continue;

    // Botanical context filter — drop results lacking plant/phytochemical signals
    if (!passesBotanicalFilter(paper, isBotanical)) continue;

    // Concept coherence filter (after retrieval, before scoring):
    // result must match ≥1 entity + ≥1 mechanism from query concept groups.
    // Forced domain entities (phytochemical/herbal/botanical) → DROP if absent.
    if (!passesCoherenceFilter(paper, conceptGroups)) continue;

    // Step 3 — anchor filter (neuro queries only)
    if (!passesAnchorFilter(paper, isNeuro)) continue;

    // Gene hard filter (STEP 6): for multi-group gene queries, reject papers
    // that match <2 gene groups AND lack drug/metabolism/genetic context.
    if (!passesGeneHardFilter(paper, geneGroups)) continue;

    // Step 4 — score threshold (includes entity + gene-aware boosting)
    const pScore = computePipelineScore(paper, keyTerms, conceptGroups, geneGroups);
    if (pScore < 8) continue;

    // Step 1 vs 2 classification
    const step = classifyMatchStep(paper, keyTerms);
    const tagged = { ...paper, _pipeline_step: step, _pipeline_score: pScore };

    if (step === 1) {
      step1.push(tagged);
    } else {
      step2.push(tagged);
    }
  }

  const hasExactMatches = step1.length > 0;
  const isEmpty         = step1.length === 0 && step2.length === 0;

  return { step1, step2, hasExactMatches, isEmpty, isNeuro, isBotanical, conceptGroups, geneGroups };
}
