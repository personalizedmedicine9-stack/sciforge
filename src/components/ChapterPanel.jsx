import { useState } from 'react';

// ── Shared sub-components ─────────────────────────────────────────────────

function CollapseSection({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ch-section">
      <button className="ch-section-header" onClick={() => setOpen(o => !o)}>
        <span className="ch-section-title">
          <span className="ch-section-icon">{icon}</span>
          {title}
        </span>
        <span className={`ch-chevron${open ? ' ch-chevron-open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="ch-section-body">{children}</div>}
    </div>
  );
}

function EvidenceBadge({ level }) {
  if (!level) return null;
  return <span className={`syn-ev-badge ev-${(level || 'D').toLowerCase()}`}>Level {level}</span>;
}

const MODE_LABELS = {
  chapter_basic:    { label: 'Basic',    cls: 'syn-mode-basic'     },
  chapter_enhanced: { label: 'Enhanced', cls: 'syn-mode-structured' },
  chapter_ai:       { label: 'AI',       cls: 'syn-mode-ai'        },
};

function ModeBadge({ mode }) {
  const m = MODE_LABELS[mode] || MODE_LABELS.chapter_enhanced;
  return <span className={`syn-mode-badge ${m.cls}`}>{m.label}</span>;
}

function ReferenceList({ refs }) {
  if (!refs?.length) return null;
  return (
    <ol className="syn-ref-list">
      {refs.map(r => (
        <li key={r.index} className="syn-ref">
          <span className="syn-ref-idx">{r.index}</span>
          <div className="syn-ref-body">
            <span className="syn-ref-title">
              {r.doi
                ? <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" className="syn-ref-link">{r.title}</a>
                : r.title
              }
            </span>
            <div className="syn-ref-meta">
              {r.year       && <span>{r.year}</span>}
              {r.journal    && <span>{r.journal}</span>}
              {r.study_type && <span>{r.study_type}</span>}
              {r.evidence_level && <EvidenceBadge level={r.evidence_level} />}
              {r.citations  > 0 && <span className="syn-ref-cites">{r.citations} citations</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Section icons (inline SVG, consistent 15×15)
const ICONS = {
  intro: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  chemistry: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  ),
  mechanism: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93A10 10 0 005.27 18.6M4.93 19.07A10 10 0 0018.73 5.4" />
    </svg>
  ),
  flask: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v8l-4 9h14l-4-9V3" />
    </svg>
  ),
  clinical: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  warning: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  future: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  refs: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
};

// ── Main component ────────────────────────────────────────────────────────

export default function ChapterPanel({ data, query, papersUsed, loading, error, onClose }) {
  if (loading) {
    return (
      <div className="ch-panel syn-loading">
        <div className="syn-loading-inner">
          <div className="syn-spinner" />
          <div className="syn-loading-text">
            <strong>Enhancing scientific chapter…</strong>
            <span>Profiling compound · Building sections · Mapping citations</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ch-panel syn-error">
        <div className="syn-error-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Chapter Error
        </div>
        <p className="syn-error-msg">{error}</p>
        <button className="syn-close-btn" onClick={onClose}>Dismiss</button>
      </div>
    );
  }

  if (!data) return null;

  const {
    mode, title, compound_class,
    introduction, chemical_profile, mechanisms, preclinical, clinical,
    limitations, future_directions,
    evidence_summary, evidence_density, mechanisms_list, references,
  } = data;

  return (
    <div className="ch-panel">
      {/* Header */}
      <div className="ch-panel-header">
        <div className="ch-panel-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
          </svg>
          Evidence-Grounded Chapter
          <ModeBadge mode={mode} />
        </div>
        <h2 className="ch-panel-title">{title}</h2>
        <div className="ch-panel-meta">
          {query && <span>Topic: <em>{query}</em></span>}
          {compound_class && <span className="ch-compound-badge">{compound_class}</span>}
          <span><strong>{papersUsed ?? references?.length ?? 0}</strong> studies</span>
          {evidence_density != null && (
            <span className="syn-density">Density: <strong>{evidence_density}%</strong></span>
          )}
        </div>
        <button className="syn-close-btn syn-close-top" onClick={onClose} title="Close chapter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Evidence counts strip */}
      {evidence_summary && (
        <div className="ch-ev-strip">
          {[
            { label: 'Total',     n: evidence_summary.total,    cls: '' },
            { label: 'RCT',       n: evidence_summary.rct,      cls: 'ev-bar-rct' },
            { label: 'Cohort',    n: evidence_summary.cohort,   cls: 'ev-bar-cohort' },
            { label: 'In Vitro',  n: evidence_summary.in_vitro, cls: 'ev-bar-invitro' },
            { label: 'Animal',    n: evidence_summary.animal,   cls: 'ev-bar-animal' },
            { label: 'Review',    n: evidence_summary.review,   cls: 'ev-bar-review' },
          ].filter(s => s.n > 0).map(s => (
            <div key={s.label} className={`ch-ev-cell ${s.cls}`}>
              <span className="ch-ev-n">{s.n}</span>
              <span className="ch-ev-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mechanism tags */}
      {mechanisms_list?.length > 0 && (
        <div className="syn-mechanisms">
          <span className="syn-mechanisms-label">Pathways:</span>
          <div className="syn-mech-chips">
            {mechanisms_list.map(m => (
              <span key={m} className="syn-mech-chip">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* 7 sections */}
      <div className="ch-sections">
        <CollapseSection title="1. Introduction"                       icon={ICONS.intro}     defaultOpen={true}>
          <p className="ch-prose">{introduction}</p>
        </CollapseSection>

        <CollapseSection title="2. Chemical & Pharmacological Profile"  icon={ICONS.chemistry}>
          <p className="ch-prose">{chemical_profile}</p>
        </CollapseSection>

        <CollapseSection title="3. Mechanisms of Action"               icon={ICONS.mechanism} defaultOpen={true}>
          <p className="ch-prose">{mechanisms}</p>
        </CollapseSection>

        <CollapseSection title="4. Preclinical Evidence"               icon={ICONS.flask}     defaultOpen={true}>
          <p className="ch-prose">{preclinical}</p>
        </CollapseSection>

        <CollapseSection title="5. Clinical Evidence"                  icon={ICONS.clinical}  defaultOpen={true}>
          <p className="ch-prose">{clinical}</p>
        </CollapseSection>

        <CollapseSection title="6. Limitations"                        icon={ICONS.warning}>
          <p className="ch-prose">{limitations}</p>
        </CollapseSection>

        <CollapseSection title="7. Future Directions"                  icon={ICONS.future}>
          <p className="ch-prose">{future_directions}</p>
        </CollapseSection>

        <CollapseSection title="References" icon={ICONS.refs} count={references?.length}>
          <ReferenceList refs={references} />
        </CollapseSection>
      </div>

      <div className="syn-disclaimer">
        Evidence-grounded chapter enhanced from retrieved papers only. All claims are source-locked to the retrieved evidence set. For clinical or publication use, verify against primary sources.
      </div>
    </div>
  );
}

ChapterPanel.defaultProps = { data: null, loading: false, error: null };
