import { useState, useCallback } from 'react';
import Header          from './components/Header.jsx';
import SearchBar       from './components/SearchBar.jsx';
import FilterBar       from './components/FilterBar.jsx';
import StatusBar       from './components/StatusBar.jsx';
import ResultsList     from './components/ResultsList.jsx';
import ReferencesSidebar from './components/ReferencesSidebar.jsx';
import SynthesisPanel  from './components/SynthesisPanel.jsx';
import ChapterPanel    from './components/ChapterPanel.jsx';
import BookModule       from './components/BookModule.jsx';
import BookSidePanel    from './components/BookSidePanel.jsx';
import BookSetupWizard  from './components/BookSetupWizard.jsx';
import { buildCitation, searchDirect } from './lib/research.js';

function apiUrl(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

let _bookIdCounter = 1;
function newChapterId() { return `ch-${_bookIdCounter++}`; }

export default function App() {
  // ── Global ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState('review'); // 'review' | 'book'
  const [bookSidebarCollapsed, setBookSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // ── Book state (lifted here so Sidebar + Module + Wizard share it) ───
  const [bookReady,      setBookReady]      = useState(false);
  const [bookTitle,      setBookTitle]      = useState('');
  const [chapters,       setChapters]       = useState([]);
  const [activeChapter,  setActiveChapter]  = useState(null);

  function handleSetBook({ title, chapters: chaps }) {
    setBookTitle(title);
    setChapters(chaps);
    setActiveChapter(chaps[0]?.id ?? null);
    setBookReady(true);
  }

  function handleNewBook() {
    setBookReady(false);
    setBookTitle('');
    setChapters([]);
    setActiveChapter(null);
  }

  function addChapter(title) {
    const ch = { id: newChapterId(), title, subheadings: [], generated: false };
    setChapters(prev => [...prev, ch]);
    setActiveChapter(ch.id);
  }

  function renameChapter(id, newTitle) {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
  }

  function deleteChapter(id) {
    setChapters(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeChapter === id) setActiveChapter(next[0]?.id ?? null);
      return next;
    });
  }

  function moveChapter(index, direction) {
    setChapters(prev => {
      const next   = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleModeChange(next) {
    setMode(next);
  }

  // ── Scientific Review state ───────────────────────────────────────────
  const [results,         setResults]         = useState(null);
  const [facets,          setFacets]          = useState({});
  const [query,           setQuery]           = useState('');
  const [total,           setTotal]           = useState(0);
  const [loading,         setLoading]         = useState(false);
  const [statusMsg,       setStatusMsg]       = useState('');
  const [fallback,        setFallback]        = useState(false);
  const [domainFilter,    setDomainFilter]    = useState('');
  const [studyTypeFilter, setStudyTypeFilter] = useState('');
  const [yearMin,         setYearMin]         = useState('');
  const [yearMax,         setYearMax]         = useState('');
  const [qualityFilter,   setQualityFilter]   = useState('');
  const [page,            setPage]            = useState(1);
  const [synthesis,       setSynthesis]       = useState(null);
  const [synthLoading,    setSynthLoading]    = useState(false);
  const [synthError,      setSynthError]      = useState(null);
  const [chapter,         setChapter]         = useState(null);
  const [chapterLoading,  setChapterLoading]  = useState(false);
  const [chapterError,    setChapterError]    = useState(null);

  // ── Bibliography state (shared across review mode) ──────────────────
  const [bibliography, setBibliography] = useState({ refs: [], nextIndex: 1 });

  const PER_PAGE = 20;

  const handleSearch = useCallback(async (q, options = {}) => {
    const isNewQuery  = options.newQuery !== false;
    const currentPage = isNewQuery ? 1 : (options.page || page);

    if (isNewQuery) {
      setResults(null); setFacets({}); setFallback(false); setPage(1);
    }
    setLoading(true); setQuery(q); setStatusMsg('Searching…');

    try {
      const params = {
        q,
        domain:          domainFilter,
        study_type:      studyTypeFilter,
        year_min:        yearMin,
        year_max:        yearMax,
        journal_quality: qualityFilter,
        page:            currentPage,
        per_page:        PER_PAGE,
      };
      const res = await fetch(apiUrl('/api/search', params), { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `API ${res.status}`);
      }
      const data = await res.json();
      setResults(data.results || []); setFacets(data.facets || {});
      setTotal(data.total || 0); setFallback(!!data.fallback); setPage(currentPage);
      setStatusMsg(
        data.fallback
          ? `Direct search — ${data.total || 0} results (Elasticsearch unavailable)`
          : `${data.total || 0} results found`
      );
    } catch (err) {
      const isOffline = err.message?.includes('offline') || err.message?.includes('Failed to fetch') || err.name === 'TimeoutError';
      setStatusMsg(isOffline ? 'API server offline — run: node server.js' : `Search error: ${err.message}`);
      try {
        const fb = await searchDirect(q, 20);
        setResults(fb); setTotal(fb.length); setFallback(true); setFacets({});
        setStatusMsg(`Direct PubMed results (${fb.length}) — start backend for full search`);
      } catch {
        setStatusMsg('Search failed. Check your connection.'); setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, [domainFilter, studyTypeFilter, yearMin, yearMax, qualityFilter, page]);

  const runSynthesis = useCallback(async () => {
    if (!results?.length || !query) return;
    setSynthesis(null); setSynthError(null); setSynthLoading(true);
    try {
      const res  = await fetch(apiUrl('/api/generate-review'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, papers: results }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!text.trim()) throw new Error(`Server returned an empty response (HTTP ${res.status}). Ensure backend is running.`);
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned non-JSON (HTTP ${res.status}). Ensure backend is running.`); }
      if (!res.ok || data.error) throw new Error(data.error || `Review API ${res.status}`);
      setSynthesis(data);
    } catch (err) {
      setSynthError(err.message || 'Review generation failed');
    } finally {
      setSynthLoading(false);
    }
  }, [results, query]);

  const runChapter = useCallback(async () => {
    if (!results?.length || !query) return;
    setChapter(null); setChapterError(null); setChapterLoading(true);
    try {
      const res  = await fetch(apiUrl('/api/generate-chapter'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, papers: results }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!text.trim()) throw new Error(`Server returned an empty response (HTTP ${res.status}). Ensure backend is running.`);
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned non-JSON (HTTP ${res.status}). Ensure backend is running.`); }
      if (!res.ok || data.error) throw new Error(data.error || `Chapter API ${res.status}`);
      setChapter(data);
    } catch (err) {
      setChapterError(err.message || 'Chapter generation failed');
    } finally {
      setChapterLoading(false);
    }
  }, [results, query]);

  function resetFilters() {
    setDomainFilter(''); setStudyTypeFilter(''); setYearMin(''); setYearMax(''); setQualityFilter('');
  }

  function applyFilter(key, value) {
    const map = {
      domain:          setDomainFilter,
      study_type:      setStudyTypeFilter,
      year_min:        setYearMin,
      year_max:        setYearMax,
      journal_quality: setQualityFilter,
    };
    map[key]?.(value);
  }

  function handleExport() {
    if (!results) return;
    const lines = [
      'SCIFORGE — SCIENTIFIC LITERATURE INTELLIGENCE',
      `Query: ${query}`,
      `Date: ${new Date().toISOString().split('T')[0]}`,
      `Total: ${total} | Exported: ${results.length}`,
      '',
      ...results.map(r => [
        `Title: ${r.title}`,
        `Citation: ${buildCitation(r)}`,
        `DOI: ${r.doi ? 'https://doi.org/' + r.doi : '—'}`,
        `PMID: ${r.pmid || '—'}`,
        `Journal: ${r.journal || '—'}`,
        `Year: ${r.year || '—'}`,
        `Domain: ${r.domain}`,
        `Study Type: ${r.study_type}`,
        `Evidence Level: ${r._level || r.level || '—'}`,
        `Citations: ${r.citations || 0}`,
        `Source: ${Array.isArray(r.source) ? r.source.join(', ') : r.source}`,
        r.abstract ? `Abstract: ${r.abstract.slice(0, 600)}` : '',
        '',
      ].filter(Boolean).join('\n')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `references_${query.replace(/\s+/g, '_').slice(0, 40)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={`app app-mode-${mode}`}>
      <Header mode={mode} onModeChange={handleModeChange} />

      <div className="app-body">
        {/* ── SCIENTIFIC REVIEW MODULE ─────────────────────────────── */}
        {mode === 'review' && (
          <>
            <main className="app-main-col">
              <div className="module-banner module-banner-review">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <strong>Literature Review Module</strong>
                <span>Search scientific databases · Enhance evidence-based reviews &amp; chapters</span>
              </div>

              <SearchBar onSearch={q => handleSearch(q, { newQuery: true })} loading={loading} />
              <StatusBar message={statusMsg} visible={loading} />

              {results !== null && (
                <FilterBar
                  domainFilter={domainFilter} studyTypeFilter={studyTypeFilter}
                  yearMin={yearMin} yearMax={yearMax} qualityFilter={qualityFilter}
                  facets={facets} onFilter={applyFilter} onReset={resetFilters}
                  onApply={() => handleSearch(query, { newQuery: false, page: 1 })}
                />
              )}

              <ResultsList
                refs={results} query={query} total={total} page={page} perPage={PER_PAGE}
                fallback={fallback} onExport={handleExport}
                onPageChange={p => handleSearch(query, { newQuery: false, page: p })}
                onSynthesize={runSynthesis} synthLoading={synthLoading}
                onChapter={runChapter}      chapterLoading={chapterLoading}
              />

              {(synthLoading || synthError || synthesis) && (
                <SynthesisPanel
                  data={synthesis} query={query}
                  papersUsed={synthesis?.papers_used ?? results?.length ?? 0}
                  loading={synthLoading} error={synthError}
                  onClose={() => { setSynthesis(null); setSynthError(null); }}
                />
              )}

              {(chapterLoading || chapterError || chapter) && (
                <ChapterPanel
                  data={chapter} query={query}
                  papersUsed={chapter?.papers_used ?? results?.length ?? 0}
                  loading={chapterLoading} error={chapterError}
                  onClose={() => { setChapter(null); setChapterError(null); }}
                />
              )}
            </main>

            {/* Mobile side panel FAB */}
            <button className="side-panel-fab" onClick={() => setMobileDrawerOpen(true)} aria-label="Show references panel">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {/* Mobile drawer overlay */}
            <div className={`side-panel-overlay${mobileDrawerOpen ? ' drawer-open' : ''}`} onClick={() => setMobileDrawerOpen(false)} />
            <aside className={`side-panel rsb-root${mobileDrawerOpen ? ' mobile-drawer-open' : ''}`}>
              {/* Mobile close button */}
              <button
                className="modal-close"
                style={{ display: mobileDrawerOpen ? 'flex' : 'none', position: 'sticky', top: '8px', marginLeft: 'auto', marginBottom: '8px', zIndex: 1 }}
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close references panel"
              >
                &#215;
              </button>
              <ReferencesSidebar
                papers={results || []}
                bibliography={bibliography}
                onBibChange={setBibliography}
                onInsertCitation={(marker, idx) => { navigator.clipboard?.writeText(marker); }}
              />
            </aside>
          </>
        )}

        {/* ── BOOK AUTHORING MODULE ─────────────────────────────────── */}
        {mode === 'book' && (
          <>
            <main className={`app-main-col${bookSidebarCollapsed ? ' app-main-col-expanded' : ''}`}>
              <div className="module-banner module-banner-book">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                </svg>
                <strong>Book Authoring Module</strong>
                <span>Build multi-chapter books · Evidence-grounded academic enhancement</span>
              </div>

              {!bookReady ? (
                <BookSetupWizard onBookReady={handleSetBook} />
              ) : (
                <BookModule
                  bookTitle={bookTitle}
                  chapters={chapters}
                  onAddChapter={addChapter}
                  onMarkGenerated={id =>
                    setChapters(prev => prev.map(c => c.id === id ? { ...c, generated: true } : c))
                  }
                  onRenameChapter={renameChapter}
                />
              )}
            </main>

            {/* Mobile side panel FAB for book mode */}
            <button className="side-panel-fab" onClick={() => setMobileDrawerOpen(true)} aria-label="Show book outline">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
            </button>
            {/* Mobile drawer overlay */}
            <div className={`side-panel-overlay${mobileDrawerOpen ? ' drawer-open' : ''}`} onClick={() => setMobileDrawerOpen(false)} />
            <BookSidePanel
              bookTitle={bookTitle}
              chapters={chapters}
              activeChapter={activeChapter}
              collapsed={bookSidebarCollapsed}
              onToggleCollapse={() => setBookSidebarCollapsed(c => !c)}
              onSelectChapter={(id) => { setActiveChapter(id); setMobileDrawerOpen(false); }}
              onAddChapter={(t) => { addChapter(t); setMobileDrawerOpen(false); }}
              onRenameChapter={renameChapter}
              onDeleteChapter={deleteChapter}
              onMoveChapter={moveChapter}
              onNewBook={() => { handleNewBook(); setMobileDrawerOpen(false); }}
              mobileDrawerOpen={mobileDrawerOpen}
              onCloseDrawer={() => setMobileDrawerOpen(false)}
            />
          </>
        )}
      </div>

      <footer className="app-footer">
        <div className="footer-main">
          SciForge &mdash; v4.0 &nbsp;|&nbsp; PubMed &middot; Crossref &middot; OpenAlex &middot; Evidence-Grounded Scholarly Enhancement
        </div>
        <div className="footer-disclaimer">
          For research use only — not for standalone clinical or medical decisions
        </div>
        <div className="footer-credit">
          Designed &amp; Developed by Dr. Mahmoud Mostafa —
        </div>
      </footer>
    </div>
  );
}
