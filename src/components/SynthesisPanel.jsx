import { useState, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────

function CollapseSection({ title, icon, count, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="syn-section">
      <button className="syn-section-header" onClick={() => setOpen(o => !o)}>
        <span className="syn-section-title">
          <span className="syn-section-icon">{icon}</span>
          {title}
          {count != null && <span className="syn-section-count">{count}</span>}
          {badge}
        </span>
        <span className={`syn-chevron${open ? ' syn-chevron-open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="syn-section-body">{children}</div>}
    </div>
  );
}

function EvidenceBadge({ level }) {
  if (!level) return null;
  return <span className={`syn-ev-badge ev-${(level || 'D').toLowerCase()}`}>Level {level}</span>;
}

// ── Editable prose block ──────────────────────────────────────────────────
function EditableProse({ initialContent, onContentChange, sectionKey }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceMetrics, setEnhanceMetrics] = useState(null);

  const handleBlur = useCallback(() => {
    setEditing(false);
    onContentChange?.(sectionKey, content);
  }, [content, onContentChange, sectionKey]);

  const handleEnhance = useCallback(async (tone) => {
    if (!content?.trim()) return;
    setEnhancing(true);
    setEnhanceMetrics(null);
    try {
      const res = await fetch('/api/rewrite-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, tone }),
        signal: AbortSignal.timeout(35_000),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Enhancement failed');
      setContent(data.rewritten);
      onContentChange?.(sectionKey, data.rewritten);
      setEnhanceMetrics({
        original_word_count: data.original_word_count,
        rewritten_word_count: data.rewritten_word_count,
        expansion_ratio: data.expansion_ratio,
        enhancement_mode: data.enhancement_mode || data.tone,
        ai_assisted: data.ai_assisted,
        mode: data.mode,
      });
    } catch (err) {
      console.error('Enhancement failed:', err.message);
    } finally {
      setEnhancing(false);
    }
  }, [content, onContentChange, sectionKey]);

  const [showModes, setShowModes] = useState(false);

  return (
    <div className="syn-editable-block">
      {editing ? (
        <textarea
          className="syn-editable-textarea"
          value={content}
          onChange={e => setContent(e.target.value)}
          onBlur={handleBlur}
          autoFocus
        />
      ) : (
        <p
          className="syn-prose syn-prose-editable"
          onClick={() => setEditing(true)}
          title="Click to edit this section"
        >
          {content}
        </p>
      )}
      <div className="syn-edit-actions">
        <button
          className="syn-edit-btn"
          onClick={() => setEditing(!editing)}
          title="Edit this section"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
        <div className="syn-enhance-wrap" style={{ position: 'relative' }}>
          <button
            className={`syn-edit-btn${enhancing ? ' syn-enhance-loading' : ''}`}
            onClick={() => setShowModes(!showModes)}
            disabled={enhancing}
            title="Academic Enhancement"
          >
            {enhancing ? (
              <><span className="ced-rewrite-spinner" /> Enhancing…</>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.51" />
                </svg>
                Enhance
              </>
            )}
          </button>
          {showModes && !enhancing && (
            <div className="ced-tone-menu ced-enhance-menu">
              <div className="ced-tone-menu-title">Enhance as:</div>
              {[
                { value: 'publication_ready', label: 'Publication Ready' },
                { value: 'scientific_academic', label: 'Scientific Academic' },
                { value: 'narrative_review', label: 'Narrative Review' },
                { value: 'explanatory_expansion', label: 'Explanatory Expansion' },
                { value: 'concise', label: 'Concise' },
                { value: 'graduate_student', label: 'Graduate Student' },
              ].map(m => (
                <button
                  key={m.value}
                  className="ced-tone-item"
                  onMouseDown={e => { e.preventDefault(); setShowModes(false); handleEnhance(m.value); }}
                  type="button"
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {enhanceMetrics && (
        <div className="ced-metrics" style={{ marginTop: '6px' }}>
          <div className="ced-metrics-row">
            <span className="ced-metric">
              <span className="ced-metric-label">Original</span>
              <span className="ced-metric-value">{enhanceMetrics.original_word_count} words</span>
            </span>
            <span className="ced-metric-sep">→</span>
            <span className="ced-metric">
              <span className="ced-metric-label">Enhanced</span>
              <span className="ced-metric-value">{enhanceMetrics.rewritten_word_count} words</span>
            </span>
            <span className="ced-metric">
              <span className="ced-metric-label">Ratio</span>
              <span className="ced-metric-value">{enhanceMetrics.expansion_ratio}%</span>
            </span>
            <span className="ced-metric">
              <span className="ced-metric-label">AI</span>
              <span className={`ced-metric-value ${enhanceMetrics.ai_assisted ? 'ced-metric-ai' : 'ced-metric-rule'}`}>
                {enhanceMetrics.ai_assisted ? (enhanceMetrics.mode === 'gemini' ? 'Gemini' : 'OpenAI') : 'Rule-based'}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Render a section that may be a string (deterministic) or array of claim objects (AI)
function SectionContent({ content, sectionKey, onContentChange }) {
  if (!content) return <p className="syn-empty">No content available.</p>;

  if (typeof content === 'string') {
    return <EditableProse initialContent={content} onContentChange={onContentChange} sectionKey={sectionKey} />;
  }

  if (Array.isArray(content)) {
    if (content.length === 0) return <p className="syn-empty">No items found.</p>;
    return (
      <ul className="syn-claim-list">
        {content.map((c, i) => (
          <li key={i} className="syn-claim">
            <EditableProse initialContent={c.text} onContentChange={(key, val) => {
              // Update the claim text in the array
              const newContent = [...content];
              newContent[i] = { ...c, text: val };
              onContentChange?.(sectionKey, newContent);
            }} sectionKey={`${sectionKey}.${i}`} />
            {(c.evidence_summary || c.citations?.length > 0) && (
              <div className="syn-claim-meta">
                {c.evidence_summary && <span className="syn-ev-summary">{c.evidence_summary}</span>}
                {c.citations?.length > 0 && (
                  <div className="syn-cite-chips">
                    {c.citations.map(n => (
                      <span key={n} className="syn-cite-chip">[{n}]</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

// Evidence summary bar — visual breakdown of study types
function EvidenceSummaryBar({ summary }) {
  if (!summary) return null;
  const { total, rct, cohort, in_vitro, animal, review } = summary;
  if (!total) return null;

  const segments = [
    { label: 'RCT',           n: rct    || 0, cls: 'ev-bar-rct'     },
    { label: 'Cohort',        n: cohort || 0, cls: 'ev-bar-cohort'  },
    { label: 'Review',        n: review || 0, cls: 'ev-bar-review'  },
    { label: 'Animal',        n: animal || 0, cls: 'ev-bar-animal'  },
    { label: 'In Vitro',      n: in_vitro || 0, cls: 'ev-bar-invitro' },
  ].filter(s => s.n > 0);

  return (
    <div className="syn-ev-bar-wrap">
      <div className="syn-ev-bar">
        {segments.map(s => (
          <div
            key={s.label}
            className={`syn-ev-bar-seg ${s.cls}`}
            style={{ flex: s.n }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>
      <div className="syn-ev-bar-legend">
        {segments.map(s => (
          <span key={s.label} className={`syn-ev-bar-chip ${s.cls}`}>
            {s.label} <strong>{s.n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// Mechanism chips
function MechanismChips({ mechanisms }) {
  if (!mechanisms?.length) return null;
  return (
    <div className="syn-mechanisms">
      <span className="syn-mechanisms-label">Detected pathways:</span>
      <div className="syn-mech-chips">
        {mechanisms.map(m => (
          <span key={m} className="syn-mech-chip">{m}</span>
        ))}
      </div>
    </div>
  );
}

// Mode badge
const MODE_LABELS = {
  basic:      { label: 'Basic',       cls: 'syn-mode-basic'     },
  structured: { label: 'Structured',  cls: 'syn-mode-structured' },
  ai:         { label: 'AI-Enhanced', cls: 'syn-mode-ai'        },
};

function ModeBadge({ mode }) {
  const m = MODE_LABELS[mode] || MODE_LABELS.structured;
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
              {r.doi        && <span className="syn-ref-doi">{r.doi}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────
function exportReviewAsText(data, query) {
  const lines = [
    `SCIFORGE — Evidence-Grounded Review`,
    `Topic: ${query}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    `Mode: ${data.mode || 'structured'}`,
    `Papers used: ${data.papers_used || 0}`,
    '',
    '═══ OVERVIEW ═══',
    data.overview || '',
    '',
    '═══ MECHANISTIC INSIGHTS ═══',
    Array.isArray(data.mechanistic_insights)
      ? data.mechanistic_insights.map(c => typeof c === 'string' ? c : c.text).join('\n\n')
      : data.mechanistic_insights || '',
    '',
    '═══ CLINICAL EVIDENCE ═══',
    Array.isArray(data.clinical_evidence)
      ? data.clinical_evidence.map(c => typeof c === 'string' ? c : c.text).join('\n\n')
      : data.clinical_evidence || '',
    '',
    '═══ LIMITATIONS ═══',
    data.limitations || '',
    '',
    '═══ CONCLUSION ═══',
    data.conclusion || '',
    '',
    '═══ REFERENCES ═══',
    ...(data.references || []).map(r =>
      `[${r.index}] ${r.title}${r.year ? ` (${r.year})` : ''}${r.journal ? `. ${r.journal}` : ''}${r.doi ? `. https://doi.org/${r.doi}` : ''}`
    ),
  ];

  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `review_${query.replace(/\s+/g, '_').slice(0, 40)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────

export default function SynthesisPanel({ data, query, papersUsed, loading, error, onClose }) {
  // Track editable content state
  const [editedData, setEditedData] = useState(null);

  // When new data arrives, reset edited state
  const currentData = editedData || data;

  function handleContentChange(key, value) {
    setEditedData(prev => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="syn-panel syn-loading">
        <div className="syn-loading-inner">
          <div className="syn-spinner" />
          <div className="syn-loading-text">
            <strong>Enhancing evidence-based review…</strong>
            <span>Grouping studies · Extracting mechanisms · Building sections</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="syn-panel syn-error">
        <div className="syn-error-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Review Error
        </div>
        <p className="syn-error-msg">{error}</p>
        <button className="syn-close-btn" onClick={onClose}>Dismiss</button>
      </div>
    );
  }

  if (!data) return null;

  const {
    mode, overview, mechanistic_insights, clinical_evidence,
    limitations, conclusion, evidence_summary, evidence_density,
    mechanisms, references,
  } = currentData;

  const pct      = evidence_density ?? null;
  const refsLen  = references?.length ?? 0;
  const mechLen  = Array.isArray(mechanistic_insights) ? mechanistic_insights.length : null;
  const clinLen  = Array.isArray(clinical_evidence)    ? clinical_evidence.length    : null;

  return (
    <div className="syn-panel">
      {/* Header */}
      <div className="syn-panel-header">
        <div className="syn-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Evidence-Grounded Review
          <ModeBadge mode={mode} />
        </div>
        <div className="syn-panel-meta">
          {query && <span>Query: <em>{query}</em></span>}
          <span>Enhanced from <strong>{papersUsed ?? refsLen}</strong> studies</span>
          {pct !== null && (
            <span className="syn-density">
              Evidence density: <strong>{pct}%</strong>
            </span>
          )}
        </div>
        <div className="syn-panel-actions">
          <button
            className="syn-export-btn"
            onClick={() => exportReviewAsText(currentData, query)}
            title="Export review as text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button className="syn-close-btn syn-close-top" onClick={onClose} title="Close review">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Evidence bar */}
      {evidence_summary && <EvidenceSummaryBar summary={evidence_summary} />}

      {/* Mechanisms */}
      {mechanisms?.length > 0 && <MechanismChips mechanisms={mechanisms} />}

      {/* Overview */}
      <div className="syn-overview">
        <EditableProse initialContent={overview} onContentChange={handleContentChange} sectionKey="overview" />
      </div>

      {/* Sections */}
      <div className="syn-sections">
        <CollapseSection
          title="Mechanistic Insights"
          count={mechLen}
          defaultOpen={true}
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93A10 10 0 005.27 18.6M4.93 19.07A10 10 0 0018.73 5.4" />
            </svg>
          }
        >
          <SectionContent content={mechanistic_insights} sectionKey="mechanistic_insights" onContentChange={handleContentChange} />
        </CollapseSection>

        <CollapseSection
          title="Clinical Evidence"
          count={clinLen}
          defaultOpen={true}
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        >
          <SectionContent content={clinical_evidence} sectionKey="clinical_evidence" onContentChange={handleContentChange} />
        </CollapseSection>

        <CollapseSection
          title="Limitations"
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        >
          <SectionContent content={limitations} sectionKey="limitations" onContentChange={handleContentChange} />
        </CollapseSection>

        <CollapseSection
          title="Conclusion"
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        >
          <SectionContent content={conclusion} sectionKey="conclusion" onContentChange={handleContentChange} />
        </CollapseSection>

        <CollapseSection
          title="References"
          count={refsLen}
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 72 4 2z" />
            </svg>
          }
        >
          <ReferenceList refs={references} />
        </CollapseSection>
      </div>

      <div className="syn-disclaimer">
        Evidence-grounded synthesis from retrieved papers only — no external knowledge introduced. All claims are source-locked to verified references. Verify against original sources before clinical use.
      </div>
    </div>
  );
}
