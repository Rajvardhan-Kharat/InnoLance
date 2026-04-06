import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokenAndLoadUser } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Missing token.');
      return;
    }
    setTokenAndLoadUser(token)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setError('Failed to finish sign-in.'));
  }, [params, navigate, setTokenAndLoadUser]);

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Sign-in failed</h1>
          <p className="auth-sub">{error}</p>
          <p className="auth-footer">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return <div className="loading-screen">Signing you in...</div>;
}

