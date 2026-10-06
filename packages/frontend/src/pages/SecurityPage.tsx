import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../auth/AuthContext';

export function SecurityPage(): JSX.Element {
  const { user } = useAuth();
  return <>
    <PageHeader eyebrow="Account" title="Security" description="Review the security boundary for your account." />
    <div className="dashboard-grid">
      <Card><h2>Signed-in identity</h2><dl className="profile-list"><div><dt>Phone</dt><dd>{user?.phone}</dd></div><div><dt>Account status</dt><dd>Active</dd></div></dl></Card>
      <Card><h2>Account protection</h2><p className="muted">Your session is protected by the server-side authentication boundary. Password and recovery changes will be added when their authorized APIs are available.</p></Card>
    </div>
  </>;
}
