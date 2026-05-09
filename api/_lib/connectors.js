// ── HTTP helpers ──────────────────────────────────────────────────────────
// Default: 1 retry for search paths (fast fail), 3 retries for ingest/expansion
async function fetchWithRetry(url, opts = {}, retries = 1) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      // Default per-request timeout: 8s (tight for search), overridable via opts.timeout
      const tid = setTimeout(() => controller.abort(), opts.timeout || 8_000);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(tid);
      if (res.status === 429) {
        // Don't wait for retry-after during search — just fail fast
        throw new Error(`Rate limited by ${url.split('/').slice(0,3).join('/')}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      // Only retry on network errors (not 4xx/5xx), with short backoff
      if (i < retries - 1 && !err.message.startsWith('HTTP')) await delay(500 * (i + 1));
    }
  }
  throw lastErr;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ssHeaders() {
  const h = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    h['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  return h;
}

// ── PubMed connector ──────────────────────────────────────────────────────
const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const PUBMED_KEY  = process.env.PUBMED_API_KEY ? `&api_key=${process.env.PUBMED_API_KEY}` : '';

export async function fetchPubMed(query, maxResults = 100) {
  // 1. esearch
  const searchUrl = `${PUBMED_BASE}esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance${PUBMED_KEY}`;
  const searchRes  = await fetchWithRetry(searchUrl, { timeout: 10_000 });
  const searchData = await searchRes.json();
  const ids = searchData.esearchresult?.idlist || [];
  if (!ids.length) return [];

  // 2. esummary
  const summaryUrl  = `${PUBMED_BASE}esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${PUBMED_KEY}`;
  const summaryRes  = await fetchWithRetry(summaryUrl, { timeout: 10_000 });
  const summaryData = await summaryRes.json();

  const abstractMap  = {};
  const authorMap    = {};
  const yearMap      = {};
  const meshTermsMap = {};

  // 3. efetch (abstracts + authors + mesh) — non-fatal: if this step fails we
  //    still return results from esummary so PubMed is never silently empty.
  try {
    const efetchUrl = `${PUBMED_BASE}efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml&rettype=abstract${PUBMED_KEY}`;
    const xmlText   = await (await fetchWithRetry(efetchUrl, { timeout: 12_000 })).text();
    const DOMParser = await importDOMParser();
    const xmlDoc    = new DOMParser().parseFromString(xmlText, 'text/xml');

    const getTag  = (el, tag)  => el.getElementsByTagName(tag);
    const getText = (el, tag)  => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    const toArr   = (htmlColl) => Array.from({ length: htmlColl.length }, (_, i) => htmlColl[i]);

    const articles = toArr(xmlDoc.getElementsByTagName('PubmedArticle'));
    for (const article of articles) {
      const pmid = getText(article, 'PMID');
      if (!pmid) continue;

      const abstractEls = toArr(getTag(article, 'AbstractText'));
      const parts = abstractEls.map(el => {
        const label = el.getAttribute('Label');
        const text  = el.textContent.trim();
        return label ? `${label}: ${text}` : text;
      }).filter(Boolean);
      if (parts.length) abstractMap[pmid] = parts.join(' ');

      authorMap[pmid] = toArr(getTag(article, 'Author')).slice(0, 8).map(a => {
        const last = getText(a, 'LastName');
        const init = getText(a, 'Initials');
        return init ? `${last} ${init}` : last;
      }).filter(Boolean);

      const yearText = getText(article, 'Year') || getText(article, 'MedlineDate');
      if (yearText) yearMap[pmid] = yearText.slice(0, 4);

      meshTermsMap[pmid] = toArr(getTag(article, 'DescriptorName'))
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  } catch (_) {
    // efetch failed — continue with esummary data only (no abstract/mesh)
  }

  const results = [];
  for (const id of ids) {
    const art = summaryData.result?.[id];
    if (!art) continue;

    let doi = null;
    for (const aid of (art.articleids || [])) {
      if ((aid.idtype || '').toLowerCase() === 'doi') {
        const raw = (aid.value || '').trim();
        if (raw.startsWith('10.') && !raw.includes(' ') && raw.length > 6) { doi = raw; break; }
      }
    }

    // Fallback authors from esummary when efetch didn't return them
    const summaryAuthors = authorMap[id] ||
      (art.authors || []).slice(0, 8).map(a => {
        const name = a.name || '';
        return name;
      }).filter(Boolean);

    results.push({
      art,
      pmid: id,
      doi,
      abstract:   abstractMap[id]  || '',
      authors:    summaryAuthors,
      year:       yearMap[id]      || art.pubdate?.slice(0, 4) || '',
      meshTerms:  meshTermsMap[id] || [],
    });
  }

  return results;
}

// ── CrossRef connector ────────────────────────────────────────────────────
export async function fetchCrossRef(query, rows = 100, offset = 0) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${rows}&offset=${offset}&select=DOI,title,container-title,type,published,author,is-referenced-by-count,subject&filter=type:journal-article&mailto=research@dr-hafiz-engine.com`;
  const res  = await fetchWithRetry(url, { timeout: 20_000 });
  const data = await res.json();
  return data.message?.items || [];
}

// CrossRef: books + chapters
export async function fetchCrossRefBooks(query, rows = 30) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,container-title,type,published,author,is-referenced-by-count,subject&filter=type:book-chapter,type:book&mailto=research@dr-hafiz-engine.com`;
  try {
    const res  = await fetchWithRetry(url, { timeout: 15_000 });
    const data = await res.json();
    return (data.message?.items || []).map(item => ({ ...item, _content_type: 'Book Chapter' }));
  } catch (_) { return []; }
}

// ── OpenAlex connector ────────────────────────────────────────────────────
const OPENALEX_BASE = 'https://api.openalex.org';

export async function fetchOpenAlex(query, perPage = 100, page = 1) {
  const filter = 'type:article,has_abstract:true';
  const fields = 'id,title,abstract_inverted_index,authorships,primary_location,publication_year,cited_by_count,doi,ids,concepts';
  const url = `${OPENALEX_BASE}/works?search=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&per-page=${perPage}&page=${page}&select=${fields}&mailto=research@dr-hafiz-engine.com`;
  const res  = await fetchWithRetry(url, { timeout: 20_000 });
  const data = await res.json();
  return data.results || [];
}

// OpenAlex: books and chapters
export async function fetchOpenAlexBooks(query, perPage = 30) {
  const filter = 'type:book-chapter|type:book';
  const fields = 'id,title,abstract_inverted_index,authorships,primary_location,publication_year,cited_by_count,doi,ids,concepts';
  try {
    const url = `${OPENALEX_BASE}/works?search=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&per-page=${perPage}&page=1&select=${fields}&mailto=research@dr-hafiz-engine.com`;
    const res  = await fetchWithRetry(url, { timeout: 15_000 });
    const data = await res.json();
    return (data.results || []).map(w => ({ ...w, _content_type: 'Book Chapter' }));
  } catch (_) { return []; }
}

// ── Semantic Scholar connector ────────────────────────────────────────────
export async function fetchSemanticScholar(query, limit = 100, offset = 0) {
  const fields = 'title,abstract,authors,journal,year,citationCount,externalIds,url,venue,fieldsOfStudy,paperId';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&fields=${fields}`;
  const res  = await fetchWithRetry(url, { headers: ssHeaders(), timeout: 20_000 });
  const data = await res.json();
  return data.data || [];
}

// ── Semantic Scholar: resolve paper ID ───────────────────────────────────
// Tries DOI first, then title search. Returns paperId or null.
export async function resolveSemanticScholarId(doi, title, year) {
  // Try DOI lookup
  if (doi) {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=paperId,externalIds`;
      const res  = await fetchWithRetry(url, { headers: ssHeaders(), timeout: 8_000 });
      const data = await res.json();
      if (data?.paperId) return data.paperId;
    } catch (_) {}
  }

  // Fallback: title search
  if (title) {
    try {
      const q = encodeURIComponent(title.slice(0, 100));
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=5&fields=paperId,title,year`;
      const res  = await fetchWithRetry(url, { headers: ssHeaders(), timeout: 8_000 });
      const data = await res.json();
      const hit = (data.data || []).find(p => {
        const titleMatch = p.title?.toLowerCase().trim() === title.toLowerCase().trim();
        const yearMatch  = !year || !p.year || Math.abs(p.year - year) <= 1;
        return titleMatch && yearMatch;
      });
      if (hit?.paperId) return hit.paperId;
    } catch (_) {}
  }

  return null;
}

// ── Semantic Scholar: fetch references for a paper ───────────────────────
export async function fetchReferences(paperId, limit = 50) {
  if (!paperId) return [];
  try {
    const fields = 'title,abstract,authors,journal,year,citationCount,externalIds,url,venue,fieldsOfStudy,paperId';
    const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/references?limit=${limit}&fields=${fields}`;
    const res  = await fetchWithRetry(url, { headers: ssHeaders(), timeout: 15_000 });
    const data = await res.json();
    return (data.data || []).map(r => ({
      ...r.citedPaper,
      _is_reference: true,
      _source_paper: paperId,
    })).filter(p => p?.paperId);
  } catch (_) { return []; }
}

// ── Semantic Scholar: fetch citations for a paper ────────────────────────
export async function fetchCitations(paperId, limit = 50) {
  if (!paperId) return [];
  try {
    const fields = 'title,abstract,authors,journal,year,citationCount,externalIds,url,venue,fieldsOfStudy,paperId';
    const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/citations?limit=${limit}&fields=${fields}`;
    const res  = await fetchWithRetry(url, { headers: ssHeaders(), timeout: 15_000 });
    const data = await res.json();
    return (data.data || []).map(r => ({
      ...r.citingPaper,
      _is_citation: true,
      _source_paper: paperId,
    })).filter(p => p?.paperId);
  } catch (_) { return []; }
}

// Fetch citation counts for a list of DOIs (citations refresh)
export async function fetchCitationCounts(dois) {
  const results = {};
  const batchSize = 500;
  for (let i = 0; i < dois.length; i += batchSize) {
    const batch = dois.slice(i, i + batchSize);
    try {
      const res  = await fetchWithRetry('https://api.semanticscholar.org/graph/v1/paper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ssHeaders() },
        body: JSON.stringify({ ids: batch.map(d => `DOI:${d}`), fields: 'citationCount,externalIds' }),
        timeout: 30_000,
      });
      const data = await res.json();
      for (const paper of (Array.isArray(data) ? data : [])) {
        if (!paper) continue;
        const doi = paper.externalIds?.DOI;
        if (doi) results[doi] = paper.citationCount || 0;
      }
    } catch (_) {}
    await delay(300);
  }
  return results;
}

// ── ClinicalTrials.gov connector ──────────────────────────────────────────
export async function fetchClinicalTrials(query, maxResults = 20) {
  try {
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}&format=json&fields=NCTId,BriefTitle,OfficialTitle,BriefSummary,Condition,InterventionName,Phase,StudyType,StartDate,CompletionDate,OverallStatus,EnrollmentCount`;
    const res  = await fetchWithRetry(url, { timeout: 12_000 });
    const data = await res.json();
    return (data.studies || []).map(s => ({
      ...s,
      _content_type: 'Clinical Trial',
    }));
  } catch (_) { return []; }
}

// ── Lens.org patent connector ─────────────────────────────────────────────
export async function fetchPatents(query, size = 10) {
  if (!process.env.LENS_API_KEY) return [];
  try {
    const url  = 'https://api.lens.org/patent/search';
    const body = {
      query: { query_string: { query, fields: ['title', 'abstract', 'claims'] } },
      size,
      include: ['lens_id','title','abstract','inventor','date_published','jurisdiction','doc_number'],
    };
    const res = await fetchWithRetry(url, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${process.env.LENS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: 12_000,
    });
    const data = await res.json();
    return (data.data || []).map(p => ({ ...p, _content_type: 'Patent' }));
  } catch (_) { return []; }
}

// ── WHO/FDA/NICE guideline search (via PubMed filter) ────────────────────
export async function fetchGuidelines(query, maxResults = 10) {
  try {
    const guideQuery = `${query} AND (guideline[pt] OR practice guideline[pt] OR "clinical practice guideline"[ti])`;
    const url = `${PUBMED_BASE}esearch.fcgi?db=pubmed&term=${encodeURIComponent(guideQuery)}&retmax=${maxResults}&retmode=json&sort=relevance${PUBMED_KEY}`;
    const res  = await fetchWithRetry(url, { timeout: 10_000 });
    const data = await res.json();
    const ids  = data.esearchresult?.idlist || [];
    if (!ids.length) return [];

    const summUrl = `${PUBMED_BASE}esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${PUBMED_KEY}`;
    const sumRes  = await fetchWithRetry(summUrl, { timeout: 10_000 });
    const sumData = await sumRes.json();

    return ids.map(id => {
      const art = sumData.result?.[id];
      if (!art) return null;
      return {
        pmid: id,
        title: art.title || '',
        journal: art.fulljournalname || art.source || '',
        year: art.pubdate ? parseInt(art.pubdate) : null,
        _content_type: 'Guideline',
        _pubmed_raw: art,
      };
    }).filter(Boolean);
  } catch (_) { return []; }
}

// ── DOMParser for Node.js (via xmldom, or built-in if available) ──────────
async function importDOMParser() {
  if (typeof DOMParser !== 'undefined') return DOMParser;
  try {
    const { DOMParser: NodeDP } = await import('@xmldom/xmldom');
    return NodeDP;
  } catch (_) {
    return class {
      parseFromString() {
        return { querySelectorAll: () => [] };
      }
    };
  }
}
