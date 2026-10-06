import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../ui/Button';

export function AppLayout(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminWorkspace = location.pathname.startsWith('/admin');
  const closeMenu = () => setMenuOpen(false);
  const handleLogout = async () => { await logout(); navigate('/'); };
  const navigationLabel = isAdminWorkspace ? 'Administrator navigation' : 'Account navigation';
  return (
    <div className="app-frame">
      <header className={`app-header ${isAdminWorkspace ? 'admin-header' : ''}`}>
        <NavLink to={isAdminWorkspace ? '/admin' : '/dashboard'} className="brand" onClick={closeMenu}>
          <span className="brand-name">Pochi Langu</span>
          {isAdminWorkspace ? <span className="brand-context">Admin</span> : null}
        </NavLink>
        <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="sr-only">Toggle navigation</span>☰
        </button>
        <nav id="main-nav" className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label={navigationLabel}>
          <div className="nav-links">
            {isAdminWorkspace ? (
              <>
                <NavLink to="/admin" end onClick={closeMenu}>Overview</NavLink>
                <NavLink to="/admin/users" onClick={closeMenu}>Users</NavLink>
                <NavLink to="/admin/transactions" onClick={closeMenu}>Transactions</NavLink>
                <NavLink to="/admin/security" onClick={closeMenu}>Security</NavLink>
                <NavLink className="nav-back-link" to="/dashboard" onClick={closeMenu}>User workspace</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/dashboard" onClick={closeMenu}>Dashboard</NavLink>
                <NavLink to="/wallet" onClick={closeMenu}>Wallet</NavLink>
                <NavLink to="/withdrawals" onClick={closeMenu}>Withdrawals</NavLink>
                <NavLink to="/savings" onClick={closeMenu}>Savings</NavLink>
                <NavLink to="/account" onClick={closeMenu}>Profile</NavLink>
                <NavLink to="/security" onClick={closeMenu}>Security</NavLink>
                {user?.role === 'admin' ? <NavLink to="/admin" onClick={closeMenu}>Admin workspace</NavLink> : null}
              </>
            )}
          </div>
          <div className="nav-account">
            <span className="nav-user">{user?.displayName ?? user?.phone}</span>
            <Button variant="ghost" onClick={handleLogout}>Log out</Button>
          </div>
        </nav>
      </header>
      <main className="content"><Outlet /></main>
    </div>
  );
}
