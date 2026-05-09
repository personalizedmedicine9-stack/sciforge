import crypto from 'crypto';
import { classifyStudy, classifyDomain, classifyJournalQuality } from './classify.js';

// ── DOI normalization (§17) ───────────────────────────────────────────────
export function normalizeDoi(raw) {
  if (!raw) return null;
  let d = (raw + '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .trim();
  return d.startsWith('10.') && !d.includes(' ') && d.length > 6 ? d : null;
}

// ── Title normalization (§17) ─────────────────────────────────────────────
export function normalizeTitle(raw) {
  if (!raw) return '';
  return (raw + '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')   // strip HTML
    .replace(/[^\w\s]/g, ' ')  // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Stable paper ID ───────────────────────────────────────────────────────
export function makeId(doi, title, year) {
  if (doi) return `doi:${normalizeDoi(doi) || doi}`;
  const hash = crypto
    .createHash('sha256')
    .update(`${normalizeTitle(title)}|${year || ''}`)
    .digest('hex')
    .slice(0, 16);
  return `hash:${hash}`;
}

// ── Dedup key (title+year, normalized) ───────────────────────────────────
export function dedupKey(title, year) {
  return `${normalizeTitle(title).slice(0, 60)}|${year || ''}`;
}

// ── PubMed normalizer ─────────────────────────────────────────────────────
export function normalizePubMed({ art, pmid, doi, abstract, authors, year, meshTerms }) {
  const title   = (art.title || 'Untitled').replace(/<[^>]+>/g, '').trim();
  const journal = art.fulljournalname || art.source || '';
  const d       = normalizeDoi(doi);
  const id      = makeId(d, title, year);
  const classif = classifyStudy(title + ' ' + abstract);
  const domain  = classifyDomain(title + ' ' + abstract);
  const quality = classifyJournalQuality(journal);

  return {
    id,
    doi: d,
    title,
    abstract: abstract || '',
    authors: authors || [],
    journal,
    year: year ? parseInt(year) : null,
    source: ['pubmed'],
    mesh_terms: meshTerms || [],
    keywords: [],
    citations: 0,
    study_type: classif.studyType,
    domain,
    journal_quality: quality,
    pmid: pmid || null,
    link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    _level: classif.level,
    content_type: null,
  };
}

// ── CrossRef normalizer ───────────────────────────────────────────────────
export function normalizeCrossRef(item) {
  const title   = (item.title?.[0] || 'Untitled').trim();
  const journal = item['container-title']?.[0] || '';
  const d       = normalizeDoi(item.DOI);
  const yearArr = item.published?.['date-parts']?.[0];
  const year    = yearArr?.[0] ? parseInt(yearArr[0]) : null;
  const id      = makeId(d, title, year);
  const classif = classifyStudy(title);
  const domain  = classifyDomain(title + ' ' + journal);
  const quality = classifyJournalQuality(journal);

  const authors = (item.author || []).slice(0, 8).map(a => {
    const last = a.family || '';
    const init = a.given ? a.given.charAt(0) + '.' : '';
    return init ? `${last} ${init}` : last;
  }).filter(Boolean);

  const contentType = item._content_type ||
    (['book-chapter', 'book'].includes(item.type) ? 'Book Chapter' : null);

  return {
    id,
    doi: d,
    title,
    abstract: '',
    authors,
    journal,
    year,
    source: ['crossref'],
    mesh_terms: [],
    keywords: (item.subject || []).slice(0, 10),
    citations: item['is-referenced-by-count'] || 0,
    study_type: classif.studyType,
    domain,
    journal_quality: quality,
    pmid: null,
    link: d ? `https://doi.org/${d}` : null,
    _level: classif.level,
    content_type: contentType,
  };
}

// ── OpenAlex normalizer ───────────────────────────────────────────────────
export function normalizeOpenAlex(work) {
  const title   = (work.title || 'Untitled').trim();
  const journal = work.primary_location?.source?.display_name || '';
  const d       = normalizeDoi(work.doi);
  const year    = work.publication_year ? parseInt(work.publication_year) : null;
  const id      = makeId(d, title, year);
  const classif = classifyStudy(title);
  const domain  = classifyDomain(title + ' ' + journal);
  const quality = classifyJournalQuality(journal);

  const authors = (work.authorships || []).slice(0, 8).map(a => {
    const name  = a.author?.display_name || '';
    const parts = name.split(' ');
    return parts.length >= 2
      ? `${parts[parts.length - 1]} ${parts[0].charAt(0)}.`
      : name;
  }).filter(Boolean);

  let abstract = '';
  if (work.abstract_inverted_index) {
    try {
      const maxPos = Math.max(...Object.values(work.abstract_inverted_index).flat());
      const words  = new Array(maxPos + 1).fill('');
      for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
        for (const pos of positions) words[pos] = word;
      }
      abstract = words.join(' ').trim();
    } catch (_) {}
  }

  const concepts = (work.concepts || [])
    .filter(c => c.score > 0.3)
    .map(c => c.display_name)
    .slice(0, 10);

  const contentType = work._content_type ||
    (['book-chapter', 'book'].includes(work.type) ? 'Book Chapter' : null);

  return {
    id,
    doi: d,
    title,
    abstract,
    authors,
    journal,
    year,
    source: ['openalex'],
    mesh_terms: [],
    keywords: concepts,
    citations: work.cited_by_count || 0,
    study_type: classif.studyType,
    domain,
    journal_quality: quality,
    pmid: work.ids?.pmid?.replace('https://pubmed.ncbi.nlm.nih.gov/', '') || null,
    link: d ? `https://doi.org/${d}` : (work.id || null),
    _level: classif.level,
    content_type: contentType,
  };
}

// ── Semantic Scholar normalizer ───────────────────────────────────────────
export function normalizeSemanticScholar(paper) {
  const title   = (paper.title || 'Untitled').trim();
  const journal = paper.journal?.name || paper.venue || '';
  const d       = normalizeDoi(paper.externalIds?.DOI);
  const year    = paper.year ? parseInt(paper.year) : null;
  const id      = makeId(d, title, year);
  const classif = classifyStudy(title + ' ' + (paper.abstract || ''));
  const domain  = classifyDomain(title + ' ' + journal);
  const quality = classifyJournalQuality(journal);
  const authors = (paper.authors || []).slice(0, 8).map(a => a.name || '').filter(Boolean);

  const pmid = paper.externalIds?.PubMed || null;
  // Prefer PubMed link when we have a pmid, then DOI, then SS url
  const link = pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    : (d ? `https://doi.org/${d}` : paper.url || null);

  return {
    id,
    doi: d,
    title,
    abstract: paper.abstract || '',
    authors,
    journal,
    year,
    source: ['semanticscholar'],
    mesh_terms: [],
    keywords: (paper.fieldsOfStudy || []).slice(0, 10),
    citations: paper.citationCount || 0,
    study_type: classif.studyType,
    domain,
    journal_quality: quality,
    pmid,
    link,
    _level: classif.level,
    content_type: null,
    // Expansion tags (set externally after normalization)
    _is_reference:  paper._is_reference  || false,
    _is_citation:   paper._is_citation   || false,
    _source_paper:  paper._source_paper  || null,
  };
}

// ── ClinicalTrials.gov normalizer ─────────────────────────────────────────
export function normalizeClinicalTrial(study) {
  const prot    = study.protocolSection || study;
  const idMod   = prot.identificationModule || {};
  const descMod = prot.descriptionModule    || {};
  const statMod = prot.statusModule         || {};
  const desMod  = prot.designModule         || {};
  const armsMod = prot.armsInterventionsModule || {};

  const nctId  = study.NCTId || idMod.nctId || '';
  const title  = study.OfficialTitle || study.BriefTitle
    || idMod.officialTitle || idMod.briefTitle || 'Untitled';
  const brief  = study.BriefSummary || descMod.briefSummary || '';
  const phase  = study.Phase || desMod.phases?.join(', ') || '';
  const status = study.OverallStatus || statMod.overallStatus || '';
  const interventions = study.InterventionName
    ? (Array.isArray(study.InterventionName) ? study.InterventionName : [study.InterventionName])
    : (armsMod.interventions || []).map(i => i.name).filter(Boolean);

  const yearStr = study.StartDate || statMod.startDateStruct?.date || '';
  const year    = yearStr ? parseInt(yearStr) : null;
  const id      = makeId(null, title, year);

  return {
    id,
    doi: null,
    title: title.replace(/<[^>]+>/g, '').trim(),
    abstract: brief,
    authors: [],
    journal: `ClinicalTrials.gov (${phase || status})`.trim(),
    year,
    source: ['clinicaltrials'],
    mesh_terms: [],
    keywords: interventions.slice(0, 10),
    citations: 0,
    study_type: 'RCT',
    domain: 'Pharmacology',
    journal_quality: 'Medium',
    pmid: null,
    link: nctId ? `https://clinicaltrials.gov/study/${nctId}` : null,
    _level: 'A',
    content_type: 'Clinical Trial',
  };
}

// ── Patent normalizer (Lens.org) ──────────────────────────────────────────
export function normalizePatent(patent) {
  const title     = (patent.title?.[0]?.text || patent.title || 'Untitled').trim();
  const year      = patent.date_published ? parseInt(patent.date_published) : null;
  const id        = makeId(null, title, year);
  const inventors = (patent.inventor || []).map(i => i.name || '').filter(Boolean).slice(0, 6);

  return {
    id,
    doi: null,
    title,
    abstract: patent.abstract?.[0]?.text || patent.abstract || '',
    authors: inventors,
    journal: `Patent (${patent.jurisdiction || ''})`.trim(),
    year,
    source: ['lens'],
    mesh_terms: [],
    keywords: [],
    citations: 0,
    study_type: 'Other',
    domain: 'Pharmacology',
    journal_quality: 'Low',
    pmid: null,
    link: patent.lens_id ? `https://lens.org/lens/patent/${patent.lens_id}` : null,
    _level: 'D',
    content_type: 'Patent',
  };
}

// ── Cross-source merge (keeps best of each field) ─────────────────────────
export function mergeRecords(existing, incoming) {
  // Prefer PubMed link when either side has a pmid — ensures "View on PubMed"
  // works even when a CrossRef/OpenAlex record was indexed first.
  const mergedPmid = existing.pmid || incoming.pmid || null;
  const mergedLink = mergedPmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${mergedPmid}/`
    : (existing.link || incoming.link || null);

  return {
    ...existing,
    title:    incoming.title.length > existing.title.length ? incoming.title : existing.title,
    abstract: (incoming.abstract || '').length > (existing.abstract || '').length
      ? incoming.abstract : existing.abstract,
    source:      [...new Set([...existing.source,     ...incoming.source])],
    mesh_terms:  [...new Set([...existing.mesh_terms, ...incoming.mesh_terms])],
    keywords:    [...new Set([...existing.keywords,   ...incoming.keywords])],
    citations:   Math.max(existing.citations || 0, incoming.citations || 0),
    authors:     incoming.authors.length > existing.authors.length
      ? incoming.authors : existing.authors,
    journal_quality: ['High', 'Medium', 'Low'].indexOf(incoming.journal_quality) <
                     ['High', 'Medium', 'Low'].indexOf(existing.journal_quality)
      ? incoming.journal_quality : existing.journal_quality,
    pmid:          mergedPmid,
    link:          mergedLink,
    // Preserve expansion tags from either record
    _is_reference: existing._is_reference || incoming._is_reference || false,
    _is_citation:  existing._is_citation  || incoming._is_citation  || false,
    content_type:  existing.content_type  || incoming.content_type  || null,
  };
}
