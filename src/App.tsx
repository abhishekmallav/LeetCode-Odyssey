import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { bookLook, companyLabel, difficultyColors, filterProblems, inkColor, popularCompanies, topicColor, wrapIndex } from './model';
import type { Filters, Problem } from './model';

const Bookshelf = lazy(() => import('./Bookshelf'));
const emptyFilters: Filters = { query: '', difficulty: '', topic: '', company: '' };

function DrawnArrow({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 72 46" fill="none" aria-hidden="true"><path d="M5 8c14-5 39 0 49 24M42 28l14 8 2-16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Dice() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" transform="rotate(-12 12 12)" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.1" fill="currentColor" /><circle cx="16" cy="16" r="1.1" fill="currentColor" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /></svg>;
}

function CompanyPicker({ companies, value, onChange }: { companies: string[]; value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = companies.filter(c => `${c} ${companyLabel(c)}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!details.current?.contains(e.target as Node) && details.current) details.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function select(company: string) { onChange(company); if (details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } }
  return <details className="company-picker" ref={details}
    onToggle={() => { if (details.current?.open) { setSearch(''); input.current?.focus(); } }}
    onKeyDown={e => { if (e.key === 'Escape' && details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } }}>
    <summary><span>{value ? companyLabel(value) : 'All companies'}</span><span aria-hidden="true">⌄</span></summary>
    <div className="company-menu">
      <label htmlFor="company-search">Find a company</label>
      <input ref={input} id="company-search" type="search" autoComplete="off" placeholder="Search all companies…" value={search} onChange={e => setSearch(e.target.value)} />
      <ul aria-label="Companies">
        <li><button aria-pressed={!value} onClick={() => select('')}>All companies <span>{companies.length}</span></button></li>
        {matches.map(c => <li key={c}><button aria-pressed={value === c} onClick={() => select(c)}>{companyLabel(c)}{value === c && <span aria-hidden="true">✓</span>}</button></li>)}
      </ul>
      {!matches.length && <p className="muted">No matching companies.</p>}
    </div>
  </details>;
}

function ProblemDetail({ problem, previous, next, close }: { problem: Problem; previous: () => void; next: () => void; close: () => void }) {
  const [showCompanies, setShowCompanies] = useState(false);
  const [copyState, setCopyState] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const look = bookLook(problem);
  useEffect(() => { setShowCompanies(false); setCopyState(''); heading.current?.focus({ preventScroll: true }); }, [problem.id]);
  useEffect(() => { if (!copyState) return; const timer = setTimeout(() => setCopyState(''), 5000); return () => clearTimeout(timer); }, [copyState]);
  async function copy() {
    try { await navigator.clipboard.writeText(problem.url); setCopyState('Copied!'); }
    catch { setCopyState('Select and copy the URL below.'); }
  }
  return <section className="detail-desk" aria-labelledby="problem-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
    <div className="desk-cover" aria-hidden="true" style={{ '--book-top': look.top, '--book-bottom': look.bottom } as CSSProperties}>
      <div className="book-cover" style={{ background: look.top, color: inkColor(look.top) }}><span className="cover-number">No. {problem.id.padStart(4, '0')}</span><span className="cover-rule" /><span className="cover-title">{problem.title}</span><span className="cover-footer"><span className="cover-difficulty" style={{ background: difficultyColors[problem.difficulty], color: inkColor(difficultyColors[problem.difficulty]) }}>{problem.difficulty}</span><span className="cover-braces">{'{ }'}</span></span></div>
      <p className="cover-caption">a little problem.<br />a new way to think.</p><DrawnArrow />
    </div>
    <article className="note-card">
      <div className="note-kicker">LeetCode / No. {problem.id}<span className={`difficulty-text ${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span></div>
      <h2 id="problem-title" ref={heading} tabIndex={-1}>{problem.title}</h2>
      <div className="metadata-section"><h3>Topics</h3>
        {problem.topics.length ? <ul className="tag-list">{problem.topics.map(t => <li key={t} style={{ background: topicColor(t), color: inkColor(topicColor(t)), borderColor: topicColor(t) }}>{t}</li>)}</ul> : <p className="muted">No topics listed in the catalog.</p>}
      </div>
      <div className="metadata-section"><h3>Asked at <span className="muted">{problem.companies.length ? `(${problem.companies.length})` : ''}</span></h3>
        {problem.companies.length ? <>
          <ul className="tag-list company-tags">{problem.companies.slice(0, showCompanies ? undefined : 8).map(c => <li key={c}>{companyLabel(c)}</li>)}</ul>
          {problem.companies.length > 8 && <button className="text-button" onClick={() => setShowCompanies(v => !v)}>{showCompanies ? 'Show fewer' : `Show all ${problem.companies.length} companies`}</button>}
        </> : <p className="muted">No company matches in the source lists.</p>}
      </div>
      <div className="solve-action"><a className="cream-button" href={problem.url} target="_blank" rel="noopener noreferrer">Solve on LeetCode <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><DrawnArrow /></div>
      <nav className="detail-actions" aria-label="Problem navigation">
        <button onClick={previous}>← Previous</button><button onClick={next}>Next →</button>
        <button onClick={copy}>{copyState === 'Copied!' ? 'Copied!' : 'Copy URL'}</button>
        <button onClick={close}>Shelve it <span aria-hidden="true">↶</span></button>
      </nav>
      <p className="copy-status" role="status">{copyState}</p>
      {copyState.startsWith('Select') && <label className="manual-copy">Problem URL<input readOnly value={problem.url} onFocus={e => e.target.select()} /></label>}
    </article>
  </section>;
}

function ProblemList({ problems, onSelect }: { problems: Problem[]; onSelect: (p: Problem) => void }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [problems]);
  const pages = Math.ceil(problems.length / 24);
  return <div className="problem-list">
    <ul>{problems.slice(page * 24, (page + 1) * 24).map(p => <li key={p.id}><button onClick={() => onSelect(p)}>
      <span className="list-number">{p.id}</span><span className="list-title">{p.title}</span><span className={`difficulty-text ${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
    </button></li>)}</ul>
    {pages > 1 && <nav className="list-pagination" aria-label="Problem pages"><button disabled={!page} onClick={() => setPage(p => p - 1)}>← Previous page</button><span>{page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next page →</button></nav>}
  </div>;
}

export default function App() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<Problem | null>(null);
  const [closing, setClosing] = useState(false);
  const [hovered, setHovered] = useState<Problem | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [listView, setListView] = useState(false);
  const [step, setStep] = useState(0);
  const detail = useRef<HTMLDivElement>(null);
  const browse = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    fetch('/problems.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Could not load the problem catalog.'); return r.json(); })
      .then((data: Problem[]) => { if (!Array.isArray(data) || !data.length || !data.every(p => p.id && p.title && Array.isArray(p.topics) && Array.isArray(p.companies))) throw new Error('The problem catalog is invalid.'); setProblems(data); })
      .catch(e => { if (e.name !== 'AbortError') setError('The problem catalog couldn’t be loaded. Please try again.'); });
    return () => controller.abort();
  }, [retry]);
  const filtered = useMemo(() => filterProblems(problems, filters), [problems, filters]);
  const companies = useMemo(() => [...new Set(problems.flatMap(p => p.companies))].sort((a, b) => a.localeCompare(b)), [problems]);
  const topics = useMemo(() => [...new Set(problems.flatMap(p => p.topics))].sort(), [problems]);
  const activeFilters = Object.values(filters).some(Boolean);
  const counts = useMemo(() => Object.fromEntries(['Easy', 'Medium', 'Hard'].map(d => [d, problems.filter(p => p.difficulty === d).length])), [problems]);
  const open = useCallback((problem: Problem) => { setClosing(false); setSelected(problem); setHovered(null); }, []);
  const onHover = useCallback((problem: Problem | null) => setHovered(problem), []);
  const fallback = useCallback(() => setListView(true), []);
  useEffect(() => { if (selected && !filtered.some(p => p.id === selected.id)) { setSelected(null); setClosing(false); } }, [filtered, selected]);
  useEffect(() => {
    if (!selected || closing) return;
    const timer = setTimeout(() => detail.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' }), reduced ? 0 : 220);
    return () => clearTimeout(timer);
  }, [selected?.id, reduced, closing]);
  const finishClose = useCallback(() => {
    setSelected(null); setClosing(false);
    browse.current?.focus({ preventScroll: true });
    browse.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  }, [reduced]);
  useEffect(() => { if (closing && reduced) finishClose(); }, [closing, reduced, finishClose]);
  function update<K extends keyof Filters>(name: K, value: Filters[K]) { setFilters(f => ({ ...f, [name]: value })); setHovered(null); }
  function surprise() {
    if (!problems.length) return;
    const number = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    setFilters(emptyFilters); open(problems[Math.floor(number * problems.length)]);
  }
  function navigate(direction: number) {
    if (!selected || !filtered.length) return;
    open(filtered[wrapIndex(filtered.findIndex(p => p.id === selected.id) + direction, filtered.length)]);
  }
  function close() { setHovered(null); if (reduced) finishClose(); else setClosing(true); }
  return <>
    <a href="#library" className="skip-link">Skip to the shelf</a>
    <header className="site-header">
      <div className="heading-row"><h1>LeetCode Odyssey<span className="byline">by Abhishek :)<DrawnArrow /></span></h1><span className="header-doodle" aria-hidden="true">{'{ }'}<span>one problem<br />at a time.</span></span></div>
      <div className="library-summary"><p>{problems.length ? problems.length.toLocaleString() : '…'} problems on the shelf</p><button className="surprise-button" onClick={surprise} disabled={!problems.length} aria-label="Surprise me: open a random problem from the full catalog"><Dice /> Surprise me</button></div>
      <div className="search-wrap"><label className="sr-only" htmlFor="problem-search">Search by problem number or title</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
        <input id="problem-search" type="search" placeholder="What are you looking for? Try #41 or a title…" value={filters.query} onChange={e => update('query', e.target.value)} autoComplete="off" />
      </div>
      <div className="filter-toolbar">
        <fieldset className="difficulty-filters"><legend className="sr-only">Filter by difficulty</legend>
          {['', 'Easy', 'Medium', 'Hard'].map(d => <button key={d} aria-pressed={filters.difficulty === d} className={d ? `difficulty-filter ${d.toLowerCase()}` : ''} onClick={() => update('difficulty', filters.difficulty === d ? '' : d)}>{d && <span className="difficulty-dot" aria-hidden="true" />}{d || 'All'}{d && <span className="filter-count">{counts[d] || '–'}</span>}</button>)}
        </fieldset>
        <label className="topic-picker"><span className="sr-only">Filter by topic</span><select aria-label="Filter by topic" value={filters.topic} onChange={e => update('topic', e.target.value)}><option value="">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select><span aria-hidden="true">⌄</span></label>
        <CompanyPicker companies={companies} value={filters.company} onChange={value => update('company', value)} />
      </div>
      <div className="popular-row"><span className="popular-label">Asked at</span><div className="company-shortcuts" role="group" aria-label="Popular companies">
        {popularCompanies.filter(c => companies.includes(c)).map(c => <button key={c} aria-pressed={filters.company === c} onClick={() => update('company', filters.company === c ? '' : c)}>{companyLabel(c)}</button>)}
      </div></div>
      <div className="filter-summary"><p role="status">{activeFilters ? `${filtered.length.toLocaleString()} matching problems` : 'A little library for your DSA prep'}</p>{activeFilters && <button className="text-button" onClick={() => setFilters(emptyFilters)}>Clear filters ×</button>}</div>
    </header>
    <main id="library">
      {error ? <div className="catalog-message" role="alert"><p>{error}</p><button onClick={() => setRetry(v => v + 1)}>Try again</button></div> : !problems.length ? <div className="catalog-message" role="status">Opening the library…</div> : <>
        <section className="shelves" aria-label="Problem bookshelf">
          {listView ? <ProblemList problems={filtered} onSelect={open} /> : <Suspense fallback={<div className="shelf-placeholder" role="status">Opening the shelf…</div>}>
            <Bookshelf problems={filtered} selectedId={closing ? null : selected?.id || null} hoveredId={hovered?.id || null} holding={Boolean(selected)} paused={paused} reduced={reduced} step={step} onSelect={open} onHover={onHover} onFallback={fallback} />
          </Suspense>}
          {!filtered.length && <div className={`empty-shelf${listView ? '' : ' empty-shelf-on-canvas'}`}><span aria-hidden="true">{'{ … }'}</span><h2>A quiet corner of the library.</h2><p>No problems match these filters.</p><button onClick={() => setFilters(emptyFilters)}>Clear filters</button></div>}
          <div className="shelf-controls" ref={browse} tabIndex={0} aria-label="Shelf controls. Left and right arrow keys browse the shelf." onKeyDown={e => { if (e.target === e.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setStep(s => s + (e.key === 'ArrowRight' ? 1 : -1)); } }}>
            <div className="shelf-hint" aria-live="polite">{hovered ? <><span className={`difficulty-text ${hovered.difficulty.toLowerCase()}`}>#{hovered.id} / {hovered.difficulty}</span><span className="hover-title">{hovered.title}</span></> : <><span>Pick a spine. Find your next challenge.</span><span className="hint-secondary">Hover to peek · click to open · browse with the arrows <DrawnArrow /></span></>}</div>
            <div className="shelf-buttons">
              {!listView && <><button className="arrow-button" aria-label="Browse shelf left" onClick={() => setStep(s => s - 1)}>←</button><button className="arrow-button" aria-label="Browse shelf right" onClick={() => setStep(s => s + 1)}>→</button><button className="motion-button" aria-pressed={paused} disabled={reduced} onClick={() => setPaused(v => !v)}>{reduced ? 'Motion reduced' : paused ? '▷ Resume' : 'Ⅱ Pause'}</button></>}
              <button className="view-button" onClick={() => { setListView(v => !v); setHovered(null); }}>{listView ? 'Shelf view' : 'List view'}</button>
            </div>
          </div>
        </section>
        {selected && <div className={`detail-wrap${closing ? ' detail-closing' : ''}`} ref={detail} inert={closing}
          onAnimationEnd={event => { if (closing && event.target === event.currentTarget && event.animationName === 'desk-out') finishClose(); }}>
          <ProblemDetail problem={selected} previous={() => navigate(-1)} next={() => navigate(1)} close={close} />
        </div>}
      </>}
    </main>
    <footer><span>Made for the joy of figuring it out.</span><span>LeetCode Odyssey by Abhishek :)</span><a href="https://interesting-reads.vercel.app/" target="_blank" rel="noopener noreferrer">Bookshelf inspired by Interesting Reads / AevyTV ↗</a></footer>
  </>;
}
