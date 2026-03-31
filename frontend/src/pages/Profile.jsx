import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { SKILLS } from '../utils/constants';
import './Profile.css';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        companyName: user.companyName || '',
        headline: user.headline || '',
        bio: user.bio || '',
        phone: user.phone || '',
        skills: user.skills || [],
        hourlyRate: user.hourlyRate || '',
        availability: user.availability || 'as-needed',
      });
    }
  }, [user]);

  const toggleSkill = (skill) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.patch('/users/me', {
        ...form,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      });
      await refreshUser();
      setMessage('Profile updated.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      <h1>Profile settings</h1>
      <p className="page-sub">Update your profile. This is visible to others.</p>
      {message && <div className={`profile-msg ${message.includes('updated') ? 'success' : 'error'}`}>{message}</div>}
      <form onSubmit={handleSubmit} className="profile-form">
        <section>
          <h2>Basic info</h2>
          <div className="row-two">
            <div>
              <label>First name</label>
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div>
              <label>Last name</label>
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Optional"
          />
          {user.role === 'client' && (
            <>
              <label>Company name</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </>
          )}
        </section>
        {user.role === 'freelancer' && (
          <section>
            <h2>Freelancer profile</h2>
            <label>Headline</label>
            <input
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="e.g. Full Stack Developer"
            />
            <label>Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={4}
              placeholder="Tell clients about your experience..."
            />
            <label>Skills</label>
            <div className="skills-chosen">
              {SKILLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`skill-btn ${form.skills?.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleSkill(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <label>Hourly rate (₹)</label>
            <input
              type="number"
              min="0"
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
            />
            <label>Availability</label>
            <select
              value={form.availability}
              onChange={(e) => setForm({ ...form, availability: e.target.value })}
            >
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="as-needed">As needed</option>
            </select>
          </section>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
