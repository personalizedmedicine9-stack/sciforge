import ResultCard from './ResultCard.jsx';

function Pagination({ page, perPage, total, onPageChange }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="pagination">
      <button
        className="page-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        &#8249; Prev
      </button>
      {start > 1 && <>
        <button className="page-btn" onClick={() => onPageChange(1)}>1</button>
        {start > 2 && <span className="page-ellipsis">…</span>}
      </>}
      {pages.map(p => (
        <button
          key={p}
          className={`page-btn${p === page ? ' page-btn-active' : ''}`}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      {end < totalPages && <>
        {end < totalPages - 1 && <span className="page-ellipsis">…</span>}
        <button className="page-btn" onClick={() => onPageChange(totalPages)}>{totalPages}</button>
      </>}
      <button
        className="page-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next &#8250;
      </button>
    </div>
  );
}

export default function ResultsList({ refs, query, total, page, perPage, fallback, onExport, onPageChange, onSynthesize, synthLoading, onChapter, chapterLoading }) {
  if (!refs) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <h3>Search scientific literature</h3>
        <p>
          Enter a query above — e.g.&nbsp;
          <em>curcumin anti-inflammatory</em>,&nbsp;
          <em>quercetin bioavailability</em>,&nbsp;
          <em>artemisinin malaria</em>
        </p>
      </div>
    );
  }

  if (refs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <h3>No results found</h3>
        <p>Try a different query, or remove some filters.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="results-meta">
        <span className="results-count">
          <strong>{total.toLocaleString()}</strong> result{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          {fallback && <span className="fallback-badge"> (direct mode)</span>}
        </span>
        <div className="results-actions">
          {onSynthesize && (
            <button
              className={`synth-btn${synthLoading ? ' synth-btn-loading' : ''}`}
              onClick={onSynthesize}
              disabled={synthLoading}
              title="Enhance a structured evidence-based review from these results"
            >
              {synthLoading ? (
                <><span className="synth-btn-spinner" />Synthesizing…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Enhance Review
                  <span className="synth-btn-badge">Beta</span>
                </>
              )}
            </button>
          )}
          {onChapter && (
            <button
              className={`synth-btn chapter-btn${chapterLoading ? ' synth-btn-loading' : ''}`}
              onClick={onChapter}
              disabled={chapterLoading}
              title="Enhance a full academic chapter from these results"
            >
              {chapterLoading ? (
                <><span className="synth-btn-spinner" />Building Chapter…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                  </svg>
                  Enhance Chapter
                  <span className="synth-btn-badge">Beta</span>
                </>
              )}
            </button>
          )}
          <button className="export-btn" onClick={onExport}>Export (.txt)</button>
        </div>
      </div>

      {refs.map((r, i) => (
        <ResultCard key={r.id || r.pmid || `r-${i}`} result={r} idx={i} query={query} />
      ))}

      <Pagination page={page} perPage={perPage} total={total} onPageChange={onPageChange} />
    </div>
  );
}
