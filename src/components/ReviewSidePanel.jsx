function PanelCard({ title, icon, children }) {
  return (
    <div className="panel-card">
      <div className="panel-title">{icon}{title}</div>
      {children}
    </div>
  );
}

export default function ReviewSidePanel({ mobileDrawerOpen, onCloseDrawer }) {
  return (
    <aside className={`side-panel${mobileDrawerOpen ? ' mobile-drawer-open' : ''}`}>
      {/* Mobile close button */}
      <button
        className="modal-close"
        style={{ display: mobileDrawerOpen ? 'flex' : 'none', position: 'sticky', top: '8px', marginLeft: 'auto', marginBottom: '8px', zIndex: 1 }}
        onClick={onCloseDrawer}
        aria-label="Close side panel"
      >
        &#215;
      </button>
      <PanelCard
        title="About this module"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
        }
      >
        <p className="panel-text">
          Systematic literature search across PubMed, Crossref, and OpenAlex. Automatically grades evidence A–D and generates structured reviews from retrieved papers.
        </p>
      </PanelCard>

      <PanelCard
        title="Search tips"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
          </svg>
        }
      >
        <ul className="panel-list">
          <li><div className="panel-dot" />Use scientific names (e.g. <em>Curcuma longa</em>)</li>
          <li><div className="panel-dot" />Combine drug + effect: <em>"metformin diabetes"</em></li>
          <li><div className="panel-dot" />Use exact phrases for narrow searches</li>
          <li><div className="panel-dot" />Filter by domain to narrow results</li>
          <li><div className="panel-dot" />Sort by evidence level A → D</li>
        </ul>
      </PanelCard>

      <PanelCard
        title="Workflow"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        }
      >
        <div className="panel-steps">
          {[
            { n: '1', label: 'Search a topic' },
            { n: '2', label: 'Apply filters' },
            { n: '3', label: 'Generate Review' },
            { n: '4', label: 'Export results' },
          ].map(s => (
            <div className="panel-step" key={s.n}>
              <div className="panel-step-n">{s.n}</div>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        title="Evidence levels"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        }
      >
        <div className="panel-feature-list">
          {[
            { label: 'A', color: '#16a34a', desc: 'Meta-analysis / RCT' },
            { label: 'B', color: '#2563eb', desc: 'Cohort / Observational' },
            { label: 'C', color: '#d97706', desc: 'Case reports' },
            { label: 'D', color: '#94a3b8', desc: 'In vitro / Animal' },
          ].map(l => (
            <div className="panel-feature" key={l.label}>
              <div className="panel-feature-icon" style={{ background: `${l.color}18`, border: `1px solid ${l.color}33`, color: l.color, fontWeight: 800 }}>
                {l.label}
              </div>
              <span>{l.desc}</span>
            </div>
          ))}
        </div>
      </PanelCard>
    </aside>
  );
}
