import { useRef, useState } from 'react';

const EXAMPLE_QUERIES = [
  'curcumin anti-inflammatory',
  'machine learning drug discovery',
  'CRISPR gene therapy',
  'nanoparticle drug delivery',
  'climate change biodiversity',
  'quantum computing optimization',
];

function HowToModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">How SciForge Works</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#215;</button>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">How to search</div>
          {[
            'Enter keywords (topic, compound, or research area)',
            'Use scientific names for better accuracy',
            'Combine keywords: e.g. "curcumin anti-inflammatory"',
            'Use exact phrases for precise matching',
          ].map((tip, i) => (
            <div className="modal-row" key={i}>
              <span className="modal-dot">{i + 1}</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Relevance levels</div>
          {[
            { label: 'HIGH', desc: 'Keyword found in article title' },
            { label: 'MEDIUM', desc: 'Keyword found in abstract only' },
            { label: 'LOW / EXCLUDED', desc: 'No keyword match — removed' },
          ].map((r, i) => (
            <div className="modal-row" key={i}>
              <span className="modal-dot">{['H','M','L'][i]}</span>
              <span><strong>{r.label}</strong> — {r.desc}</span>
            </div>
          ))}
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Smart Score breakdown</div>
          <div className="modal-score-grid">
            <div className="modal-score-item"><div className="modal-score-label">Title match</div><div className="modal-score-val">+40</div></div>
            <div className="modal-score-item"><div className="modal-score-label">Abstract match</div><div className="modal-score-val">+25</div></div>
            <div className="modal-score-item"><div className="modal-score-label">Keyword density</div><div className="modal-score-val">+15</div></div>
            <div className="modal-score-item"><div className="modal-score-label">Journal quality</div><div className="modal-score-val">+10</div></div>
            <div className="modal-score-item"><div className="modal-score-label">Recency (≤5 yrs)</div><div className="modal-score-val">+10</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SearchBar({ onSearch, loading, placeholder }) {
  const inputRef  = useRef(null);
  const [modal, setModal] = useState(false);

  function handleSearch() {
    const q = inputRef.current?.value.trim();
    if (q) onSearch(q);
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSearch();
  }

  function handleExampleClick(query) {
    if (inputRef.current) {
      inputRef.current.value = query;
    }
    onSearch(query);
  }

  return (
    <>
      <section className="search-section">
        <div className="search-card">
          <div className="search-card-glow" />
          <h2 className="search-title">Search Scientific Literature</h2>
          <p className="search-sub">
            Evidence-graded results from PubMed, Crossref &amp; OpenAlex — ranked by relevance score
          </p>

          <div className="search-input-wrap">
            <div className="search-input-border-glow">
              <div className="search-row">
                <div style={{ position: 'relative', flex: 1 }}>
                  <span className="search-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    placeholder={placeholder || "e.g. curcumin anti-inflammatory, CRISPR gene therapy…"}
                    onKeyDown={handleKey}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <button className="search-btn" onClick={handleSearch} disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  {loading ? 'Searching…' : 'Search'}
                </button>
              </div>
            </div>
          </div>

          {/* Example query chips */}
          <div className="example-chips">
            {EXAMPLE_QUERIES.map(q => (
              <button
                key={q}
                className="example-chip"
                onClick={() => handleExampleClick(q)}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>

          <p className="disclaimer" style={{ marginTop: '12px' }}>Evidence-grounded scholarly enhancement platform — not an autonomous AI generator</p>
        </div>

        <div className="howto-card">
          <div className="howto-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div className="howto-content">
            <div className="howto-title">How to Use</div>
            <ul className="howto-tips">
              <li>Enter keywords (compound, topic, or research area)</li>
              <li>Results ranked by evidence strength</li>
              <li>HIGH = title match &nbsp;·&nbsp; MEDIUM = abstract match</li>
            </ul>
          </div>
          <button className="howto-btn" onClick={() => setModal(true)}>How it works?</button>
        </div>
      </section>

      {modal && <HowToModal onClose={() => setModal(false)} />}
    </>
  );
}
