import { useState } from 'react';
import { buildCitation } from '../lib/research.js';

const LEVEL_LABELS = {
  A: 'Level A — High Evidence',
  B: 'Level B — Moderate Evidence',
  C: 'Level C — Low Evidence',
  D: 'Level D — Preclinical / Lab',
};

const LEVEL_FROM_STUDY = {
  'Meta-analysis':    'A',
  'Systematic Review':'A',
  'RCT':              'A',
  'Cohort Study':     'B',
  'Case-Control':     'B',
  'Case Report':      'C',
  'In Vitro':         'D',
  'Animal Study':     'D',
  'Pharmacokinetic Study': 'D',
  'Formulation Study':'D',
  'Mechanistic Study':'D',
  'Other':            'D',
};

function Badge({ className, children }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export default function ResultCard({ result: r, idx, query }) {
  const [expanded,  setExpanded]  = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [citeLabel, setCiteLabel] = useState('Copy Citation');

  const level     = r._level || r.level || LEVEL_FROM_STUDY[r.study_type] || 'D';
  const qClass    = (r.journal_quality || 'Low').toLowerCase();
  const mType     = r.match_type || 'semantic';
  const rClass    = mType === 'exact' ? 'high' : mType === 'partial' ? 'medium' : 'low';
  const exactCls  = mType === 'exact' ? ' card-exact-match' : '';
  const citation  = buildCitation({
    ...r,
    studyType:      r.study_type,
    journalQuality: r.journal_quality,
  });

  const qualityLabel = { High: 'Q1 Journal', Medium: 'Q2 Journal', Low: 'Journal' }[r.journal_quality || 'Low'];
  const sourceLabel  = Array.isArray(r.source) ? r.source.join(' · ') : (r.source || '');

  function handleCopy() {
    const lines = [
      `Title: ${r.title}`,
      `Citation: ${citation}`,
      `DOI: ${r.doi ? 'https://doi.org/' + r.doi : '—'}`,
      `PMID: ${r.pmid || '—'}`,
      `Journal: ${r.journal || '—'}`,
      `Year: ${r.year || '—'}`,
      `Domain: ${r.domain}`,
      `Study Type: ${r.study_type}`,
      `Evidence Level: ${level}`,
      `Score: ${r.score || 0}`,
      `Citations: ${r.citations || 0}`,
      `Journal Quality: ${r.journal_quality || 'Low'}`,
      `Match Type: ${mType}`,
      `Source: ${sourceLabel}`,
      `Link: ${r.link || '—'}`,
      r.abstract ? `\nAbstract: ${r.abstract}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 2000);
    });
  }

  function handleCiteCopy() {
    navigator.clipboard.writeText(citation).then(() => {
      setCiteLabel('Copied!');
      setTimeout(() => setCiteLabel('Copy Citation'), 2000);
    });
  }

  return (
    <article
      className={`result-card level-${level}${exactCls}`}
      style={{ animationDelay: `${idx * 0.04}s` }}
    >
      {/* ── Header ── */}
      <div className="rc-header">
        <h3 className="rc-title">{r.title}</h3>

        {/* Citation row */}
        <div className="rc-citation-row">
          <span className="rc-cite-text">{citation}</span>
          <button
            className={`cite-copy-btn${citeLabel === 'Copied!' ? ' cite-copy-done' : ''}`}
            onClick={handleCiteCopy}
          >
            {citeLabel}
          </button>
        </div>

        {/* Badges */}
        <div className="rc-badges">
          <Badge className={`badge-level-${level}`}>{LEVEL_LABELS[level] || `Level ${level}`}</Badge>
          <Badge className="badge-domain">{r.domain}</Badge>
          <Badge className={`badge-quality-${qClass}`}>{qualityLabel}</Badge>
          {r.citations > 0 && (
            <Badge className="badge-citations">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 2 }}>
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              {r.citations.toLocaleString()} citations
            </Badge>
          )}
          <Badge className={`badge-match-${mType === 'exact' ? 'exact' : mType === 'partial' ? 'partial' : 'weak'}`}>
            {mType === 'exact' ? 'Exact Match' : mType === 'partial' ? 'Partial Match' : 'Semantic Match'}
          </Badge>
          {r.score > 0 && <Badge className="badge-score">Score {r.score}</Badge>}
        </div>
      </div>

      {/* ── Abstract ── */}
      {r.abstract && (
        <div className="rc-abstract">
          <p className="rc-abstract-label">Abstract</p>
          <p className={`rc-abstract-text${expanded ? '' : ' abstract-collapsed'}`}>{r.abstract}</p>
          <button className="abstract-toggle" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Show less' : 'Show full abstract'}
          </button>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="rc-divider" />

      {/* ── Info grid ── */}
      <div className="rc-info-grid">
        {r.pmid && (
          <div className="rc-info-item">
            <span className="rc-info-label">PMID</span>
            <span className="rc-info-value">{r.pmid}</span>
          </div>
        )}
        <div className="rc-info-item">
          <span className="rc-info-label">DOI</span>
          {r.doi
            ? <a className="doi-link" href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer">https://doi.org/{r.doi}</a>
            : <span className="rc-info-value rc-info-empty">—</span>
          }
        </div>
        <div className="rc-info-item">
          <span className="rc-info-label">Journal</span>
          <span className="rc-info-value">{r.journal || '—'}</span>
        </div>
        <div className="rc-info-item">
          <span className="rc-info-label">Study Type</span>
          <span className="rc-info-value">{r.study_type || '—'}</span>
        </div>
        {r.year && (
          <div className="rc-info-item">
            <span className="rc-info-label">Year</span>
            <span className="rc-info-value">{r.year}</span>
          </div>
        )}
        {sourceLabel && (
          <div className="rc-info-item">
            <span className="rc-info-label">Source</span>
            <span className="rc-info-value" style={{ textTransform: 'capitalize' }}>{sourceLabel}</span>
          </div>
        )}
      </div>

      {/* ── Keywords / MeSH ── */}
      {((r.mesh_terms?.length > 0) || (r.keywords?.length > 0)) && (
        <div className="rc-terms">
          {[...(r.mesh_terms || []), ...(r.keywords || [])].slice(0, 8).map(t => (
            <span key={t} className="term-chip">{t}</span>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="rc-footer">
        <a
          className="view-btn"
          href={r.link || (r.doi ? `https://doi.org/${r.doi}` : '#')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          {Array.isArray(r.source) && r.source.includes('pubmed') ? 'View on PubMed' : 'View Article'}
        </a>
        <button className={`copy-btn${copyLabel === 'Copied!' ? ' copy-btn-done' : ''}`} onClick={handleCopy}>
          {copyLabel}
        </button>
      </div>
    </article>
  );
}
