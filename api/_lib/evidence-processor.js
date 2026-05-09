// Shared evidence processing pipeline.
// Used by both generate-review.js and generate-chapter.js.
//
// processEvidence(papers) → EvidenceObject
//   .papers     — ranked, deduped paper array (≤25)
//   .groups     — { clinical, preclinical, mechanistic, review }
//   .counts     — { total, rct, cohort, in_vitro, animal, review, other }
//   .mechanisms — string[] of detected pathway names
//   .density    — 0–100 weighted evidence quality score
//   .references — indexed reference list for citation mapping

export const LEVEL_FROM_STUDY = {
  'Meta-analysis':           'A',
  'Systematic Review':       'A',
  'RCT':                     'A',
  'Cohort Study':            'B',
  'Case-Control':            'B',
  'Case Report':             'C',
  'In Vitro':                'D',
  'Animal Study':            'D',
  'Pharmacokinetic Study':   'D',
  'Mechanistic Study':       'D',
  'Formulation Study':       'D',
  'Other':                   'D',
};

const LEVEL_ORDER = { A: 4, B: 3, C: 2, D: 1 };

export function getLevel(p) {
  return p._level || p.level || p.evidence_level ||
    LEVEL_FROM_STUDY[p.study_type] || 'D';
}

// ── Dedup → rank → limit 25 ──────────────────────────────────────────────
export function preprocessPapers(papers) {
  const seen    = new Set();
  const deduped = [];
  for (const p of papers) {
    const key = p.doi || (p.title || '').toLowerCase().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  deduped.sort((a, b) => {
    const la = LEVEL_ORDER[getLevel(a)] ?? 1;
    const lb = LEVEL_ORDER[getLevel(b)] ?? 1;
    if (lb !== la) return lb - la;
    return (b.citations || 0) - (a.citations || 0);
  });
  return deduped.slice(0, 25);
}

// ── Group by study design ─────────────────────────────────────────────────
export function groupPapers(papers) {
  const groups = { clinical: [], preclinical: [], mechanistic: [], review: [] };
  for (const p of papers) {
    const st = (p.study_type || '').toLowerCase();
    if (st.includes('rct') || st.includes('cohort') || st.includes('case-control') ||
        st.includes('clinical') || st.includes('case report')) {
      groups.clinical.push(p);
    } else if (st.includes('animal')) {
      groups.preclinical.push(p);
    } else if (st.includes('in vitro') || st.includes('mechanistic') ||
               st.includes('pharmacokinetic') || st.includes('formulation')) {
      groups.mechanistic.push(p);
    } else if (st.includes('review') || st.includes('meta')) {
      groups.review.push(p);
    } else {
      groups.mechanistic.push(p);
    }
  }
  return groups;
}

// ── Evidence counts ───────────────────────────────────────────────────────
export function countEvidence(papers) {
  const counts = { total: papers.length, rct: 0, cohort: 0, in_vitro: 0, animal: 0, review: 0, other: 0 };
  for (const p of papers) {
    const st = (p.study_type || '').toLowerCase();
    if (st.includes('rct'))                                   counts.rct++;
    else if (st.includes('cohort') || st.includes('case-control')) counts.cohort++;
    else if (st.includes('in vitro') || st.includes('mechanistic')) counts.in_vitro++;
    else if (st.includes('animal'))                           counts.animal++;
    else if (st.includes('review') || st.includes('meta'))   counts.review++;
    else counts.other++;
  }
  return counts;
}

// ── Mechanism extraction ──────────────────────────────────────────────────
export const MECHANISM_PATTERNS = [
  { name: 'NF-κB',       re: /\bNF[-.–]?κ?B\b|\bnf.?kb\b/i },
  { name: 'MAPK',        re: /\bMAPK\b|\bERK\b|\bJNK\b|\bp38\b/i },
  { name: 'STAT1/STAT3', re: /\bSTAT[13]\b/i },
  { name: 'Nrf2',        re: /\bNrf2\b|\bNRF2\b/i },
  { name: 'PI3K/AKT',   re: /\bPI3K\b|\bAKT\b|\bmTOR\b/i },
  { name: 'IL-6',        re: /\bIL[-–]6\b|\binterleukin[-– ]6\b/i },
  { name: 'TNF-α',       re: /\bTNF[-–]?α\b|\btumou?r necrosis factor\b/i },
  { name: 'IL-1β',       re: /\bIL[-–]1β?\b|\binterleukin[-– ]1\b/i },
  { name: 'Caspase',     re: /\bcaspase[-– ]?[0-9]+\b/i },
  { name: 'BCL-2',       re: /\bBCL[-–]2\b|\bbcl2\b/i },
  { name: 'p53',         re: /\bTP53\b|\bp53\b/i },
  { name: 'Wnt',         re: /\bWnt\b|\bβ-catenin\b/i },
  { name: 'HIF-1α',      re: /\bHIF[-–]1α?\b/i },
  { name: 'VEGF',        re: /\bVEGF\b|\bangiogenesis\b/i },
  { name: 'Autophagy',   re: /\bautophagy\b|\bBeclin\b|\bATG\b/i },
  { name: 'Apoptosis',   re: /\bapoptosis\b|\bprogrammed cell death\b/i },
  { name: 'CYP3A4',      re: /\bCYP3A4\b|\bCYP2[CD]\d+\b/i },
];

export function extractMechanisms(papers) {
  const found = new Set();
  for (const p of papers) {
    const text = `${p.title || ''} ${p.abstract || ''}`;
    for (const { name, re } of MECHANISM_PATTERNS) {
      if (re.test(text)) found.add(name);
    }
  }
  return [...found];
}

// ── Evidence density (0–100 weighted quality score) ───────────────────────
export function computeDensity(counts) {
  if (counts.total === 0) return 0;
  return Math.round(
    ((counts.rct * 4 + counts.cohort * 3 + counts.review * 2 + counts.animal + counts.in_vitro) /
      (counts.total * 4)) * 100
  );
}

// ── Indexed reference list ────────────────────────────────────────────────
export function buildReferences(papers) {
  return papers.map((p, i) => ({
    index:          i + 1,
    doi:            p.doi        || null,
    pmid:           p.pmid       || null,
    title:          p.title      || '—',
    year:           p.year       || null,
    journal:        p.journal    || null,
    study_type:     p.study_type || 'Other',
    evidence_level: getLevel(p),
    citations:      p.citations  || 0,
  }));
}

// ── Master function: processEvidence(papers) → EvidenceObject ────────────
export function processEvidence(rawPapers) {
  const papers     = preprocessPapers(rawPapers);
  const groups     = groupPapers(papers);
  const counts     = countEvidence(papers);
  const mechanisms = extractMechanisms(papers);
  const density    = computeDensity(counts);
  const references = buildReferences(papers);

  return { papers, groups, counts, mechanisms, density, references };
}
