import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function LandingPage(): JSX.Element {
  return (
    <main className="public-shell">
      <nav className="public-nav" aria-label="Main navigation">
        <Link to="/" className="brand">Pochi Langu</Link>
        <div><Link to="/login">Log in</Link><Link className="nav-cta" to="/register">Create account</Link></div>
      </nav>
      <section className="hero">
        <p className="eyebrow">A calm place for your financial journey</p>
        <h1>Build better money habits, one step at a time.</h1>
        <p className="lede">Pochi Langu gives you a clear, secure space to understand your progress. Your financial information stays yours.</p>
        <div className="actions"><Link to="/register"><Button>Create your account</Button></Link><Link to="/login"><Button variant="secondary">Sign in</Button></Link></div>
      </section>
      <section className="feature-grid" aria-label="Platform principles">
        <Card><h2>Private by design</h2><p>Your account area is protected and built with secure session handling.</p></Card>
        <Card><h2>Clear, not noisy</h2><p>See the information that matters without invented balances or confusing dashboards.</p></Card>
        <Card><h2>Made for progress</h2><p>A thoughtful foundation for future tools that support consistent financial habits.</p></Card>
      </section>
    </main>
  );
}
