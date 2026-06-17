import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { SKILLS } from '../utils/constants';
import './Profile.css';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

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
      setAvatarPreview(user.avatar ? resolveAvatar(user.avatar) : null);
    }
  }, [user]);

  function resolveAvatar(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '');
    return `${base}${url}`;
  }

  const handleAvatarChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarMsg('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMsg('Image must be smaller than 5 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarMsg('');
    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true);
    setAvatarMsg('');
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      setAvatarFile(null);
      setAvatarMsg('Profile picture updated!');
    } catch (err) {
      setAvatarMsg(err.response?.data?.message || 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  };

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

  const getInitials = () => {
    const first = (user?.firstName || '')[0] || '';
    const last = (user?.lastName || '')[0] || '';
    return (first + last).toUpperCase() || (user?.email || 'U')[0].toUpperCase();
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      <h1>Profile settings</h1>
      <p className="page-sub">Update your profile. This is visible to others.</p>

      {/* ── Avatar Section ── */}
      <section className="avatar-section">
        <h2 className="avatar-section-title">Profile picture</h2>
        <div className="avatar-row">
          {/* Avatar preview */}
          <div
            className={`avatar-dropzone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleAvatarChange(e.dataTransfer.files[0]);
            }}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar preview" className="avatar-preview-img" />
            ) : (
              <div className="avatar-initials">{getInitials()}</div>
            )}
            <div className="avatar-overlay">
              <span className="avatar-overlay-icon">📷</span>
              <span className="avatar-overlay-text">Change photo</span>
            </div>
          </div>

          {/* Info & actions */}
          <div className="avatar-info">
            <p className="avatar-name">
              {user.firstName || user.email?.split('@')[0]} {user.lastName || ''}
            </p>
            <p className="avatar-email">{user.email}</p>
            <p className="avatar-hint">JPG, PNG or GIF · Max 5 MB<br />Click the photo or drag &amp; drop to change</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleAvatarChange(e.target.files[0])}
            />

            <div className="avatar-actions">
              <button
                type="button"
                className="btn btn-ghost avatar-pick-btn"
                onClick={() => fileInputRef.current.click()}
              >
                Choose photo
              </button>
              {avatarFile && (
                <button
                  type="button"
                  className="btn btn-primary avatar-save-btn"
                  onClick={handleAvatarUpload}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? 'Uploading...' : 'Save photo'}
                </button>
              )}
            </div>
            {avatarMsg && (
              <p className={`avatar-msg ${avatarMsg.includes('updated') ? 'success' : 'error'}`}>
                {avatarMsg}
              </p>
            )}
          </div>
        </div>
      </section>

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
