import { useState, useRef } from 'react';

function PanelCard({ title, icon, children }) {
  return (
    <div className="panel-card">
      <div className="panel-title">{icon}{title}</div>
      {children}
    </div>
  );
}

// Inline-editable chapter item
function OutlineItem({ chapter, index, total, isActive, onSelect, onRename, onDelete, onMoveUp, onMoveDown }) {
  const [editing,    setEditing]    = useState(false);
  const [draftTitle, setDraftTitle] = useState(chapter.title);
  const inputRef = useRef(null);

  function startEdit(e) {
    e.stopPropagation();
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
    if (e.key === 'Enter')  commitEdit();
    if (e.key === 'Escape') { setEditing(false); setDraftTitle(chapter.title); }
  }

  return (
    <div className={`outline-item${isActive ? ' outline-item-active' : ''}`}>
      {/* Reorder */}
      <div className="outline-item-order">
        <button
          className="outline-order-btn"
          onClick={e => { e.stopPropagation(); onMoveUp(index); }}
          disabled={index === 0}
          title="Move up"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className="outline-order-btn"
          onClick={e => { e.stopPropagation(); onMoveDown(index); }}
          disabled={index === total - 1}
          title="Move down"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Number */}
      <div className="book-ch-n" onClick={() => onSelect(chapter.id)}>{index + 1}</div>

      {/* Title */}
      <div className="outline-item-body" onClick={() => !editing && onSelect(chapter.id)}>
        {editing ? (
          <input
            ref={inputRef}
            className="outline-rename-input"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKey}
            maxLength={120}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="book-ch-title">{chapter.title}</span>
        )}
        {chapter.generated && !editing && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green)', flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Edit + Delete */}
      <div className="outline-item-actions">
        {!editing && (
          <button className="outline-action-btn" onClick={startEdit} title="Rename">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
        <button className="outline-action-btn outline-delete-btn" onClick={e => { e.stopPropagation(); onDelete(chapter.id); }} title="Delete">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function BookSidePanel({
  bookTitle,
  chapters = [],
  activeChapter,
  collapsed = false,
  onToggleCollapse,
  onSelectChapter,
  onAddChapter,
  onRenameChapter,
  onDeleteChapter,
  onMoveChapter,
  onNewBook,
  mobileDrawerOpen,
  onCloseDrawer,
}) {
  const [newTitle, setNewTitle] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  function handleAdd(e) {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    onAddChapter(t);
    setNewTitle('');
  }

  function handleNewBook() {
    if (chapters.length > 0 && !confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    onNewBook();
  }

  const done = chapters.filter(c => c.generated).length;

  if (collapsed) {
    return (
      <aside className="side-panel side-panel-book side-panel-collapsed">
        <button
          className="book-sidebar-expand-btn"
          onClick={onToggleCollapse}
          title="Expand outline"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="book-sidebar-expand-label">Outline</span>
          {chapters.length > 0 && (
            <span className="book-sidebar-expand-count">{done}/{chapters.length}</span>
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside className={`side-panel side-panel-book${mobileDrawerOpen ? ' mobile-drawer-open' : ''}`}>
      {/* Mobile close button */}
      <button
        className="modal-close"
        style={{ display: mobileDrawerOpen ? 'flex' : 'none', position: 'sticky', top: '8px', marginLeft: 'auto', marginBottom: '8px', zIndex: 1 }}
        onClick={onCloseDrawer}
        aria-label="Close outline panel"
      >
        &#215;
      </button>

      {/* Collapse toggle strip */}
      <div className="book-sidebar-collapse-strip">
        <button
          className="book-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title="Collapse sidebar"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Collapse
        </button>
      </div>

      {/* Book header + New Book button */}
      <div className="book-sidebar-header">
        <div className="book-sidebar-title-row">
          <div className="book-sidebar-book-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            <span>{bookTitle || 'Untitled Book'}</span>
          </div>
          <button className="book-new-btn" onClick={handleNewBook} title="Start a new book">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        </div>

        {confirmReset && (
          <div className="book-reset-confirm">
            <span>Start over? Current outline will be lost.</span>
            <div className="book-reset-btns">
              <button className="book-reset-yes" onClick={() => { setConfirmReset(false); onNewBook(); }}>Yes, reset</button>
              <button className="book-reset-no"  onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {chapters.length > 0 && (
          <div className="book-progress">
            <div className="book-progress-bar">
              <div
                className="book-progress-fill"
                style={{ width: `${Math.round((done / chapters.length) * 100)}%` }}
              />
            </div>
            <span className="book-progress-label">{done}/{chapters.length} chapters generated</span>
          </div>
        )}
      </div>

      {/* Outline */}
      <PanelCard
        title="Book Outline"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        }
      >
        {chapters.length === 0 ? (
          <p className="panel-text" style={{ fontStyle: 'italic' }}>No chapters yet.</p>
        ) : (
          <nav className="book-chapter-list outline-list">
            {chapters.map((ch, i) => (
              <OutlineItem
                key={ch.id}
                chapter={ch}
                index={i}
                total={chapters.length}
                isActive={activeChapter === ch.id}
                onSelect={onSelectChapter}
                onRename={onRenameChapter}
                onDelete={onDeleteChapter}
                onMoveUp={idx  => onMoveChapter(idx, -1)}
                onMoveDown={idx => onMoveChapter(idx,  1)}
              />
            ))}
          </nav>
        )}

        {/* Add chapter */}
        <form className="book-add-chapter" onSubmit={handleAdd}>
          <input
            className="book-add-input"
            type="text"
            placeholder="Add chapter title…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            maxLength={120}
          />
          <button type="submit" className="book-add-btn" disabled={!newTitle.trim()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
          </button>
        </form>
      </PanelCard>

      {/* Settings */}
      <PanelCard
        title="Chapter Settings"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93A10 10 0 005.27 18.6M4.93 19.07A10 10 0 0018.73 5.4" />
          </svg>
        }
      >
        <div className="panel-feature-list">
          {[
            { icon: '7', text: '7 structured sections per chapter' },
            { icon: 'A', text: 'Evidence grading A–D' },
            { icon: '∑', text: 'Mechanism extraction (17 targets)' },
            { icon: '⇧', text: 'AI polish (when key is set)' },
          ].map(f => (
            <div className="panel-feature" key={f.text}>
              <div className="panel-feature-icon" style={{ fontWeight: 800, fontSize: 11 }}>{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </PanelCard>
    </aside>
  );
}
