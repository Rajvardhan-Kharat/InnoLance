import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { useTheme } from '../context/ThemeContext';
import './ProfileMenu.css';

function formatINR(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `₹${Number(amount || 0).toFixed(2)}`;
  }
}

export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const { balanceINR, refreshWallet } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const initials = useMemo(() => {
    const a = (user?.firstName || '').slice(0, 1);
    const b = (user?.lastName || '').slice(0, 1);
    return (a + b).toUpperCase() || 'U';
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-trigger"
        onClick={() => { setOpen((o) => !o); refreshWallet().catch(() => {}); }}
        aria-label="Profile menu"
      >
        <span className="wallet-pill">{formatINR(balanceINR)}</span>
        <span className="avatar-circle">{initials}</span>
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-header">
            <div className="profile-name">{user.firstName} {user.lastName}</div>
            <div className="profile-sub">{user.email}</div>
          </div>

          <div className="profile-row">
            <span className="row-label">Wallet balance</span>
            <span className="row-value">{formatINR(balanceINR)}</span>
          </div>

          <div className="profile-actions">
            <Link to="/wallet" className="menu-item" onClick={() => setOpen(false)}>Wallet</Link>
            <Link to="/settings" className="menu-item" onClick={() => setOpen(false)}>Profile settings</Link>
            <button type="button" className="menu-item" onClick={() => { toggleTheme(); }}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button type="button" className="menu-item danger" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      )}
    </div>
  );
}

