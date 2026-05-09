// ── Client-side helpers ───────────────────────────────────────────────────
// All heavy lifting (multi-source fetch, embedding, re-ranking) is now done
// by the /api/search serverless endpoint. This module provides:
//   - buildCitation (UI formatting)
//   - classifyRelevance (fallback client-side label)
//   - computeScore (used by direct-search fallback only)
//   - searchDirect (PubMed + CrossRef fallback when /api/search is unreachable)

// ── Citation builder ──────────────────────────────────────────────────────
export function buildCitation(ref) {
  const authors = ref.authors?.length
    ? ref.authors.length > 3
        ? `${ref.authors[0]} et al.`
        : ref.authors.join(', ')
    : 'Unknown Authors';
  const year    = ref.year  ? `(${ref.year})`  : '';
  const journal = ref.journal || '';
  const doi     = ref.doi   ? `https://doi.org/${ref.doi}` : '';
  const pmid    = ref.pmid  ? `PMID: ${ref.pmid}` : '';

  const parts = [authors, year, ref.title, journal].filter(Boolean);
  const tail  = [doi || pmid].filter(Boolean);
  return parts.join('. ') + (tail.length ? '. ' + tail[0] : '') + '.';
}

// ── Client-side relevance label ───────────────────────────────────────────
export function classifyRelevance(title, query, abstract) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const t = title.toLowerCase();
  const a = (abstract || '').toLowerCase();
  const titleMatches    = words.filter(w => t.includes(w)).length;
  const abstractMatches = words.filter(w => a.includes(w)).length;
  if (titleMatches >= Math.min(words.length, 2) || titleMatches >= 1) return 'High';
  if (abstractMatches >= 1) return 'Medium';
  return 'Low';
}

// ── Client-side score (fallback mode only) ────────────────────────────────
function computeScoreFallback(ref, query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const title = ref.title.toLowerCase();
  const abst  = (ref.abstract || '').toLowerCase();
  let score = 0;
  const titleMatches = words.filter(w => title.includes(w)).length;
  if (titleMatches > 0) score += Math.min(40, (titleMatches / words.length) * 40);
  const abMatches = words.filter(w => abst.includes(w)).length;
  score += Math.min(titleMatches > 0 ? 10 : 25, (abMatches / (words.length || 1)) * (titleMatches > 0 ? 10 : 25));
  if (ref.journalQuality === 'High')   score += 10;
  else if (ref.journalQuality === 'Medium') score += 5;
  const year = ref.year ? parseInt(ref.year) : 0;
  const age  = new Date().getFullYear() - year;
  if (age <= 1) score += 10; else if (age <= 3) score += 7; else if (age <= 5) score += 4;
  return Math.round(score);
}

// ── Classification helpers (fallback mode) ────────────────────────────────
const STUDY_TYPES = [
  { pattern: /meta.?analy/i,               type: 'Meta-analysis',               level: 'A' },
  { pattern: /systematic.?review/i,        type: 'Systematic Review',           level: 'A' },
  { pattern: /randomized|randomised|RCT/i, type: 'RCT',                         level: 'A' },
  { pattern: /cohort/i,                    type: 'Cohort Study',                level: 'B' },
  { pattern: /case.control/i,              type: 'Case-Control',                level: 'B' },
  { pattern: /case report/i,               type: 'Case Report',                 level: 'C' },
  { pattern: /in.?vitro|cell line/i,       type: 'In Vitro',                    level: 'D' },
  { pattern: /animal|rat|mouse|mice/i,     type: 'Animal Study',                level: 'D' },
  { pattern: /pharmacokinetic|ADME/i,      type: 'Pharmacokinetic Study',       level: 'D' },
  { pattern: /formulat|nanoparticle/i,     type: 'Formulation Study',           level: 'D' },
  { pattern: /mechanism|pathway/i,         type: 'Mechanistic Study',           level: 'D' },
];

const DOMAINS = [
  { pattern: /pharmacokinet|bioavailability|ADME/i,              domain: 'Pharmacology' },
  { pattern: /formulat|nanoparticle|drug delivery/i,             domain: 'Pharmaceutics' },
  { pattern: /phytochem|alkaloid|flavonoid|terpenoid/i,          domain: 'Phytochemistry' },
  { pattern: /herbal|medicinal plant|ethnopharmacol/i,           domain: 'Pharmacognosy' },
  { pattern: /natural product|plant extract|botanical/i,         domain: 'Natural Products' },
  { pattern: /pharmacol|anti.?inflamm|antiox|cytotoxic/i,        domain: 'Pharmacology' },
  { pattern: /cell|gene|protein|enzyme|pathway/i,                domain: 'Biology' },
];

const HIGH_JOURNALS = [
  'nature','lancet','jama','new england journal','science','cell','bmj',
  'phytomedicine','journal of ethnopharmacology','british journal of pharmacology',
  'journal of medicinal chemistry','food and chemical toxicology',
];

const MED_JOURNALS = [
  'plos one','scientific reports','frontiers','molecules','nutrients',
  'phytotherapy','fitoterapia','natural product','pharmacognosy','plants',
  'antioxidants','biomedicine','journal of food','food chemistry',
];

function classifyStudy(title) {
  for (const s of STUDY_TYPES) {
    if (s.pattern.test(title)) return { studyType: s.type, level: s.level };
  }
  return { studyType: 'Other', level: 'D' };
}

function classifyDomain(title) {
  for (const d of DOMAINS) {
    if (d.pattern.test(title)) return d.domain;
  }
  return 'Pharmacology';
}

function journalQuality(journal) {
  const j = (journal || '').toLowerCase();
  if (HIGH_JOURNALS.some(k => j.includes(k))) return 'High';
  if (MED_JOURNALS.some(k => j.includes(k))) return 'Medium';
  return 'Low';
}

// ── Direct PubMed + CrossRef (client-side fallback) ───────────────────────
export async function searchDirect(query, maxResults = 12) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const [searchRes, crossRefRes] = await Promise.allSettled([
    fetch(`${base}esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`),
    fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=20&select=DOI,title,container-title,type,published,author,is-referenced-by-count&filter=type:journal-article`),
  ]);

  const refs = [];

  // PubMed
  if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
    const searchData = await searchRes.value.json();
    const ids = searchData.esearchresult?.idlist || [];

    if (ids.length) {
      const summaryUrl  = `${base}esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
      const efetchUrl   = `${base}efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml&rettype=abstract`;
      const [sumRes, xmlRes] = await Promise.allSettled([fetch(summaryUrl), fetch(efetchUrl)]);

      let summaryData = {};
      if (sumRes.status === 'fulfilled') summaryData = await sumRes.value.json();

      const abstractMap = {};
      const authorMap   = {};
      const yearMap     = {};

      if (xmlRes.status === 'fulfilled') {
        const xmlText = await xmlRes.value.text();
        const xmlDoc  = new DOMParser().parseFromString(xmlText, 'text/xml');
        xmlDoc.querySelectorAll('PubmedArticle').forEach(article => {
          const pmidEl = article.querySelector('MedlineCitation > PMID');
          if (!pmidEl) return;
          const pmid = pmidEl.textContent.trim();
          const parts = [...article.querySelectorAll('AbstractText')].map(el => {
            const label = el.getAttribute('Label');
            const text  = el.textContent.trim();
            return label ? `${label}: ${text}` : text;
          }).filter(Boolean);
          if (parts.length) abstractMap[pmid] = parts.join(' ');
          authorMap[pmid] = [...article.querySelectorAll('Author')].slice(0, 6).map(a => {
            const last = a.querySelector('LastName')?.textContent?.trim() || '';
            const init = a.querySelector('Initials')?.textContent?.trim() || '';
            return init ? `${last} ${init}` : last;
          }).filter(Boolean);
          const yearEl = article.querySelector('PubDate > Year') || article.querySelector('PubDate > MedlineDate');
          if (yearEl) yearMap[pmid] = yearEl.textContent.trim().slice(0, 4);
        });
      }

      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      for (const id of ids) {
        const art = summaryData.result?.[id];
        if (!art) continue;
        const title    = art.title || 'Untitled';
        const abstract = abstractMap[id] || '';
        const journal  = art.fulljournalname || art.source || '';
        const t = title.toLowerCase();
        const a = abstract.toLowerCase();
        if (!keywords.some(w => t.includes(w) || a.includes(w))) continue;

        let doi = null;
        for (const aid of (art.articleids || [])) {
          if ((aid.idtype || '').toLowerCase() === 'doi') {
            const raw = (aid.value || '').trim();
            if (raw.startsWith('10.') && raw.length > 6) { doi = raw; break; }
          }
        }

        const classif = classifyStudy(title);
        const ref = {
          id: doi ? `doi:${doi}` : `pubmed:${id}`,
          title, abstract, source: ['pubmed'],
          pmid: id, doi,
          authors: authorMap[id] || [],
          year: yearMap[id] || art.pubdate?.slice(0, 4) || null,
          journal,
          domain: classifyDomain(title + ' ' + abstract),
          study_type: classif.studyType,
          journal_quality: journalQuality(journal),
          citations: 0,
          mesh_terms: [], keywords: [],
          link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          match_type: keywords.some(w => t.includes(w)) ? 'exact' : 'partial',
        };
        ref.score = computeScoreFallback(ref, query);
        refs.push(ref);
      }
    }
  }

  // CrossRef
  if (crossRefRes.status === 'fulfilled' && crossRefRes.value.ok) {
    const data  = await crossRefRes.value.json();
    const items = data.message?.items || [];
    const domKw = ['pharmacol','pharmaceut','biology','natural product','phytochem','pharmacognosy','drug','plant','herbal','medicinal'];
    const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const pubmedIds = new Set(refs.map(r => r.title.toLowerCase().replace(/\W+/g, '')));

    for (const item of items.slice(0, 20)) {
      const title   = item.title?.[0] || 'Untitled';
      const journal = item['container-title']?.[0] || '';
      const text    = (title + ' ' + journal).toLowerCase();
      if (!domKw.some(k => text.includes(k))) continue;
      const norm = title.toLowerCase().replace(/\W+/g, '');
      if (pubmedIds.has(norm)) continue;

      const rawDoi = (item.DOI || '').trim();
      const doi    = rawDoi.startsWith('10.') && rawDoi.length > 6 ? rawDoi : null;
      const yearArr = item.published?.['date-parts']?.[0];
      const year    = yearArr?.[0] ? String(yearArr[0]) : null;
      const authors = (item.author || []).slice(0, 6).map(a => {
        const last = a.family || '';
        const init = a.given ? a.given.charAt(0) + '.' : '';
        return init ? `${last} ${init}` : last;
      }).filter(Boolean);

      const classif = classifyStudy(title);
      const ref = {
        id: doi ? `doi:${doi}` : `cr:${norm.slice(0,20)}`,
        title, abstract: '', source: ['crossref'],
        pmid: null, doi, authors, year, journal,
        domain: classifyDomain(title + ' ' + journal),
        study_type: classif.studyType,
        journal_quality: journalQuality(journal),
        citations: item['is-referenced-by-count'] || 0,
        mesh_terms: [], keywords: [],
        link: doi ? `https://doi.org/${doi}` : null,
        match_type: qWords.some(w => title.toLowerCase().includes(w)) ? 'partial' : 'semantic',
      };
      ref.score = computeScoreFallback(ref, query);
      refs.push(ref);
    }
  }

  refs.sort((a, b) => b.score - a.score);
  return refs;
}
