import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AdminUser } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';

export function AdminUserDetailPage(): JSX.Element {
  const { userId } = useParams();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    api.getAdminUser(userId)
      .then((response) => setUser(response.user))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load user details.'));
  }, [userId]);
  return <>
    <PageHeader eyebrow="Operations / Users" title="User details" description="Read-only identity and account status for an authorized user." />
    {error ? <Alert>{error}</Alert> : null}
    {!user && !error ? <LoadingState label="Loading user details…" /> : null}
    {user ? <Card className="profile-card"><dl className="profile-list"><div><dt>Name</dt><dd>{user.displayName}</dd></div><div><dt>Phone</dt><dd>{user.phone}</dd></div><div><dt>Status</dt><dd>{user.status}</dd></div><div><dt>Role</dt><dd>{user.role}</dd></div><div><dt>Created</dt><dd>{new Date(user.createdAt).toLocaleString()}</dd></div></dl><Link className="button button-secondary" to="/admin/users">Back to users</Link></Card> : null}
  </>;
}
