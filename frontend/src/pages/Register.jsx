import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

export default function Register() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'freelancer',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        role: form.role,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <h1>Create account</h1>
        <p className="auth-sub">Join as a client or freelancer.</p>
        {error && <div className="auth-error">{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => { window.location.href = `${apiBase}/auth/oauth/google/start`; }}
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => { window.location.href = `${apiBase}/auth/oauth/github/start`; }}
          >
            Continue with GitHub
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>I want to</label>
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="freelancer">Find work (Freelancer)</option>
            <option value="client">Hire talent (Client)</option>
          </select>
          <div className="row-two">
            <div>
              <label>First name</label>
              <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="Jane" />
            </div>
            <div>
              <label>Last name</label>
              <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Doe" />
            </div>
          </div>
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            required
          />
          <label>Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="At least 6 characters"
            required
          />
          <label>Confirm password</label>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="••••••••"
            required
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
