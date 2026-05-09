import { useState, useCallback } from 'react';
import { buildCitation } from '../lib/research.js';

// ── Citation badge ────────────────────────────────────────────────────────
function EvidenceDot({ level }) {
  const colors = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#94a3b8' };
  const color  = colors[level] || colors.D;
  return (
    <span
      className="rsb-ev-dot"
      style={{ background: color }}
      title={`Evidence level ${level}`}
    />
  );
}

// ── Single reference entry (in bibliography list) ─────────────────────────
function BibEntry({ ref: r, index, onRemove, onInsert }) {
  return (
    <div className="rsb-bib-entry">
      <div className="rsb-bib-index">[{index}]</div>
      <div className="rsb-bib-body">
        <div className="rsb-bib-title">
          {r.doi
            ? <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" className="rsb-bib-link">{r.title}</a>
            : r.title
          }
        </div>
        <div className="rsb-bib-meta">
          {r.year    && <span>{r.year}</span>}
          {r.journal && <span>{r.journal}</span>}
          {r._level  && <EvidenceDot level={r._level} />}
        </div>
      </div>
      <div className="rsb-bib-actions">
        <button className="rsb-insert-btn" onClick={() => onInsert(index)} title={`Insert [${index}] at cursor`}>
          [{index}]
        </button>
        <button className="rsb-remove-btn" onClick={() => onRemove(r.id)} title="Remove from bibliography">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Compact paper row in search results ──────────────────────────────────
function PaperRow({ paper, isCited, onCite }) {
  const level    = paper._level || paper.level || 'D';
  const citation = buildCitation(paper);

  return (
    <div className={`rsb-paper-row${isCited ? ' rsb-paper-cited' : ''}`}>
      <div className="rsb-paper-head">
        <EvidenceDot level={level} />
        <span className="rsb-paper-title">{paper.title}</span>
        {isCited && (
          <span className="rsb-cited-badge">Cited</span>
        )}
      </div>
      <div className="rsb-paper-meta">
        {paper.year && <span>{paper.year}</span>}
        {paper.journal && <span className="rsb-paper-journal">{paper.journal}</span>}
        {paper.study_type && <span>{paper.study_type}</span>}
      </div>
      {!isCited && (
        <button
          className="rsb-cite-btn"
          onClick={() => onCite(paper)}
          title="Add to bibliography and insert citation"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Cite
        </button>
      )}
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────
export default function ReferencesSidebar({
  papers = [],      // current search results
  bibliography,     // { refs: [], nextIndex }
  onBibChange,      // (newBib) => void
  onInsertCitation, // (marker, index) => void  — inserts [N] into editor
}) {
  const [tab, setTab] = useState('sources'); // 'sources' | 'bibliography'
  const [searchFilter, setSearchFilter] = useState('');

  // Safe defaults — guard against undefined/null bibliography prop
  const safeBib = bibliography && Array.isArray(bibliography.refs)
    ? bibliography
    : { refs: [], nextIndex: 1 };

  const citedIds = new Set(safeBib.refs.map(r => r.id));

  // ── Add paper to bibliography ────────────────────────────────────────
  function handleCite(paper) {
    if (citedIds.has(paper.id)) return;
    const idx    = safeBib.nextIndex;
    const newRef = { ...paper, bibIndex: idx };
    const newBib = {
      refs:      [...safeBib.refs, newRef],
      nextIndex: idx + 1,
    };
    onBibChange(newBib);
    onInsertCitation(`[${idx}]`, idx);
  }

  // ── Remove from bibliography ─────────────────────────────────────────
  function handleRemove(paperId) {
    const idx    = safeBib.refs.findIndex(r => r.id === paperId);
    if (idx === -1) return;
    const newRefs = safeBib.refs
      .filter(r => r.id !== paperId)
      .map((r, i) => ({ ...r, bibIndex: i + 1 }));
    onBibChange({ refs: newRefs, nextIndex: newRefs.length + 1 });
  }

  // ── Re-insert a citation marker ──────────────────────────────────────
  function handleInsert(bibIndex) {
    onInsertCitation(`[${bibIndex}]`, bibIndex);
  }

  // ── Export bibliography as text ──────────────────────────────────────
  function handleExportBib() {
    if (!safeBib.refs.length) return;
    const lines = safeBib.refs.map((r, i) =>
      `[${i + 1}] ${buildCitation(r)}${r.doi ? ` https://doi.org/${r.doi}` : ''}`
    );
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'bibliography.txt';
    a.click(); URL.revokeObjectURL(url);
  }

  const filteredPapers = papers.filter(p =>
    !searchFilter || p.title?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <aside className="rsb-root">
      {/* Header */}
      <div className="rsb-header">
        <div className="rsb-header-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          References
        </div>
        <div className="rsb-bib-count">{safeBib.refs.length} cited</div>
      </div>

      {/* Tabs */}
      <div className="rsb-tabs">
        <button
          className={`rsb-tab${tab === 'sources' ? ' rsb-tab-active' : ''}`}
          onClick={() => setTab('sources')}
        >
          Sources
          {papers.length > 0 && <span className="rsb-tab-count">{papers.length}</span>}
        </button>
        <button
          className={`rsb-tab${tab === 'bibliography' ? ' rsb-tab-active' : ''}`}
          onClick={() => setTab('bibliography')}
        >
          Bibliography
          {safeBib.refs.length > 0 && <span className="rsb-tab-count">{safeBib.refs.length}</span>}
        </button>
      </div>

      {/* Sources tab */}
      {tab === 'sources' && (
        <div className="rsb-body">
          {papers.length === 0 ? (
            <div className="rsb-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <p>Search for papers above to find citable sources.</p>
            </div>
          ) : (
            <>
              <div className="rsb-search-filter">
                <input
                  className="rsb-filter-input"
                  type="text"
                  placeholder="Filter papers…"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                />
              </div>
              <div className="rsb-papers-list">
                {filteredPapers.map(p => (
                  <PaperRow
                    key={p.id || p.pmid}
                    paper={p}
                    isCited={citedIds.has(p.id)}
                    onCite={handleCite}
                  />
                ))}
                {filteredPapers.length === 0 && searchFilter && (
                  <div className="rsb-empty rsb-empty-sm">No matching papers.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Bibliography tab */}
      {tab === 'bibliography' && (
        <div className="rsb-body">
          {safeBib.refs.length === 0 ? (
            <div className="rsb-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
              <p>Click "Cite" on a paper to add it here and insert [N] into the editor.</p>
            </div>
          ) : (
            <>
              <div className="rsb-bib-list">
                {safeBib.refs.map((r, i) => (
                  <BibEntry
                    key={r.id || r.pmid || i}
                    ref={r}
                    index={i + 1}
                    onRemove={handleRemove}
                    onInsert={handleInsert}
                  />
                ))}
              </div>
              <button className="rsb-export-bib-btn" onClick={handleExportBib}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export Bibliography
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
