import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function OAuthComplete() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokenAndLoadUser } = useAuth();
  const [pending, setPending] = useState('');
  const [role, setRole] = useState('freelancer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = params.get('pending') || '';
    setPending(p);
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pending) {
      setError('Missing signup token.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/oauth/complete', { pending, role });
      await setTokenAndLoadUser(data.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to finish signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <h1>Finish signup</h1>
        <p className="auth-sub">Choose how you want to use the platform.</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <label>I want to</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="freelancer">Find work (Freelancer)</option>
            <option value="client">Hire talent (Client)</option>
          </select>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Continuing...' : 'Continue'}
          </button>
        </form>
        <p className="auth-footer">
          Prefer password login? <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

