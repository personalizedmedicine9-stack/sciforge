import { useState, useEffect } from 'react';

export default function Header({ mode, onModeChange }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleModeChange(next) {
    onModeChange(next);
    setMobileMenuOpen(false);
  }

  return (
    <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
      <div className="header-inner">
        {/* Logo — compact */}
        <div className="header-logo">
          <div className="logo-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="12" rx="10" ry="4" />
              <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
              <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h1 className="logo-title">SciForge</h1>
        </div>

        {/* Mode switcher — desktop */}
        <nav className="mode-nav" role="tablist" aria-label="Module switcher">
          <button
            role="tab"
            aria-selected={mode === 'review'}
            className={`mode-tab${mode === 'review' ? ' mode-tab-active' : ''}`}
            onClick={() => handleModeChange('review')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Literature Review
          </button>
          <button
            role="tab"
            aria-selected={mode === 'book'}
            className={`mode-tab${mode === 'book' ? ' mode-tab-active' : ''}`}
            onClick={() => handleModeChange('book')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            Book Authoring
          </button>
        </nav>

        {/* Source pills — desktop */}
        <div className="header-source-pills">
          <span className="header-source-pill">PubMed</span>
          <span className="header-source-pill">Crossref</span>
          <span className="header-source-pill">OpenAlex</span>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="hamburger-btn"
          onClick={() => setMobileMenuOpen(v => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Subtitle bar — below navbar */}
      <div className="header-subtitle-bar">
        <span className="header-subtitle-text">
          Dr. Mahmoud's Scientific Literature Intelligence &amp; Academic Enhancement Platform
        </span>
      </div>

      {/* Mobile dropdown nav */}
      {mobileMenuOpen && (
        <div className="mobile-nav-dropdown mobile-nav-open">
          <nav className="mode-nav" role="tablist" aria-label="Module switcher (mobile)">
            <button
              role="tab"
              aria-selected={mode === 'review'}
              className={`mode-tab${mode === 'review' ? ' mode-tab-active' : ''}`}
              onClick={() => handleModeChange('review')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              Literature Review
            </button>
            <button
              role="tab"
              aria-selected={mode === 'book'}
              className={`mode-tab${mode === 'book' ? ' mode-tab-active' : ''}`}
              onClick={() => handleModeChange('book')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
              Book Authoring
            </button>
          </nav>
          <div className="header-source-pills" style={{ marginTop: '10px', justifyContent: 'center' }}>
            <span className="header-source-pill">PubMed</span>
            <span className="header-source-pill">Crossref</span>
            <span className="header-source-pill">OpenAlex</span>
          </div>
        </div>
      )}
    </header>
  );
}
