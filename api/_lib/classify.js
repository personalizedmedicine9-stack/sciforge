// ── Study type classification ─────────────────────────────────────────────
const STUDY_TYPES = [
  { pattern: /meta.?analy/i,                        type: 'Meta-analysis',               level: 'A' },
  { pattern: /systematic.?review/i,                 type: 'Systematic Review',           level: 'A' },
  { pattern: /\brct\b|randomized.{0,10}trial|randomised.{0,10}trial|randomized controlled/i, type: 'RCT', level: 'A' },
  { pattern: /\bcohort\b/i,                         type: 'Cohort Study',                level: 'B' },
  { pattern: /case.control/i,                       type: 'Case-Control',                level: 'B' },
  { pattern: /case report|case series/i,            type: 'Case Report',                 level: 'C' },
  { pattern: /in.?vitro|cell line|cell culture|cell-based/i, type: 'In Vitro',          level: 'D' },
  { pattern: /\bin vivo\b|animal model|rat model|mouse model|mice|murine|rodent/i, type: 'Animal Study', level: 'D' },
  { pattern: /pharmacokinetic|bioavailability|ADME|absorption|distribution|metabolism/i, type: 'Pharmacokinetic Study', level: 'D' },
  { pattern: /formulat|nanoparticle|liposome|nanocapsul|encapsulat|nanoemul/i, type: 'Formulation Study', level: 'D' },
  { pattern: /mechanism|molecular pathway|signaling pathway|molecular docking/i, type: 'Mechanistic Study', level: 'D' },
];

const DOMAINS = [
  { pattern: /pharmacokinet|bioavailability|ADME|drug metabolism|cytochrome|CYP450/i,    domain: 'Pharmacology' },
  { pattern: /formulat|nanoparticle|liposome|tablet|capsule|drug delivery|controlled release/i, domain: 'Pharmaceutics' },
  { pattern: /phytochem|alkaloid|flavonoid|terpenoid|phenolic|saponin|secondary metabol/i, domain: 'Phytochemistry' },
  { pattern: /ethnopharmacol|herbal medicine|medicinal plant|traditional medicine|folk medicine/i, domain: 'Pharmacognosy' },
  { pattern: /natural product|plant extract|botanical|plant-derived|phytocompound/i,     domain: 'Natural Products' },
  { pattern: /pharmacol|anti.?inflamm|antiox|cytotoxic|anti.?cancer|anti.?microbial|anti.?viral|receptor|agonist|antagonist/i, domain: 'Pharmacology' },
  { pattern: /molecular biology|gene expression|protein|enzyme|pathway|signaling|genomic|proteom/i, domain: 'Biology' },
];

// Journal quality lists
const HIGH_IMPACT_JOURNALS = new Set([
  'nature','lancet','jama','new england journal of medicine','nejm','science','cell',
  'bmj','annals of internal medicine','circulation','journal of clinical oncology',
  'gut','hepatology','diabetes care','gastroenterology','blood','brain',
  'annals of oncology','european heart journal','journal of hepatology',
  'clinical infectious diseases','american journal of respiratory and critical care medicine',
  'chest','kidney international','journal of the american college of cardiology',
  'plos medicine','clinical pharmacology and therapeutics',
  'british journal of pharmacology','journal of medicinal chemistry',
  'biomaterials','advanced materials','acta pharmaceutica sinica b',
  'phytomedicine','journal of ethnopharmacology','food and chemical toxicology',
  'molecular pharmacology','journal of pharmacology and experimental therapeutics',
  'international journal of pharmaceutics','journal of controlled release',
]);

const MEDIUM_IMPACT_JOURNALS = new Set([
  'plos one','scientific reports','frontiers in pharmacology','frontiers in chemistry',
  'molecules','nutrients','international journal of molecular sciences',
  'evidence-based complementary and alternative medicine',
  'journal of natural products','phytotherapy research','fitoterapia',
  'natural product research','pharmacognosy magazine','pharmacognosy reviews',
  'drug design development and therapy','pharmaceutical biology',
  'biochemistry and biophysics reports','toxicology letters','toxicology in vitro',
  'oxidative medicine and cellular longevity','inflammation research',
  'biomedicine pharmacotherapy','biomed pharmacother','biomedical reports',
  'journal of food science','food chemistry','antioxidants','cancers',
  'metabolites','plants','marine drugs','antibiotics','pharmaceutics',
  'drug and chemical toxicology','cellular and molecular biology',
  'journal of herbs spices and medicinal plants',
]);

export function classifyStudy(text) {
  const t = (text || '').toLowerCase();
  for (const s of STUDY_TYPES) {
    if (s.pattern.test(t)) return { studyType: s.type, level: s.level };
  }
  return { studyType: 'Other', level: 'D' };
}

export function classifyDomain(text) {
  const t = (text || '').toLowerCase();
  for (const d of DOMAINS) {
    if (d.pattern.test(t)) return d.domain;
  }
  return 'Pharmacology';
}

export function classifyJournalQuality(journal) {
  const j = (journal || '').toLowerCase().trim();
  for (const k of HIGH_IMPACT_JOURNALS) {
    if (j.includes(k)) return 'High';
  }
  for (const k of MEDIUM_IMPACT_JOURNALS) {
    if (j.includes(k)) return 'Medium';
  }
  return 'Low';
}

// ── Evidence level ordering (A=highest, D=lowest) ─────────────────────────
export const EVIDENCE_SCORE = { A: 1.0, B: 0.75, C: 0.5, D: 0.25 };
export const QUALITY_SCORE  = { High: 1.0, Medium: 0.6, Low: 0.2 };
