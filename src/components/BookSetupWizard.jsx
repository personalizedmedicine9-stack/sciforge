import { useState, useRef } from 'react';

function apiUrl(path) {
  return new URL(path, window.location.origin).toString();
}

// ── Editable chapter row ──────────────────────────────────────────────────
function ChapterRow({ chapter, index, total, onRename, onDelete, onMoveUp, onMoveDown }) {
  const [editing,   setEditing]   = useState(false);
  const [draftTitle, setDraftTitle] = useState(chapter.title);
  const inputRef = useRef(null);

  function startEdit() {
    setDraftTitle(chapter.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const t = draftTitle.trim();
    if (t && t !== chapter.title) onRename(chapter.id, t);
    setEditing(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setDraftTitle(chapter.title); }
  }

  return (
    <div className="wiz-chapter-row">
      {/* Order controls */}
      <div className="wiz-chapter-order">
        <button
          className="wiz-order-btn"
          onClick={() => onMoveUp(index)}
          disabled={index === 0}
          title="Move up"
          aria-label="Move chapter up"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className="wiz-order-btn"
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1}
          title="Move down"
          aria-label="Move chapter down"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Chapter number */}
      <div className="wiz-ch-n">{index + 1}</div>

      {/* Title — editable inline */}
      <div className="wiz-ch-body">
        {editing ? (
          <input
            ref={inputRef}
            className="wiz-ch-input"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKey}
            maxLength={120}
          />
        ) : (
          <button className="wiz-ch-title-btn" onClick={startEdit} title="Click to rename">
            {chapter.title}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="wiz-edit-icon">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* Subheadings preview */}
        {chapter.subheadings?.length > 0 && (
          <div className="wiz-ch-subs">
            {chapter.subheadings.map((s, si) => (
              <span key={si} className="wiz-ch-sub">{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        className="wiz-delete-btn"
        onClick={() => onDelete(chapter.id)}
        title="Remove chapter"
        aria-label="Remove chapter"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
        </svg>
      </button>
    </div>
  );
}

// ── Add chapter form ──────────────────────────────────────────────────────
function AddChapterForm({ onAdd }) {
  const [title, setTitle] = useState('');
  function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle('');
  }
  return (
    <form className="wiz-add-form" onSubmit={submit}>
      <input
        className="wiz-add-input"
        type="text"
        placeholder="Add a custom chapter title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        maxLength={120}
      />
      <button type="submit" className="wiz-add-btn" disabled={!title.trim()}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Chapter
      </button>
    </form>
  );
}

// ── Template badge ────────────────────────────────────────────────────────
const TEMPLATE_LABELS = {
  pharmacology:    { label: 'Pharmacology', color: '#0ea5a4' },
  natural_products:{ label: 'Natural Products', color: '#16a34a' },
  oncology:        { label: 'Oncology', color: '#dc2626' },
  immunology:      { label: 'Immunology', color: '#7c3aed' },
  neuroscience:    { label: 'Neuroscience', color: '#2563eb' },
  metabolic:       { label: 'Metabolic Disease', color: '#d97706' },
  antimicrobial:   { label: 'Antimicrobial', color: '#0284c7' },
  general:         { label: 'General Academic', color: '#94a3b8' },
};

// ── Main wizard ───────────────────────────────────────────────────────────
export default function BookSetupWizard({ onBookReady }) {
  const [step,        setStep]        = useState('entry'); // 'entry' | 'outline'
  const [bookTitle,   setBookTitle]   = useState('');
  const [description, setDescription] = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [error,       setError]       = useState(null);
  const [outline,     setOutline]     = useState(null);  // { chapters, template, mode }
  const [chapters,    setChapters]    = useState([]);    // editable copy

  let _idSeq = useRef(1000);
  function freshId() { return `wiz-${_idSeq.current++}`; }

  // ── Step 1: generate outline ──────────────────────────────────────────
  async function handleGenerate(e) {
    e?.preventDefault();
    const t = bookTitle.trim();
    if (!t) return;

    setGenerating(true);
    setError(null);

    try {
      const res  = await fetch(apiUrl('/api/generate-outline'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: t, description: description.trim() }),
        signal:  AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned non-JSON (HTTP ${res.status}). Ensure backend is running.`); }
      if (!res.ok || data.error) throw new Error(data.error || `Outline API ${res.status}`);

      setOutline(data);
      // Give each chapter a fresh local id so React key is stable during edits
      setChapters(data.chapters.map(ch => ({ ...ch, id: freshId() })));
      setStep('outline');
    } catch (err) {
      setError(err.message || 'Outline generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ── Outline edit operations ───────────────────────────────────────────
  function renameChapter(id, newTitle) {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
  }

  function deleteChapter(id) {
    setChapters(prev => prev.filter(c => c.id !== id));
  }

  function addChapter(title) {
    setChapters(prev => [...prev, { id: freshId(), title, subheadings: [] }]);
  }

  function moveChapter(index, direction) {
    const next = [...chapters];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChapters(next);
  }

  // ── Confirm and hand off to the book module ──────────────────────────
  function handleConfirm() {
    if (!chapters.length) return;
    onBookReady({
      title:    bookTitle.trim(),
      template: outline?.template || 'general',
      chapters: chapters.map((ch, i) => ({
        id:          ch.id,
        title:       ch.title,
        subheadings: ch.subheadings || [],
        order:       i + 1,
        generated:   false,
      })),
    });
  }

  const tplInfo = TEMPLATE_LABELS[outline?.template] || TEMPLATE_LABELS.general;

  // ── STEP 1: Title entry ───────────────────────────────────────────────
  if (step === 'entry') {
    return (
      <div className="wiz-overlay">
        <div className="wiz-card">
          <div className="wiz-card-header">
            <div className="wiz-header-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
            </div>
            <div>
              <h2 className="wiz-card-title">Start a New Book</h2>
              <p className="wiz-card-sub">Enter your book title and we'll generate a complete academic Table of Contents</p>
            </div>
          </div>

          <form className="wiz-form" onSubmit={handleGenerate}>
            <div className="wiz-field">
              <label className="wiz-label" htmlFor="wiz-title">Book Title <span className="wiz-required">*</span></label>
              <input
                id="wiz-title"
                className="wiz-input"
                type="text"
                placeholder="e.g. Curcumin: Evidence-Based Applications in Modern Medicine"
                value={bookTitle}
                onChange={e => setBookTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
              <span className="wiz-field-hint">Be specific — the title drives the chapter structure</span>
            </div>

            <div className="wiz-field">
              <label className="wiz-label" htmlFor="wiz-desc">Description <span className="wiz-optional">(optional)</span></label>
              <textarea
                id="wiz-desc"
                className="wiz-textarea"
                placeholder="e.g. A comprehensive review of curcumin's pharmacological properties, clinical evidence, and therapeutic applications with focus on anti-inflammatory mechanisms."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={600}
              />
            </div>

            {error && (
              <div className="wiz-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <div className="wiz-form-actions">
              <button
                type="submit"
                className="wiz-generate-btn"
                disabled={!bookTitle.trim() || generating}
              >
                {generating ? (
                  <>
                    <span className="wiz-spinner" />
                    Generating outline…
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    Generate Table of Contents
                  </>
                )}
              </button>
            </div>

            <div className="wiz-info-row">
              <div className="wiz-info-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Domain-aware structure (7 specialisations)
              </div>
              <div className="wiz-info-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Fully editable before confirming
              </div>
              <div className="wiz-info-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                No AI key required
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── STEP 2: Editable outline ──────────────────────────────────────────
  return (
    <div className="wiz-overlay">
      <div className="wiz-card wiz-card-wide">
        <div className="wiz-card-header">
          <div className="wiz-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </div>
          <div>
            <h2 className="wiz-card-title">Edit Your Table of Contents</h2>
            <p className="wiz-card-sub">Rename chapters, reorder, or delete. Add custom chapters below.</p>
          </div>
        </div>

        {/* Book title + template */}
        <div className="wiz-outline-meta">
          <div className="wiz-outline-book-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            {bookTitle}
          </div>
          <span
            className="wiz-template-badge"
            style={{ background: `${tplInfo.color}18`, color: tplInfo.color, borderColor: `${tplInfo.color}33` }}
          >
            {tplInfo.label} template · {outline?.mode === 'outline_ai' ? 'AI-enhanced' : 'Deterministic'}
          </span>
        </div>

        {/* Chapters list */}
        <div className="wiz-chapters-list">
          {chapters.map((ch, i) => (
            <ChapterRow
              key={ch.id}
              chapter={ch}
              index={i}
              total={chapters.length}
              onRename={renameChapter}
              onDelete={deleteChapter}
              onMoveUp={idx => moveChapter(idx, -1)}
              onMoveDown={idx => moveChapter(idx, 1)}
            />
          ))}
        </div>

        <AddChapterForm onAdd={addChapter} />

        {/* Actions */}
        <div className="wiz-outline-actions">
          <button
            className="wiz-back-btn"
            onClick={() => { setStep('entry'); setError(null); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Change Title
          </button>
          <div className="wiz-outline-actions-right">
            <span className="wiz-ch-count">{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</span>
            <button
              className="wiz-confirm-btn"
              onClick={handleConfirm}
              disabled={!chapters.length}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Confirm &amp; Start Writing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
