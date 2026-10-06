import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminUser } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';

export function AdminUsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.getAdminUsers().then((response) => setUsers(response.users)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load users.')); }, []);
  return <><PageHeader eyebrow="Operations" title="Users" description="Account records available to authorized administrators." />
    {error ? <Alert>{error}</Alert> : null}
    {users === null && !error ? <LoadingState label="Loading users…" /> : null}
    {users?.length === 0 ? <Card><p className="muted">No users found.</p></Card> : null}
    {users && users.length > 0 ? <Card><div className="table-wrap"><table><caption className="sr-only">Platform users</caption><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><Link to={`/admin/users/${user.id}`}>{user.displayName}</Link></td><td>{user.phone}</td><td>{user.status}</td><td>{user.role}</td></tr>)}</tbody></table></div></Card> : null}
  </>;
}
