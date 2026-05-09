function PanelCard({ title, icon, children }) {
  return (
    <div className="panel-card">
      <div className="panel-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export default function SidePanel() {
  return (
    <aside className="side-panel">
      <PanelCard
        title="About this tool"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        }
      >
        <p className="panel-text">
          Unified research engine covering pharmaceuticals, natural products, and life sciences. Combines PubMed reliability with intelligent evidence grading.
        </p>
      </PanelCard>

      <PanelCard
        title="Tips for better results"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        }
      >
        <ul className="panel-list">
          <li><div className="panel-dot" />Use scientific names (e.g. Curcuma longa, not turmeric)</li>
          <li><div className="panel-dot" />Combine drug + effect: "metformin diabetes"</li>
          <li><div className="panel-dot" />Use exact phrases for narrow searches</li>
          <li><div className="panel-dot" />Filter by domain to narrow results</li>
          <li><div className="panel-dot" />Sort by evidence level A → D</li>
        </ul>
      </PanelCard>

      <PanelCard
        title="Key features"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        }
      >
        <div className="panel-feature-list">
          {[
            { icon: '⚡', text: 'Smart relevance scoring' },
            { icon: '🔬', text: 'Evidence grading A–D' },
            { icon: '📄', text: 'Abstract verification' },
            { icon: '📋', text: 'Citation copy tool' },
            { icon: '🌿', text: 'Multi-domain search' },
            { icon: '✅', text: 'Validated DOI links' },
          ].map(f => (
            <div className="panel-feature" key={f.text}>
              <div className="panel-feature-icon">{f.icon}</div>
              <span>{f.text}</span>
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
