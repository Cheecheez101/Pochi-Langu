import { Link, Route, Routes } from 'react-router-dom';

function HomePage(): JSX.Element {
  return (
    <main className="page-shell">
      <section className="card">
        <p className="eyebrow">Kenya-first platform</p>
        <h1>Pochi Langu</h1>
        <p className="lede">
          A disciplined savings and financial-planning platform designed for KES-only money
          management and auditable financial operations.
        </p>
        <nav className="actions" aria-label="Primary navigation">
          <Link to="/">Overview</Link>
          <Link to="/status">Status</Link>
        </nav>
      </section>
    </main>
  );
}

function StatusPage(): JSX.Element {
  return (
    <main className="page-shell">
      <section className="card">
        <p className="eyebrow">Phase 0</p>
        <h2>Foundation status</h2>
        <ul className="bullet-list">
          <li>Monorepo scaffolding complete</li>
          <li>Backend API shell active</li>
          <li>Frontend app shell ready</li>
          <li>Database config + migration framework installed</li>
          <li>Security and logging baseline in place</li>
        </ul>
        <Link to="/" className="secondary-link">
          Return home
        </Link>
      </section>
    </main>
  );
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/status" element={<StatusPage />} />
    </Routes>
  );
}
