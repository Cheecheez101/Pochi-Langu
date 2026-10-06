import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

export function RecoveryPage(): JSX.Element {
  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <PageHeader eyebrow="Account recovery" title="Recovery is not available yet" description="We have not connected an account-recovery service." />
        <Alert role="status">
          For your security, Pochi Langu will not collect or pretend to process recovery requests until the recovery flow is ready.
        </Alert>
        <p className="muted">If you still have access to your account, return to sign in. Otherwise, please contact the platform administrator through your approved support channel.</p>
        <p className="auth-footer"><Link to="/login">Return to sign in</Link></p>
      </Card>
    </main>
  );
}
