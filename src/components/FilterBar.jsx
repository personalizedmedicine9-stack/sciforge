import { useState } from 'react';

const DOMAIN_GROUPS = [
  { label: 'Drug Sciences',       values: ['Pharmacology', 'Pharmaceutics'] },
  { label: 'Natural Products',    values: ['Pharmacognosy', 'Phytochemistry', 'Natural Products'] },
  { label: 'Life Sciences',       values: ['Biology'] },
];

const STUDY_TYPES = [
  'Meta-analysis', 'Systematic Review', 'RCT',
  'Cohort Study', 'Case-Control', 'In Vitro', 'Animal Study', 'Other',
];

const QUALITY_OPTIONS = ['High', 'Medium', 'Low'];

function Chip({ active, onClick, children }) {
  return (
    <button
      className={`chip${active ? ' chip-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="filter-group-wrap">
      <button className="filter-group-toggle" onClick={() => setOpen(o => !o)}>
        <span className="filter-group-label">{label}</span>
        <span className={`filter-toggle-chevron${open ? ' filter-toggle-chevron-open' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="filter-group-content">{children}</div>}
    </div>
  );
}

export default function FilterBar({
  domainFilter, studyTypeFilter, yearMin, yearMax, qualityFilter,
  facets = {}, onFilter, onReset, onApply,
}) {
  const hasActive = domainFilter || studyTypeFilter || yearMin || yearMax || qualityFilter;

  return (
    <div className="filter-bar">
      <div className="filter-bar-header">
        <span className="filter-bar-title">Filters</span>
        {hasActive && (
          <button className="filter-reset-btn" onClick={onReset}>Clear all</button>
        )}
      </div>

      <div className="filter-groups">
        {/* Domain */}
        <FilterGroup label="Domain" defaultOpen={true}>
          <div className="filter-chips">
            <Chip active={!domainFilter} onClick={() => onFilter('domain', '')}>All</Chip>
            {DOMAIN_GROUPS.map(group => (
              <span key={group.label} style={{ display: 'contents' }}>
                <span className="filter-divider" />
                <span className="filter-group-sub">{group.label}</span>
                {group.values.map(f => (
                  <Chip key={f} active={domainFilter === f} onClick={() => onFilter('domain', domainFilter === f ? '' : f)}>
                    {f}
                    {facets.domains?.find(d => d.value === f)?.count
                      ? <span className="chip-count"> {facets.domains.find(d => d.value === f).count}</span>
                      : null}
                  </Chip>
                ))}
              </span>
            ))}
          </div>
        </FilterGroup>

        {/* Study type */}
        <FilterGroup label="Study Type" defaultOpen={false}>
          <div className="filter-chips">
            <Chip active={!studyTypeFilter} onClick={() => onFilter('study_type', '')}>All</Chip>
            {STUDY_TYPES.map(t => (
              <Chip key={t} active={studyTypeFilter === t} onClick={() => onFilter('study_type', studyTypeFilter === t ? '' : t)}>
                {t}
                {facets.study_types?.find(s => s.value === t)?.count
                  ? <span className="chip-count"> {facets.study_types.find(s => s.value === t).count}</span>
                  : null}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {/* Year range + Quality row */}
        <FilterGroup label="Year & Quality" defaultOpen={false}>
          <div className="filter-group-row">
            <div className="filter-sub-group">
              <span className="filter-group-label-inline">Year Range</span>
              <div className="year-range-row">
                <input
                  type="number" className="year-input" placeholder="From"
                  value={yearMin} min="1900" max="2099"
                  onChange={e => onFilter('year_min', e.target.value)}
                />
                <span className="year-sep">—</span>
                <input
                  type="number" className="year-input" placeholder="To"
                  value={yearMax} min="1900" max="2099"
                  onChange={e => onFilter('year_max', e.target.value)}
                />
              </div>
            </div>

            <div className="filter-sub-group">
              <span className="filter-group-label-inline">Journal Quality</span>
              <div className="filter-chips">
                <Chip active={!qualityFilter} onClick={() => onFilter('journal_quality', '')}>All</Chip>
                {QUALITY_OPTIONS.map(q => (
                  <Chip key={q} active={qualityFilter === q} onClick={() => onFilter('journal_quality', qualityFilter === q ? '' : q)}>
                    {q}
                  </Chip>
                ))}
              </div>
            </div>

            <button className="filter-apply-btn" onClick={onApply}>Apply filters</button>
          </div>
        </FilterGroup>
      </div>
    </div>
  );
}
