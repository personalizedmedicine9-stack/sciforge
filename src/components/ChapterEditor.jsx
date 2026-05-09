import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

// ── Toolbar button ────────────────────────────────────────────────────────
function ToolBtn({ title, active, onClick, children }) {
  return (
    <button
      className={`ced-tool-btn${active ? ' ced-tool-btn-active' : ''}`}
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      tabIndex={-1}
      type="button"
    >
      {children}
    </button>
  );
}

// ── 10 Enhancement Mode definitions ────────────────────────────────────────
const ENHANCEMENT_MODES = [
  { value: 'publication_ready',     label: 'Publication Ready',      icon: '📄' },
  { value: 'narrative_review',      label: 'Narrative Review',       icon: '📋' },
  { value: 'book_chapter',          label: 'Book Chapter',           icon: '📖' },
  { value: 'formal_academic',       label: 'Formal Academic',        icon: '🎓' },
  { value: 'scientific_academic',   label: 'Scientific Academic',    icon: '🔬' },
  { value: 'explanatory_expansion', label: 'Explanatory Expansion',   icon: '🔍' },
  { value: 'critical_review',       label: 'Critical Review',        icon: '⚖️' },
  { value: 'concise',               label: 'Concise',                icon: '✂️' },
  { value: 'simplified_scientific', label: 'Simplified Scientific',   icon: '💡' },
  { value: 'graduate_student',      label: 'Graduate Student',       icon: '📝' },
];

function EnhancementMenu({ onEnhance, loading }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ced-rewrite-wrap" style={{ position: 'relative' }}>
      <button
        className={`ced-rewrite-btn${loading ? ' ced-rewrite-loading' : ''}`}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        type="button"
        disabled={loading}
        title="Academic Enhancement — improve scholarly quality"
      >
        {loading ? (
          <><span className="ced-rewrite-spinner" /> Enhancing…</>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
            Academic Enhancement
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        )}
      </button>
      {open && !loading && (
        <div className="ced-tone-menu ced-enhance-menu">
          <div className="ced-tone-menu-title">Enhance selection as:</div>
          {ENHANCEMENT_MODES.map(m => (
            <button
              key={m.value}
              className="ced-tone-item"
              onMouseDown={e => { e.preventDefault(); setOpen(false); onEnhance(m.value); }}
              type="button"
            >
              <span className="ced-mode-icon">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Word / char count ─────────────────────────────────────────────────────
function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ── Enhancement metrics display ───────────────────────────────────────────
function EnhancementMetrics({ metrics }) {
  if (!metrics) return null;
  return (
    <div className="ced-metrics">
      <div className="ced-metrics-row">
        <span className="ced-metric">
          <span className="ced-metric-label">Original</span>
          <span className="ced-metric-value">{metrics.original_word_count} words</span>
        </span>
        <span className="ced-metric-sep">→</span>
        <span className="ced-metric">
          <span className="ced-metric-label">Enhanced</span>
          <span className="ced-metric-value">{metrics.rewritten_word_count} words</span>
        </span>
        <span className="ced-metric">
          <span className="ced-metric-label">Ratio</span>
          <span className="ced-metric-value">{metrics.expansion_ratio}%</span>
        </span>
        <span className="ced-metric">
          <span className="ced-metric-label">Mode</span>
          <span className="ced-metric-value ced-metric-mode">{metrics.enhancement_mode?.replace(/_/g, ' ')}</span>
        </span>
        <span className="ced-metric">
          <span className="ced-metric-label">AI</span>
          <span className={`ced-metric-value ${metrics.ai_assisted ? 'ced-metric-ai' : 'ced-metric-rule'}`}>
            {metrics.ai_assisted ? `${metrics.mode === 'gemini' ? 'Gemini' : 'OpenAI'}` : 'Rule-based'}
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Selection utilities ───────────────────────────────────────────────────
function saveSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
}

function restoreSelection(range) {
  if (!range) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Insert text at the current cursor position (or replace selection)
function insertTextAtCursor(text) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Main editor ───────────────────────────────────────────────────────────
const ChapterEditor = forwardRef(function ChapterEditor(
  { initialHtml = '', onContentChange, onRewriteRequest },
  ref
) {
  const editorRef    = useRef(null);
  const savedSelRef  = useRef(null);   // saved range for toolbar commands
  const [html,        setHtml]        = useState(initialHtml);
  const [enhancing,   setEnhancing]   = useState(false);
  const [enhanceNote, setEnhanceNote] = useState(null);
  const [enhanceMetrics, setEnhanceMetrics] = useState(null);
  const [wordCnt,     setWordCnt]     = useState(0);
  const [hasContent,  setHasContent]  = useState(!!initialHtml);

  // ── Expose API to parent ──────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    // Stream content character-by-character into the editor
    streamContent(fullHtml) {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = fullHtml;
      updateStats();
      setHasContent(true);
    },
    // Append raw text (for streaming chunk by chunk)
    appendText(chunk) {
      if (!editorRef.current) return;
      const textNode = document.createTextNode(chunk);
      editorRef.current.appendChild(textNode);
      updateStats();
      setHasContent(true);
      // Auto-scroll
      editorRef.current.scrollTop = editorRef.current.scrollHeight;
    },
    // Replace full HTML content
    setContent(html) {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = html;
      updateStats();
      setHasContent(!!html);
    },
    // Get current HTML
    getContent() {
      return editorRef.current?.innerHTML || '';
    },
    // Insert citation marker at saved/current cursor
    insertCitation(marker, savedRange) {
      if (!editorRef.current) return;
      editorRef.current.focus();
      if (savedRange) {
        restoreSelection(savedRange);
      }
      insertTextAtCursor(marker);
      updateStats();
    },
    focus() { editorRef.current?.focus(); },
  }));

  // ── Update word count ─────────────────────────────────────────────────
  function updateStats() {
    const text = editorRef.current?.innerText || '';
    setWordCnt(wordCount(text));
    setHtml(editorRef.current?.innerHTML || '');
  }

  // ── Sync initial HTML ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialHtml && editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialHtml;
      updateStats();
      setHasContent(true);
    }
  }, [initialHtml]);

  // ── Toolbar commands ──────────────────────────────────────────────────
  function execCmd(cmd, value) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    updateStats();
  }

  function queryCmd(cmd) {
    try { return document.queryCommandState(cmd); }
    catch { return false; }
  }

  const [bold,      setBold]      = useState(false);
  const [italic,    setItalic]    = useState(false);
  const [underline, setUnderline] = useState(false);

  function refreshToolbar() {
    setBold(queryCmd('bold'));
    setItalic(queryCmd('italic'));
    setUnderline(queryCmd('underline'));
  }

  // ── Enhance selected text (Academic Enhancement) ──────────────────────
  async function handleEnhance(tone) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setEnhanceNote('Select text first, then click Academic Enhancement.');
      setTimeout(() => setEnhanceNote(null), 3000);
      return;
    }
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    const range = sel.getRangeAt(0).cloneRange();
    setEnhancing(true);
    setEnhanceNote(null);
    setEnhanceMetrics(null);

    try {
      const res  = await fetch('/api/rewrite-selection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: selectedText, tone }),
        signal:  AbortSignal.timeout(35_000),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Enhancement failed');

      // Replace selection with enhanced text
      editorRef.current?.focus();
      restoreSelection(range);
      document.execCommand('insertText', false, data.rewritten);
      updateStats();

      // Display metrics
      setEnhanceMetrics({
        original_word_count: data.original_word_count,
        rewritten_word_count: data.rewritten_word_count,
        expansion_ratio: data.expansion_ratio,
        enhancement_mode: data.enhancement_mode || data.tone,
        ai_assisted: data.ai_assisted,
        mode: data.mode,
      });

      setEnhanceNote(`Enhanced (${data.mode === 'gemini' ? 'Gemini AI' : data.mode === 'openai' ? 'OpenAI' : 'Rule-based'}, ${tone.replace(/_/g, ' ')})`);
      setTimeout(() => setEnhanceNote(null), 4000);
    } catch (err) {
      setEnhanceNote(`Enhancement failed: ${err.message}`);
      setTimeout(() => setEnhanceNote(null), 4000);
    } finally {
      setEnhancing(false);
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); execCmd('bold'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); execCmd('italic'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); execCmd('underline'); }
  }

  // ── Export ────────────────────────────────────────────────────────────
  function handleExport() {
    const text = editorRef.current?.innerText || '';
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'chapter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportHtml() {
    const content = editorRef.current?.innerHTML || '';
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chapter</title></head><body>${content}</body></html>`], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'chapter.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Save cursor on mousedown (for citation insertion to use)
  function handleEditorMouseDown() {
    setTimeout(() => {
      savedSelRef.current = saveSelection();
    }, 0);
  }

  return (
    <div className="ced-root">
      {/* Toolbar */}
      <div className="ced-toolbar">
        {/* Text format */}
        <div className="ced-tool-group">
          <ToolBtn title="Bold (Ctrl+B)" active={bold} onClick={() => execCmd('bold')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
            </svg>
          </ToolBtn>
          <ToolBtn title="Italic (Ctrl+I)" active={italic} onClick={() => execCmd('italic')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
            </svg>
          </ToolBtn>
          <ToolBtn title="Underline (Ctrl+U)" active={underline} onClick={() => execCmd('underline')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" /><line x1="4" y1="21" x2="20" y2="21" />
            </svg>
          </ToolBtn>
        </div>

        <div className="ced-tool-divider" />

        {/* Headings */}
        <div className="ced-tool-group">
          <ToolBtn title="Heading 2" onClick={() => execCmd('formatBlock', 'H2')}>H2</ToolBtn>
          <ToolBtn title="Heading 3" onClick={() => execCmd('formatBlock', 'H3')}>H3</ToolBtn>
          <ToolBtn title="Paragraph" onClick={() => execCmd('formatBlock', 'P')}>P</ToolBtn>
        </div>

        <div className="ced-tool-divider" />

        {/* Lists */}
        <div className="ced-tool-group">
          <ToolBtn title="Bulleted list" onClick={() => execCmd('insertUnorderedList')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
            </svg>
          </ToolBtn>
          <ToolBtn title="Numbered list" onClick={() => execCmd('insertOrderedList')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
              <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </svg>
          </ToolBtn>
        </div>

        <div className="ced-tool-divider" />

        {/* Academic Enhancement */}
        <EnhancementMenu onEnhance={handleEnhance} loading={enhancing} />

        <div className="ced-tool-spacer" />

        {/* Export */}
        <div className="ced-tool-group">
          <ToolBtn title="Export as plain text" onClick={handleExport}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </ToolBtn>
          <ToolBtn title="Export as HTML" onClick={handleExportHtml}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
          </ToolBtn>
        </div>

        {/* Word count */}
        <div className="ced-word-count">{wordCnt.toLocaleString()} words</div>
      </div>

      {/* Enhancement notification */}
      {enhanceNote && (
        <div className="ced-rewrite-note">{enhanceNote}</div>
      )}

      {/* Enhancement metrics */}
      <EnhancementMetrics metrics={enhanceMetrics} />

      {/* Editor surface */}
      <div
        ref={editorRef}
        className={`ced-surface${!hasContent ? ' ced-surface-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Enhance a chapter above, or start typing your own content here…"
        onInput={updateStats}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshToolbar}
        onMouseUp={refreshToolbar}
        onMouseDown={handleEditorMouseDown}
        onFocus={refreshToolbar}
        spellCheck={true}
        lang="en"
        aria-label="Chapter editor"
        role="textbox"
        aria-multiline="true"
      />
    </div>
  );
});

export default ChapterEditor;
