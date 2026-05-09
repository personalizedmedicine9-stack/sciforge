import { useState, useRef } from 'react';

// ── Status badge ──────────────────────────────────────────────────────────
const STATUS_META = {
  draft:      { label: 'Draft',               cls: 'cds-badge-draft',      dot: true  },
  searching:  { label: 'Searching Sources…',  cls: 'cds-badge-searching',  dot: false },
  generating: { label: 'Generating…',         cls: 'cds-badge-generating', dot: false },
  completed:  { label: 'Completed',           cls: 'cds-badge-completed',  dot: true  },
  error:      { label: 'Error',               cls: 'cds-badge-error',      dot: true  },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`cds-badge ${meta.cls}`}>
      {status === 'searching' || status === 'generating' ? (
        <span className="cds-badge-spinner" />
      ) : (
        meta.dot && <span className="cds-badge-dot" />
      )}
      {meta.label}
    </span>
  );
}

// ── Inline rename ─────────────────────────────────────────────────────────
function InlineRename({ chapter, onRename }) {
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(chapter.title);
  const inputRef = useRef(null);

  function start(e) {
    e.stopPropagation();
    setDraft(chapter.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commit() {
    const t = draft.trim();
    if (t && t !== chapter.title) onRename(chapter.id, t);
    setEditing(false);
  }
  function handleKey(e) {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') { setEditing(false); setDraft(chapter.title); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="cds-title-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        maxLength={120}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="cds-title-row">
      <span className="cds-card-title">{chapter.title}</span>
      <button className="cds-rename-btn" onClick={start} title="Rename chapter">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  );
}

// ── Single chapter card ───────────────────────────────────────────────────
function ChapterCard({ chapter, index, chapterState, onOpen, onRename }) {
  const st     = chapterState || {};
  const status = st.status || (chapter.generated ? 'completed' : 'draft');
  const sources = st.sourcesFound ?? 0;
  const hasSources = sources > 0;

  return (
    <div
      className={`cds-card${status === 'completed' ? ' cds-card-completed' : ''}${status === 'error' ? ' cds-card-error' : ''}`}
      onClick={() => onOpen(chapter.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(chapter.id)}
      aria-label={`Open chapter ${index + 1}: ${chapter.title}`}
    >
      {/* Glassmorphism top accent bar */}
      <div className={`cds-card-accent${status === 'completed' ? ' cds-card-accent-done' : ''}`} />

      {/* Card header */}
      <div className="cds-card-head">
        <div className="cds-chapter-num">
          {status === 'completed' ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            index + 1
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Chapter label */}
      <div className="cds-chapter-label">Chapter {index + 1}</div>

      {/* Title with rename */}
      <div onClick={e => e.stopPropagation()}>
        <InlineRename chapter={chapter} onRename={onRename} />
      </div>

      {/* Subheadings preview */}
      {chapter.subheadings?.length > 0 && (
        <div className="cds-subheadings">
          {chapter.subheadings.slice(0, 3).map((s, i) => (
            <span key={i} className="cds-sub-tag">{s}</span>
          ))}
          {chapter.subheadings.length > 3 && (
            <span className="cds-sub-more">+{chapter.subheadings.length - 3}</span>
          )}
        </div>
      )}

      {/* Sources found area */}
      <div className={`cds-sources${hasSources ? ' cds-sources-found' : ''}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        {status === 'searching' ? (
          <span>Searching PubMed…</span>
        ) : hasSources ? (
          <span><strong>{sources}</strong> source{sources !== 1 ? 's' : ''} found</span>
        ) : (
          <span>No sources yet</span>
        )}
      </div>

      {/* Error message */}
      {status === 'error' && st.errorMsg && (
        <div className="cds-error-msg">{st.errorMsg}</div>
      )}

      {/* Action button */}
      <div className="cds-card-footer" onClick={e => e.stopPropagation()}>
        <button
          className={`cds-gen-btn${status === 'completed' ? ' cds-gen-btn-redo' : ''}${status === 'generating' || status === 'searching' ? ' cds-gen-btn-busy' : ''}`}
          onClick={e => { e.stopPropagation(); onOpen(chapter.id); }}
          disabled={status === 'searching' || status === 'generating'}
        >
          {(status === 'searching' || status === 'generating') ? (
            <>
              <span className="cds-btn-spinner" />
              {status === 'searching' ? 'Searching…' : 'Generating…'}
            </>
          ) : status === 'completed' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.51" />
              </svg>
              Re-generate
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Generate with Evidence
            </>
          )}
        </button>

        {status === 'completed' && (
          <button
            className="cds-view-btn"
            onClick={e => { e.stopPropagation(); onOpen(chapter.id); }}
            title="View generated chapter"
          >
            View
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Timeline connector ────────────────────────────────────────────────────
function TimelineConnector({ done }) {
  return (
    <div className="cds-connector">
      <div className={`cds-connector-line${done ? ' cds-connector-done' : ''}`} />
    </div>
  );
}

// ── Global progress bar ───────────────────────────────────────────────────
function GlobalProgressBar({ chapters, chapterStates }) {
  const total     = chapters.length;
  const completed = chapters.filter(c => {
    const st = chapterStates[c.id];
    return c.generated || st?.status === 'completed';
  }).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  const statCounts = {
    completed: completed,
    searching: 0,
    generating: 0,
    error: 0,
    draft: 0,
  };
  chapters.forEach(c => {
    const s = chapterStates[c.id]?.status;
    if (!c.generated && s) {
      statCounts[s] = (statCounts[s] || 0) + 1;
    }
  });
  statCounts.draft = total - completed - (statCounts.searching || 0) - (statCounts.generating || 0) - (statCounts.error || 0);

  return (
    <div className="cds-global-progress">
      <div className="cds-gp-header">
        <div className="cds-gp-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
          </svg>
          Book Progress
        </div>
        <span className="cds-gp-pct">{pct}%</span>
      </div>

      <div className="cds-gp-bar-wrap">
        <div className="cds-gp-bar">
          <div className="cds-gp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="cds-gp-fraction">{completed} / {total} chapters</div>
      </div>

      <div className="cds-gp-stats">
        {completed > 0 && (
          <span className="cds-stat cds-stat-done">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {completed} completed
          </span>
        )}
        {(statCounts.searching + statCounts.generating) > 0 && (
          <span className="cds-stat cds-stat-active">
            <span className="cds-stat-spinner" />
            {statCounts.searching + statCounts.generating} active
          </span>
        )}
        {statCounts.draft > 0 && (
          <span className="cds-stat cds-stat-draft">
            {statCounts.draft} pending
          </span>
        )}
        {statCounts.error > 0 && (
          <span className="cds-stat cds-stat-err">
            {statCounts.error} errors
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────
export default function ChapterDashboard({ bookTitle, chapters, chapterStates, onOpenChapter, onRenameChapter }) {
  return (
    <div className="cds-root">
      <GlobalProgressBar chapters={chapters} chapterStates={chapterStates} />

      <div className="cds-timeline">
        {chapters.map((ch, i) => (
          <div key={ch.id} className="cds-timeline-item">
            <ChapterCard
              chapter={ch}
              index={i}
              chapterState={chapterStates[ch.id]}
              onOpen={onOpenChapter}
              onRename={onRenameChapter}
            />
            {i < chapters.length - 1 && (
              <TimelineConnector
                done={
                  ch.generated ||
                  chapterStates[ch.id]?.status === 'completed'
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
