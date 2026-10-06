import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage(): JSX.Element {
  const { user } = useAuth();
  return <><PageHeader eyebrow="Account" title="Profile" description="Review the identity details associated with your account." /><Card className="profile-card"><dl className="profile-list"><div><dt>Name</dt><dd>{user?.displayName ?? 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{user?.phone ?? 'Not available'}</dd></div><div><dt>Role</dt><dd>{user?.role === 'admin' ? 'Administrator' : 'User'}</dd></div></dl></Card></>;
}
