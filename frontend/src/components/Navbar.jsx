import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Notifications from './Notifications';
import ProfileMenu from './ProfileMenu';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="logo">InnoLance</Link>
        <nav className="nav-links">
          <Link to="/projects">Find Work</Link>
          {user ? (
            <>
              <Link to="/myprojects">My Projects</Link>
              {user.role === 'client' && (
                <>
                  <Link to="/post-project">Post Project</Link>
                </>
              )}
              <Link to="/proposals">Proposals</Link>
              <Link to="/messages">Messages</Link>
              <Notifications />
              {user.role === 'admin' && (
                <>
                  <Link to="/admin">Admin</Link>
                  <Link to="/admin/analytics">Analytics</Link>
                  <Link to="/admin/enterprise-rfp" className="nav-accent">Enterprise RFP</Link>
                </>
              )}
              <ProfileMenu />
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register" className="btn btn-primary">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
