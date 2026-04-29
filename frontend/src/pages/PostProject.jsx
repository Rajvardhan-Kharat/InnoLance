import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { CATEGORIES, DURATIONS, SKILLS } from '../utils/constants';
import AssessmentBuilder from '../components/AssessmentBuilder';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './PostProject.css';

// ─── Step 0: Project type selection screen ────────────────────────────────────
function ProjectTypeSelector({ onSelect }) {
  return (
    <div className="pp-wrapper">
      <div className="pp-header">
        <h1>What are you looking for?</h1>
        <p>Choose how you'd like to post your project. We'll guide you through the right process.</p>
      </div>

      <div className="pp-choice-grid">
        {/* Regular Project */}
        <button
          type="button"
          className="pp-choice-card regular"
          id="choice-regular-project"
          onClick={() => onSelect('regular')}
        >
          <div className="pp-choice-icon">👨‍💻</div>
          <h2>Post a Regular Project</h2>
          <p>
            Hire an individual freelancer for your project. Set your scope, budget, and let
            qualified freelancers send you proposals.
          </p>
          <span className="pp-choice-badge">
            🟢 For Individuals &amp; SMBs
          </span>
          <span className="pp-arrow">→</span>
        </button>

        {/* Enterprise RFP */}
        <button
          type="button"
          className="pp-choice-card enterprise"
          id="choice-enterprise-rfp"
          onClick={() => onSelect('enterprise')}
        >
          <div className="pp-choice-icon">🏢</div>
          <h2>Submit an Enterprise RFP</h2>
          <p>
            For large-scale projects or agencies. Submit a detailed Request for Proposal — our
            team will review and build a tailored team for you.
          </p>
          <span className="pp-choice-badge">
            🔷 Enterprise &amp; Agencies
          </span>
          <span className="pp-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

// ─── Step 1A: Regular Project Form ───────────────────────────────────────────
function RegularProjectForm({ onBack }) {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ideaText, setIdeaText] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState([]);

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

  const toggleSkill = (skill) =>
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));

  const handleAiAssist = async () => {
    setError('');
    setAiLoading(true);
    try {
      const { data } = await api.post('/projects/generate-full-details', { 
        ideaText,
        aiInstructions: aiInstructions.trim() 
      });
      const filled = [];
      const next = {};
      if (data.title && data.title !== 'Untitled Project') { next.title = data.title; filled.push('title'); }
      if (data.description && data.description !== ideaText) { next.description = data.description; filled.push('description'); }
      if (Array.isArray(data.skills) && data.skills.length) {
        // Match against our known skills list
        const matched = data.skills.filter((s) =>
          SKILLS.some((sk) => sk.toLowerCase() === s.toLowerCase())
        );
        next.skills = matched.length ? matched : data.skills.slice(0, 5);
        filled.push('skills');
      }
      if (data.budget && Number(data.budget) > 0) {
        next.budget = String(data.budget);
        filled.push('budget');
      }
      if (data.duration && DURATIONS.find((d) => d.value === data.duration)) {
        next.duration = data.duration;
        filled.push('duration');
      }
      setForm((f) => ({ ...f, ...next }));
      setAiFilledFields(filled);
      if (filled.length === 0) {
        setError('AI could not generate project details. Please check your API key or try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'AI Assist failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ── Explicit required-field validation ──
    if (!form.title.trim()) return setError('⚠️ Project Title is required.');
    if (!form.description.trim()) return setError('⚠️ Description is required.');
    if (!form.budget || Number(form.budget) <= 0) {
      return setError('⚠️ Budget is required and must be greater than 0.');
    }
    if (form.budgetType === 'hourly' && form.budgetMax && Number(form.budgetMax) < Number(form.budget)) {
      return setError('⚠️ Max hourly rate must be greater than or equal to min rate.');
    }

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
      showToast('Project posted successfully! 🎉', 'success');
      navigate(`/projects/${data.project._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create project. Please check all fields and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pp-wrapper">
      <button type="button" className="pp-back-btn" onClick={onBack}>← Back to project type selection</button>

      <div className="pp-section-title">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Post a Regular Project</h1>
        <span className="pp-section-badge regular">Freelancer</span>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* AI Assist Box */}
      <div className="pp-ai-box">
        <div className="pp-ai-box-header">
          <span style={{ fontSize: '1.2rem' }}>✨</span>
          <h3>AI Assist</h3>
          <span className="pp-ai-label">✦ AI Powered</span>
        </div>
        <p>Describe your project in plain language — AI will auto-fill the title, description, required skills, estimated budget, and duration.</p>
        <textarea
          id="ai-idea-input"
          placeholder="E.g., I need a mobile app for restaurant food delivery with real-time tracking, payments, and an admin dashboard..."
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          rows={3}
        />
        <textarea
          placeholder="Optional instructions for AI (e.g. 'Keep budget low', 'Requires AWS')"
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '8px', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }}
        />
        <div className="pp-ai-actions" style={{ marginTop: '12px' }}>
          <button
            type="button"
            className="btn-ai btn-ai-primary"
            id="btn-ai-assist"
            onClick={handleAiAssist}
            disabled={aiLoading || !ideaText.trim()}
          >
            {aiLoading ? <><span className="spinner" /> Generating...</> : '✨ AI Auto-fill All Fields'}
          </button>
        </div>
        {aiFilledFields.length > 0 && (
          <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600 }}>
            ✓ AI filled: {aiFilledFields.join(', ')}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="post-form pp-form-wrap">
        <label htmlFor="pp-title">Project Title *</label>
        <input
          id="pp-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Build a React dashboard with authentication"
          required
          className={aiFilledFields.includes('title') ? 'ai-filled' : ''}
        />

        <label htmlFor="pp-description">Description *</label>
        <textarea
          id="pp-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe the scope, deliverables, and requirements..."
          rows={7}
          required
          className={aiFilledFields.includes('description') ? 'ai-filled' : ''}
        />

        <label htmlFor="pp-category">Category *</label>
        <select
          id="pp-category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label>Required Skills (optional)</label>
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

        {/* Assessment */}
        <label style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={assessmentEnabled}
            onChange={(e) => {
              const next = e.target.checked;
              setAssessmentEnabled(next);
              setAssessmentQuestions([]);
              setAssessmentQuestionCount(0);
              if (next) setAssessmentSeed(form.skills?.length ? form.skills.join(', ') : '');
            }}
          />
          Require assessment quiz before proposal submission
        </label>

        {assessmentEnabled && (
          <div style={{ marginTop: 12, padding: '16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <label>Assessment AI seed</label>
            <input
              value={assessmentSeed}
              onChange={(e) => setAssessmentSeed(e.target.value)}
              placeholder="e.g. React, UI/UX, Node.js"
            />
            <div style={{ marginTop: 12 }}>
              <AssessmentBuilder
                skillCategory={assessmentSeed || form.skills.join(', ')}
                selectedQuestions={assessmentQuestions}
                onSelectedQuestionsChange={setAssessmentQuestions}
                onQuestionCountChange={setAssessmentQuestionCount}
              />
            </div>
          </div>
        )}

        <label>Budget Type *</label>
        <div className="radio-group">
          <label className="radio">
            <input type="radio" name="budgetType" checked={form.budgetType === 'fixed'} onChange={() => setForm({ ...form, budgetType: 'fixed' })} />
            Fixed Price
          </label>
          <label className="radio">
            <input type="radio" name="budgetType" checked={form.budgetType === 'hourly'} onChange={() => setForm({ ...form, budgetType: 'hourly' })} />
            Hourly Rate
          </label>
        </div>

        {form.budgetType === 'fixed' ? (
          <>
            <label htmlFor="pp-budget">Budget (₹) *</label>
            <input
              id="pp-budget"
              type="number"
              min="1"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              placeholder="e.g. 15000"
              required
              className={aiFilledFields.includes('budget') ? 'ai-filled' : ''}
            />
          </>
        ) : (
          <>
            <label>Hourly Rate Range (₹) *</label>
            <div className="row-two">
              <input type="number" min="1" placeholder="Min ₹/hr" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} required />
              <input type="number" min="1" placeholder="Max ₹/hr" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} />
            </div>
            <label>Weekly Hours Limit (optional)</label>
            <div className="row-two">
              <input type="number" min="0" step="1" placeholder="Min hrs/week" value={form.weeklyMinHours} onChange={(e) => setForm({ ...form, weeklyMinHours: e.target.value })} />
              <input type="number" min="0" step="1" placeholder="Max hrs/week" value={form.weeklyMaxHours} onChange={(e) => setForm({ ...form, weeklyMaxHours: e.target.value })} />
            </div>
          </>
        )}

        <label htmlFor="pp-duration">Duration</label>
        <select
          id="pp-duration"
          value={form.duration}
          onChange={(e) => setForm({ ...form, duration: e.target.value })}
          className={aiFilledFields.includes('duration') ? 'ai-filled' : ''}
        >
          {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        <label htmlFor="pp-deadline">Deadline (optional)</label>
        <input
          id="pp-deadline"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />

        <button type="submit" className="btn btn-primary btn-lg" id="btn-post-project" disabled={loading}>
          {loading ? 'Posting...' : '🚀 Post Project'}
        </button>
      </form>
    </div>
  );
}

// ─── Step 1B: Enterprise RFP Form ─────────────────────────────────────────────
function EnterpriseRfpForm({ onBack }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragover, setDragover] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  // AI Draft state
  const [ideaText, setIdeaText] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState([]);

  const [form, setForm] = useState({
    companyName: '',
    projectOverview: '',
    technicalScope: '',
    goalsAndRequirements: '',
    startDate: '',
    finalDeadline: '',
    budgetRange: '',
  });

  const handleFileChange = (file) => {
    if (!file) return;
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, DOCX, DOC, TXT, PNG, JPEG files are accepted.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return;
    }
    setError('');
    setUploadedFile(file);
  };

  const handleAiDraftRfp = async () => {
    setError('');
    setAiLoading(true);
    try {
      const { data } = await api.post('/enterprise-rfp/generate-rfp-draft', { 
        ideaText,
        aiInstructions: aiInstructions.trim() 
      });
      const filled = [];
      const next = {};
      if (data.projectOverview && data.projectOverview !== ideaText) { next.projectOverview = data.projectOverview; filled.push('projectOverview'); }
      if (data.technicalScope) { next.technicalScope = data.technicalScope; filled.push('technicalScope'); }
      if (data.goalsAndRequirements) { next.goalsAndRequirements = data.goalsAndRequirements; filled.push('goalsAndRequirements'); }
      if (data.suggestedBudgetRange) { next.budgetRange = data.suggestedBudgetRange; filled.push('budgetRange'); }
      setForm((f) => ({ ...f, ...next }));
      setAiFilledFields(filled);
      if (filled.length === 0) {
        setError('AI could not draft the RFP. Please check your API key or try again with more detail.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'AI Draft RFP failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ── Explicit required-field validation ──
    if (!form.projectOverview.trim()) {
      return setError('⚠️ Project Overview / Problem Statement is required.');
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('projectOverview', form.projectOverview);
      if (form.technicalScope) formData.append('technicalScope', form.technicalScope);
      if (form.goalsAndRequirements) formData.append('goalsAndRequirements', form.goalsAndRequirements);
      if (form.startDate) formData.append('startDate', form.startDate);
      if (form.finalDeadline) formData.append('finalDeadline', form.finalDeadline);
      if (form.budgetRange) formData.append('budgetRange', form.budgetRange);
      if (form.companyName) formData.append('companyName', form.companyName);
      if (uploadedFile) formData.append('rfpDocument', uploadedFile);

      await api.post('/enterprise-rfp/direct-submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      showToast('Enterprise RFP submitted! Our team will review it shortly. 🎉', 'success', 5000);
      setSuccess('🎉 Your Enterprise RFP has been submitted! Our team will review it and reach out within 1-2 business days.');
      setTimeout(() => navigate('/myprojects'), 3500);
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ENTERPRISE_BUDGET_RANGES = [
    '₹50,000 – ₹1,00,000',
    '₹1,00,000 – ₹5,00,000',
    '₹5,00,000 – ₹15,00,000',
    '₹15,00,000 – ₹50,00,000',
    '₹50,00,000+',
    'To Be Discussed',
  ];

  return (
    <div className="pp-wrapper enterprise-form">
      <button type="button" className="pp-back-btn" onClick={onBack}>← Back to project type selection</button>

      <div className="pp-section-title">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Enterprise RFP Submission</h1>
        <span className="pp-section-badge enterprise">Enterprise</span>
      </div>

      <div className="pp-info-strip">
        <div className="pp-info-chip">🏢 <span>Reviewed by our <strong>Solutions Team</strong></span></div>
        <div className="pp-info-chip">⚡ <span>Response within <strong>1-2 business days</strong></span></div>
        <div className="pp-info-chip">🔒 <span><strong>Confidential</strong> & secure</span></div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      {/* AI Draft RFP Box */}
      <div className="pp-ai-box">
        <div className="pp-ai-box-header">
          <span style={{ fontSize: '1.2rem' }}>🤖</span>
          <h3>AI Draft RFP Builder</h3>
          <span className="pp-ai-label">✦ AI Powered</span>
        </div>
        <p>Only have a rough idea? Describe it in plain language and AI will expand it into a complete, professional Enterprise RFP with Problem Statement, Technical Scope, Goals &amp; Requirements.</p>
        <textarea
          id="rfp-ai-idea-input"
          placeholder="E.g., We need an enterprise-grade HR management system for 5000+ employees with payroll, leave management, performance reviews, and integration with our existing ERP (SAP)..."
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          rows={4}
        />
        <textarea
          placeholder="Optional instructions for AI (e.g. 'Emphasize security', 'Use React and Node')"
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '8px', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }}
        />
        <div className="pp-ai-actions" style={{ marginTop: '12px' }}>
          <button
            type="button"
            className="btn-ai btn-ai-primary"
            id="btn-ai-draft-rfp"
            onClick={handleAiDraftRfp}
            disabled={aiLoading || !ideaText.trim()}
          >
            {aiLoading ? <><span className="spinner" /> Drafting RFP...</> : '🤖 AI Draft Full RFP'}
          </button>
        </div>
        {aiFilledFields.length > 0 && (
          <p style={{ marginTop: 12, marginBottom: 0, color: '#6366f1', fontSize: '0.82rem', fontWeight: 600 }}>
            ✓ AI filled: {aiFilledFields.join(', ')}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="post-form">
        {/* Company Name */}
        <label htmlFor="rfp-company">Company / Organisation Name</label>
        <input
          id="rfp-company"
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          placeholder="Your company or organisation name"
        />

        {/* Project Overview */}
        <label htmlFor="rfp-overview">Project Overview / Problem Statement *</label>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '-12px 0 8px' }}>
          What exactly do you need to build or solve? Be as detailed as possible.
        </p>
        <textarea
          id="rfp-overview"
          value={form.projectOverview}
          onChange={(e) => setForm({ ...form, projectOverview: e.target.value })}
          placeholder="Describe the business problem, target users, core functionality required, and expected outcomes..."
          rows={7}
          required
          className={aiFilledFields.includes('projectOverview') ? 'ai-filled' : ''}
        />

        {/* Technical Scope */}
        <label htmlFor="rfp-tech-scope">Technical Scope &amp; Requirements</label>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '-12px 0 8px' }}>
          Required tech stacks, integrations, APIs, specific features, scalability &amp; security needs.
        </p>
        <textarea
          id="rfp-tech-scope"
          value={form.technicalScope}
          onChange={(e) => setForm({ ...form, technicalScope: e.target.value })}
          placeholder="E.g., Must integrate with Salesforce CRM. Tech stack: React frontend, Node.js backend, PostgreSQL. Must support 10,000+ concurrent users. SOC2 compliance required..."
          rows={6}
          className={aiFilledFields.includes('technicalScope') ? 'ai-filled' : ''}
        />

        {/* Goals & Requirements */}
        <label htmlFor="rfp-goals">Goals &amp; Requirements</label>
        <textarea
          id="rfp-goals"
          value={form.goalsAndRequirements}
          onChange={(e) => setForm({ ...form, goalsAndRequirements: e.target.value })}
          placeholder="List key deliverables, success criteria, non-functional requirements (performance, security, availability)..."
          rows={5}
          className={aiFilledFields.includes('goalsAndRequirements') ? 'ai-filled' : ''}
        />

        {/* Timeline */}
        <label>Timeline &amp; Milestones</label>
        <div className="row-two">
          <div>
            <label htmlFor="rfp-start" style={{ marginTop: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Expected Start Date</label>
            <input
              id="rfp-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rfp-deadline" style={{ marginTop: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Final Deadline</label>
            <input
              id="rfp-deadline"
              type="date"
              value={form.finalDeadline}
              onChange={(e) => setForm({ ...form, finalDeadline: e.target.value })}
            />
          </div>
        </div>

        {/* Budget Range */}
        <label htmlFor="rfp-budget-range">Enterprise Budget Range</label>
        <select
          id="rfp-budget-range"
          value={form.budgetRange}
          onChange={(e) => setForm({ ...form, budgetRange: e.target.value })}
          className={aiFilledFields.includes('budgetRange') ? 'ai-filled' : ''}
        >
          <option value="">Select a budget range...</option>
          {ENTERPRISE_BUDGET_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* File Upload */}
        <label>Upload PRD / Architectural Diagrams (optional)</label>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '-12px 0 8px' }}>
          Drag &amp; drop your existing Product Requirements Document or diagrams. Supported: PDF, DOCX, TXT, PNG, JPEG (max 20 MB).
        </p>
        <div
          className={`rfp-dropzone ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragover(false);
            handleFileChange(e.dataTransfer.files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="rfp-file-input"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e.target.files[0])}
          />
          <div className="rfp-dropzone-icon">📄</div>
          {uploadedFile ? (
            <div className="rfp-file-info">
              ✓ {uploadedFile.name} ({(uploadedFile.size / 1024 / 1024).toFixed(1)} MB)
            </div>
          ) : (
            <>
              <h4>Drop your file here or click to browse</h4>
              <p>PDF, DOCX, TXT, PNG, JPEG accepted — max 20 MB</p>
            </>
          )}
        </div>

        <button
          type="submit"
          className="btn-enterprise-submit"
          id="btn-submit-rfp"
          disabled={loading || !!success}
        >
          {loading ? <><span className="spinner" /> Submitting RFP...</> : '🏢 Submit Enterprise RFP'}
        </button>
      </form>
    </div>
  );
}

// ─── Main export: orchestrates steps ─────────────────────────────────────────
export default function PostProject() {
  const [step, setStep] = useState('select'); // 'select' | 'regular' | 'enterprise'

  if (step === 'regular') return <RegularProjectForm onBack={() => setStep('select')} />;
  if (step === 'enterprise') return <EnterpriseRfpForm onBack={() => setStep('select')} />;
  return <ProjectTypeSelector onSelect={setStep} />;
}
