import { useState, useCallback, useRef } from 'react';
import ChapterDashboard from './ChapterDashboard.jsx';
import ChapterWorkspace from './ChapterWorkspace.jsx';
import { searchDirect }  from '../lib/research.js';

function apiUrl(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

const PER_PAGE = 20;

const INITIAL_STATE = {
  status:        'draft',   // draft | searching | generating | completed | error
  sourcesFound:  0,
  results:       null,
  facets:        {},
  query:         '',
  total:         0,
  loading:       false,
  statusMsg:     '',
  fallback:      false,
  page:          1,
  domainFilter:  '',
  studyTypeFilter:'',
  yearMin:       '',
  yearMax:       '',
  qualityFilter: '',
  chapter:       null,
  chapterLoading:false,
  chapterError:  null,
  errorMsg:      null,
  bibliography:  { refs: [], nextIndex: 1 },
};

export default function BookModule({
  bookTitle,
  chapters,
  onAddChapter,
  onMarkGenerated,
  onRenameChapter,
}) {
  // 'dashboard' | chapter-id (workspace)
  const [view, setView] = useState('dashboard');

  // Per-chapter state map
  const [chapterStates, setChapterStates] = useState({});

  // Stable ref for reading state inside async callbacks
  const statesRef = useRef(chapterStates);
  statesRef.current = chapterStates;

  function getState(id) {
    return statesRef.current[id] || { ...INITIAL_STATE };
  }

  function patchState(id, patch) {
    setChapterStates(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { ...INITIAL_STATE }), ...patch },
    }));
  }

  // ── Open chapter workspace ────────────────────────────────────────────
  function openChapter(id) {
    setView(id);
  }

  function backToDashboard() {
    setView('dashboard');
  }

  // ── Search for a chapter ──────────────────────────────────────────────
  const handleSearch = useCallback(async (chapterId, q, options = {}) => {
    const id          = chapterId;
    const cur         = getState(id);
    const isNewQuery  = options.newQuery !== false;
    const currentPage = isNewQuery ? 1 : (options.page || cur.page);

    if (isNewQuery) {
      patchState(id, {
        results: null, facets: {}, fallback: false, page: 1,
        query: q, status: 'searching', sourcesFound: 0, statusMsg: 'Searching PubMed…',
      });
    }
    patchState(id, { loading: true, query: q, status: 'searching' });

    try {
      const cur2   = getState(id);
      const params = {
        q,
        domain:          cur2.domainFilter,
        study_type:      cur2.studyTypeFilter,
        year_min:        cur2.yearMin,
        year_max:        cur2.yearMax,
        journal_quality: cur2.qualityFilter,
        page:            currentPage,
        per_page:        PER_PAGE,
      };
      const res  = await fetch(apiUrl('/api/search', params), { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `API ${res.status}`);
      }
      const data = await res.json();
      const count = data.total || 0;
      patchState(id, {
        results:      data.results || [],
        facets:       data.facets  || {},
        total:        count,
        fallback:     !!data.fallback,
        page:         currentPage,
        loading:      false,
        sourcesFound: count,
        status:       'draft',
        statusMsg:    data.fallback
          ? `Direct search — ${count} results`
          : `${count} results found`,
      });
    } catch (err) {
      const isOffline = err.message?.includes('offline') || err.message?.includes('Failed to fetch') || err.name === 'TimeoutError';
      patchState(id, {
        loading:   false,
        status:    'draft',
        statusMsg: isOffline ? 'API server offline — run: node server.js' : `Error: ${err.message}`,
      });
      try {
        const fb = await searchDirect(q, 20);
        patchState(id, {
          results:      fb,
          total:        fb.length,
          fallback:     true,
          facets:       {},
          sourcesFound: fb.length,
          loading:      false,
          status:       'draft',
          statusMsg:    `Direct PubMed results (${fb.length})`,
        });
      } catch {
        patchState(id, { loading: false, results: [], status: 'error', statusMsg: 'Search failed.', errorMsg: err.message });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generate content for a chapter ───────────────────────────────────
  const handleGenerate = useCallback(async (chapterId) => {
    const id  = chapterId;
    const cur = getState(id);
    if (!cur.results?.length || !cur.query) return;

    patchState(id, { chapter: null, chapterError: null, chapterLoading: true, status: 'generating' });

    try {
      const res  = await fetch(apiUrl('/api/generate-chapter'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: cur.query, papers: cur.results }),
        signal:  AbortSignal.timeout(90_000),
      });
      const text = await res.text();
      if (!text.trim()) throw new Error(`Server returned an empty response (HTTP ${res.status}). Ensure backend is running.`);
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned non-JSON (HTTP ${res.status}). Ensure backend is running.`); }
      if (!res.ok || data.error) throw new Error(data.error || `Chapter API ${res.status}`);

      // Pre-populate bibliography from generated chapter references
      const curBib = (statesRef.current[id] || INITIAL_STATE).bibliography;
      if (data.references?.length && curBib.refs.length === 0) {
        const refs = data.references.map(r => ({
          ...r,
          id: r.id || r.pmid || `ref-${r.index}`,
          bibIndex: r.index,
        }));
        patchState(id, {
          chapter: data,
          chapterLoading: false,
          status: 'completed',
          errorMsg: null,
          bibliography: { refs, nextIndex: refs.length + 1 },
        });
      } else {
        patchState(id, { chapter: data, chapterLoading: false, status: 'completed', errorMsg: null });
      }
      onMarkGenerated?.(id);
    } catch (err) {
      patchState(id, {
        chapterError:  err.message || 'Chapter generation failed',
        chapterLoading: false,
        status:        'error',
        errorMsg:      err.message,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMarkGenerated]);

  // ── Filter helpers ────────────────────────────────────────────────────
  function applyFilter(id, key, value) {
    const map = {
      domain:          'domainFilter',
      study_type:      'studyTypeFilter',
      year_min:        'yearMin',
      year_max:        'yearMax',
      journal_quality: 'qualityFilter',
    };
    if (map[key]) patchState(id, { [map[key]]: value });
  }

  function resetFilters(id) {
    patchState(id, { domainFilter: '', studyTypeFilter: '', yearMin: '', yearMax: '', qualityFilter: '' });
  }

  // ── Bibliography per-chapter ──────────────────────────────────────────
  function handleBibChange(chapterId, newBib) {
    patchState(chapterId, { bibliography: newBib });
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <ChapterDashboard
        bookTitle={bookTitle}
        chapters={chapters}
        chapterStates={chapterStates}
        onOpenChapter={openChapter}
        onRenameChapter={onRenameChapter}
      />
    );
  }

  // Workspace view for a specific chapter
  const chapterId  = view;
  const chapter    = chapters.find(c => c.id === chapterId);
  const chapterIdx = chapters.findIndex(c => c.id === chapterId);
  const st         = getState(chapterId);

  if (!chapter) {
    setView('dashboard');
    return null;
  }

  return (
    <ChapterWorkspace
      chapter={chapter}
      chapterIndex={chapterIdx}
      totalChapters={chapters.length}
      state={st}
      onBack={backToDashboard}
      onSearch={(q, opts) => handleSearch(chapterId, q, opts)}
      onFilterChange={(key, val) => applyFilter(chapterId, key, val)}
      onFilterReset={() => resetFilters(chapterId)}
      onFilterApply={() => handleSearch(chapterId, st.query, { newQuery: false, page: 1 })}
      onGenerate={() => handleGenerate(chapterId)}
      onClosePanel={() => patchState(chapterId, { chapter: null, chapterError: null })}
      onPageChange={p => handleSearch(chapterId, st.query, { newQuery: false, page: p })}
      bibliography={st.bibliography}
      onBibChange={newBib => handleBibChange(chapterId, newBib)}
    />
  );
}
