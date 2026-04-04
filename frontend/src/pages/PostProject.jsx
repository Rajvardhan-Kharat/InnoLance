import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { CATEGORIES, DURATIONS, SKILLS } from '../utils/constants';
import AssessmentBuilder from '../components/AssessmentBuilder';
import './PostProject.css';

export default function PostProject() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: CATEGORIES[0],
    skills: [],
    budgetType: 'fixed',
    budget: '',
    budgetMax: '',
    weeklyMinHours: '',
    weeklyMaxHours: '',
    duration: '1-4weeks',
    deadline: '',
  });

  const [assessmentEnabled, setAssessmentEnabled] = useState(false);
  const [assessmentSeed, setAssessmentSeed] = useState('');
  const [assessmentQuestions, setAssessmentQuestions] = useState([]);
  const [assessmentQuestionCount, setAssessmentQuestionCount] = useState(0);

  const toggleSkill = (skill) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        skills: form.skills,
        budgetType: form.budgetType,
        duration: form.duration,
      };
      if (form.budgetType === 'fixed') {
        payload.budget = Number(form.budget);
      } else {
        payload.budget = Number(form.budget);
        if (form.budgetMax) payload.budgetMax = Number(form.budgetMax);
        if (form.weeklyMinHours !== '') payload.weeklyMinMinutes = Math.max(0, Math.round(Number(form.weeklyMinHours) * 60));
        if (form.weeklyMaxHours !== '') payload.weeklyMaxMinutes = Math.max(0, Math.round(Number(form.weeklyMaxHours) * 60));
      }
      if (form.deadline) payload.deadline = form.deadline;

      if (assessmentEnabled) {
        if (!assessmentQuestions || assessmentQuestions.length === 0) {
          setError('Please build/select assessment questions before posting.');
          setLoading(false);
          return;
        }
        if (assessmentQuestions.length !== assessmentQuestionCount) {
          setError(`Please select exactly ${assessmentQuestionCount} questions for the assessment.`);
          setLoading(false);
          return;
        }
        payload.assessmentEnabled = true;
        payload.assessmentQuestions = assessmentQuestions;
      } else {
        payload.assessmentEnabled = false;
      }

      const { data } = await api.post('/projects', payload);
      navigate(`/projects/${data.project._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="post-project">
      <h1>Post a project</h1>
      <p className="page-sub">Describe your project and budget. Freelancers will send proposals.</p>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit} className="post-form">
        <label>Project title *</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Build a React dashboard"
          required
        />
        <label>Description *</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe the scope, deliverables, and any requirements..."
          rows={6}
          required
        />
        <label>Category *</label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label>Skills (optional)</label>
        <div className="skills-chosen">
          {SKILLS.map((s) => (
            <button
              key={s}
              type="button"
              className={`skill-btn ${form.skills.includes(s) ? 'active' : ''}`}
              onClick={() => toggleSkill(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={assessmentEnabled}
            onChange={(e) => {
              const next = e.target.checked;
              setAssessmentEnabled(next);
              setAssessmentQuestions([]);
              setAssessmentQuestionCount(0);
              if (next) {
                const seed = form.skills?.length ? form.skills.join(', ') : '';
                setAssessmentSeed(seed);
              }
            }}
          />
          Require assessment quiz before proposal submission
        </label>

        {assessmentEnabled && (
          <div style={{ marginTop: 12 }}>
            <label>Assessment AI seed (skill/category)</label>
            <input
              value={assessmentSeed}
              onChange={(e) => setAssessmentSeed(e.target.value)}
              placeholder="e.g. React, UI/UX, Node.js, etc."
            />
            <div style={{ marginTop: 10 }}>
              <AssessmentBuilder
                skillCategory={assessmentSeed || form.skills.join(', ')}
                selectedQuestions={assessmentQuestions}
                onSelectedQuestionsChange={setAssessmentQuestions}
                onQuestionCountChange={setAssessmentQuestionCount}
              />
            </div>
          </div>
        )}
        <label>Budget type *</label>
        <div className="radio-group">
          <label className="radio">
            <input
              type="radio"
              name="budgetType"
              checked={form.budgetType === 'fixed'}
              onChange={() => setForm({ ...form, budgetType: 'fixed' })}
            />
            Fixed price
          </label>
          <label className="radio">
            <input
              type="radio"
              name="budgetType"
              checked={form.budgetType === 'hourly'}
              onChange={() => setForm({ ...form, budgetType: 'hourly' })}
            />
            Hourly
          </label>
        </div>
        {form.budgetType === 'fixed' ? (
          <>
            <label>Budget (₹) *</label>
            <input
              type="number"
              min="1"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              required
            />
          </>
        ) : (
          <>
            <label>Hourly rate range (₹) *</label>
            <div className="row-two">
              <input
                type="number"
                min="1"
                placeholder="Min"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                required
              />
              <input
                type="number"
                min="1"
                placeholder="Max"
                value={form.budgetMax}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
              />
            </div>
            <label>Weekly hours limit (optional)</label>
            <div className="row-two">
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Min hours/week"
                value={form.weeklyMinHours}
                onChange={(e) => setForm({ ...form, weeklyMinHours: e.target.value })}
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Max hours/week"
                value={form.weeklyMaxHours}
                onChange={(e) => setForm({ ...form, weeklyMaxHours: e.target.value })}
              />
            </div>
          </>
        )}
        <label>Duration</label>
        <select
          value={form.duration}
          onChange={(e) => setForm({ ...form, duration: e.target.value })}
        >
          {DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <label>Deadline (optional)</label>
        <input
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? 'Posting...' : 'Post project'}
        </button>
      </form>
    </div>
  );
}
