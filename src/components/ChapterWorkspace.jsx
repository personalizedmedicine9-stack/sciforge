import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import SearchBar       from './SearchBar.jsx';
import StatusBar       from './StatusBar.jsx';
import FilterBar       from './FilterBar.jsx';
import ResultsList     from './ResultsList.jsx';
import ChapterEditor   from './ChapterEditor.jsx';
import ReferencesSidebar from './ReferencesSidebar.jsx';
import { buildCitation } from '../lib/research.js';

// ── Converts a ChapterPanel data object to editor HTML ───────────────────
function chapterDataToHtml(data) {
  if (!data) return '';
  const sections = [
    { title: '1. Introduction',                      body: data.introduction },
    { title: '2. Chemical & Pharmacological Profile', body: data.chemical_profile },
    { title: '3. Mechanisms of Action',              body: data.mechanisms },
    { title: '4. Preclinical Evidence',              body: data.preclinical },
    { title: '5. Clinical Evidence',                 body: data.clinical },
    { title: '6. Limitations',                       body: data.limitations },
    { title: '7. Future Directions',                 body: data.future_directions },
  ];

  const html = sections
    .filter(s => s.body)
    .map(s => `<h2>${s.title}</h2><p>${s.body.replace(/\n/g, '</p><p>')}</p>`)
    .join('\n');

  // References section
  const refs = data.references;
  let refHtml = '';
  if (refs?.length) {
    const items = refs.map(r =>
      `<li>[${r.index}] ${r.title}${r.year ? ` (${r.year})` : ''}${r.journal ? `. ${r.journal}` : ''}${r.doi ? `. https://doi.org/${r.doi}` : ''}</li>`
    ).join('');
    refHtml = `<h2>References</h2><ol>${items}</ol>`;
  }

  return `<h1>${data.title || 'Chapter'}</h1>\n${html}\n${refHtml}`;
}

// ── Workspace header ──────────────────────────────────────────────────────
function WorkspaceHeader({ chapter, index, total, status, sourcesFound, onBack }) {
  const statusMeta = {
    draft:      { text: 'Draft',        cls: 'ws-status-draft'      },
    searching:  { text: 'Searching…',   cls: 'ws-status-searching'  },
    generating: { text: 'Generating…',  cls: 'ws-status-generating' },
    completed:  { text: 'Completed',    cls: 'ws-status-completed'  },
    error:      { text: 'Error',        cls: 'ws-status-error'      },
  }[status] || { text: 'Draft', cls: 'ws-status-draft' };

  return (
    <div className="ws-header">
      <button className="ws-back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Chapters
      </button>

      <div className="ws-header-body">
        <div className="ws-header-left">
          <span className="ws-chapter-label">Chapter {index + 1} of {total}</span>
          <h2 className="ws-chapter-title">{chapter.title}</h2>
          {chapter.subheadings?.length > 0 && (
            <div className="ws-chapter-subs">
              {chapter.subheadings.map((s, i) => (
                <span key={i} className="ws-sub-tag">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="ws-header-right">
          <span className={`ws-status-badge ${statusMeta.cls}`}>
            {(status === 'searching' || status === 'generating') && (
              <span className="ws-status-spinner" />
            )}
            {statusMeta.text}
          </span>
          {sourcesFound > 0 && (
            <span className="ws-sources-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              {sourcesFound} source{sourcesFound !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────
export default function ChapterWorkspace({
  chapter,
  chapterIndex,
  totalChapters,
  state,
  onBack,
  onSearch,
  onFilterChange,
  onFilterReset,
  onFilterApply,
  onGenerate,
  onClosePanel,
  onPageChange,
  bibliography: bibliographyProp,
  onBibChange,
}) {
  const PER_PAGE = 20;
  const status   = state.status || (chapter.generated ? 'completed' : 'draft');

  const editorRef = useRef(null);

  // Saved cursor range for citation insertion
  const savedRangeRef = useRef(null);

  // Bibliography — use prop when provided (BookModule), else local fallback
  const [localBib, setLocalBib] = useState({ refs: [], nextIndex: 1 });
  const bibliography = bibliographyProp ?? localBib;
  const setBibliography = onBibChange ?? setLocalBib;

  // Results panel visibility (collapsible)
  const [resultsOpen, setResultsOpen] = useState(true);

  // Draggable split width for results column (px), null = default CSS width
  const [splitWidth, setSplitWidth] = useState(null);
  const splitContainerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const newWidth = Math.max(180, Math.min(clientX - rect.left, rect.width * 0.65));
      setSplitWidth(newWidth);
    }

    function onUp() {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }, []);

  // Track if editor has been populated from generated data
  const populatedRef = useRef(false);

  // ── Populate editor when chapter data lands ──────────────────────────
  useEffect(() => {
    if (state.chapter && !populatedRef.current) {
      const html = chapterDataToHtml(state.chapter);
      editorRef.current?.setContent(html);
      populatedRef.current = true;
    }
  }, [state.chapter]);

  // Reset populated flag when chapter changes
  useEffect(() => {
    populatedRef.current = false;
  }, [chapter.id]);

  // ── Citation insertion ───────────────────────────────────────────────
  const handleInsertCitation = useCallback((marker, bibIndex) => {
    editorRef.current?.insertCitation(marker, savedRangeRef.current);
    editorRef.current?.focus();
  }, []);

  // Save cursor position in editor when editor loses focus to reference sidebar
  function handleEditorFocused() {
    // We capture cursor in the editor component's onMouseDown
    // and expose via the ref — but we also save it here as a fallback
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      try { savedRangeRef.current = sel.getRangeAt(0).cloneRange(); }
      catch { /* ignore */ }
    }
  }

  return (
    <div className="ws-root">
      <WorkspaceHeader
        chapter={chapter}
        index={chapterIndex}
        total={totalChapters}
        status={status}
        sourcesFound={state.sourcesFound ?? 0}
        onBack={onBack}
      />

      {/* ── Search row ─────────────────────────────────────────────────── */}
      <div className="ws-search-area">
        <SearchBar
          onSearch={q => onSearch(q, { newQuery: true })}
          loading={state.loading}
          placeholder={`Search evidence for: ${chapter.title}`}
        />
        <StatusBar message={state.statusMsg} visible={state.loading} />

        {state.results !== null && (
          <FilterBar
            domainFilter={state.domainFilter}
            studyTypeFilter={state.studyTypeFilter}
            yearMin={state.yearMin}
            yearMax={state.yearMax}
            qualityFilter={state.qualityFilter}
            facets={state.facets}
            onFilter={onFilterChange}
            onReset={onFilterReset}
            onApply={onFilterApply}
          />
        )}
      </div>

      {/* ── Main split pane ────────────────────────────────────────────── */}
      <div className="ws-split" ref={splitContainerRef}>

        {/* Left: Results panel (collapsible) */}
        {state.results !== null && (
          <div
            className={`ws-results-col${resultsOpen ? '' : ' ws-results-col-closed'}`}
            style={resultsOpen && splitWidth ? { width: splitWidth, minWidth: splitWidth, maxWidth: splitWidth } : undefined}
          >
            <button
              className="ws-results-toggle"
              onClick={() => setResultsOpen(o => !o)}
              title={resultsOpen ? 'Hide results' : 'Show results'}
            >
              {resultsOpen ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Hide Sources
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Show Sources ({state.total})
                </>
              )}
            </button>

            {resultsOpen && (
              <ResultsList
                refs={state.results}
                query={state.query}
                total={state.total}
                page={state.page}
                perPage={PER_PAGE}
                fallback={state.fallback}
                onPageChange={onPageChange}
                onChapter={onGenerate}
                chapterLoading={state.chapterLoading}
              />
            )}
          </div>
        )}

        {/* Draggable divider — only shown when results panel is open */}
        {state.results !== null && resultsOpen && (
          <div
            className="ws-drag-divider"
            onMouseDown={startDrag}
            onTouchStart={startDrag}
            title="Drag to resize"
          >
            <div className="ws-drag-handle" />
          </div>
        )}

        {/* Right: Editor + References */}
        <div className="ws-editor-col">
          {/* Editor pane */}
          <div className="ws-editor-pane" onMouseUp={handleEditorFocused} onKeyUp={handleEditorFocused}>
            {/* Loading overlay while generating */}
            {state.chapterLoading && (
              <div className="ws-editor-generating">
                <div className="ws-gen-spinner" />
                <span>Generating chapter from {state.results?.length ?? 0} sources…</span>
              </div>
            )}
            {state.chapterError && (
              <div className="ws-editor-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {state.chapterError}
                <button className="ws-error-dismiss" onClick={onClosePanel}>Dismiss</button>
              </div>
            )}
            <ChapterEditor ref={editorRef} />
          </div>

          {/* References sidebar */}
          <ReferencesSidebar
            papers={state.results || []}
            bibliography={bibliography}
            onBibChange={setBibliography}
            onInsertCitation={handleInsertCitation}
          />
        </div>
      </div>
    </div>
  );
}
