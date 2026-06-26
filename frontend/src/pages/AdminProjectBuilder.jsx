import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import AssessmentBuilder from '../components/AssessmentBuilder';
import { useToast } from '../context/ToastContext';
import './AdminProjectBuilder.css';

// ─── Role category colours ────────────────────────────────────────────────────
const ROLE_COLORS = {
  'Project Manager': '#6366f1',
  'UX': '#a855f7',
  'Designer': '#a855f7',
  'Frontend': '#3b82f6',
  'Backend': '#0ea5e9',
  'Database': '#06b6d4',
  'QA': '#f59e0b',
  'Tester': '#f59e0b',
  'DevOps': '#10b981',
  'Infrastructure': '#10b981',
  'Security': '#ef4444',
  'Technical Writer': '#64748b',
  'Documentation': '#64748b',
};

function getRoleColor(title = '') {
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (title.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#8b5cf6';
}

const emptyTask = () => ({
  title: '',
  description: '',
  requiredTechStackText: '',
  allocatedBudget: '',
  quizEnabled: false,
  quizSelectedQuestions: [],
  quizQuestionCount: 0,
});

function parseTechStack(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function sumBudgets(tasks) {
  return tasks.reduce((acc, t) => {
    const n = Number(t.allocatedBudget);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

function fmtINR(n) {
  if (!n || !Number.isFinite(Number(n))) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
}

export default function AdminProjectBuilder() {
  const { projectId } = useParams();
  const { show: showToast } = useToast();
  const prevProjectId = useRef(null);

  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]             = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [project, setProject]         = useState(null);
  const [tasks, setTasks]             = useState([emptyTask()]);
  const [editableBudget, setEditableBudget] = useState(0);
  const [copyQuizFromFirst, setCopyQuizFromFirst] = useState(false);
  const [platformMarginPct, setPlatformMarginPct] = useState(15);
  const [platformMargin, setPlatformMargin]       = useState(0);
  const [freelancerBudget, setFreelancerBudget]   = useState(0);

  const totalAllocated = useMemo(() => sumBudgets(tasks), [tasks]);
  const totalBudget    = Number(editableBudget) || 0;
  const effectiveFreelancerBudget = totalBudget > 0 ? Math.round(totalBudget * (1 - platformMarginPct / 100)) : 0;
  const overBudget     = Number.isFinite(totalBudget) && totalAllocated > effectiveFreelancerBudget;
  const allocPercent   = effectiveFreelancerBudget > 0 ? Math.min(100, Math.round((totalAllocated / effectiveFreelancerBudget) * 100)) : 0;

  const firstQuizTaskIndex = useMemo(() => tasks.findIndex((t) => t?.quizEnabled), [tasks]);

  // ── Clear stale draft when switching to a different project ──────────────
  useEffect(() => {
    if (prevProjectId.current && prevProjectId.current !== projectId) {
      // Different project loaded — wipe previous draft so form starts clean
      try {
        localStorage.removeItem(`rfp_builder_draft_${prevProjectId.current}`);
      } catch { /* ignore */ }
      setTasks([emptyTask()]);
      setPlatformMargin(0);
      setFreelancerBudget(0);
      setEditableBudget(0);
    }
    prevProjectId.current = projectId;
  }, [projectId]);

  // ── Load project from API ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    api.get(`/admin/enterprise-projects/${projectId}`)
      .then(({ data }) => {
        if (!mounted) return;
        const proj = data.project || data.enterpriseProject || data;
        setProject(proj);
        setEditableBudget(proj.overallTotalBudget || 0);
        // Recalculate margin from stored budget
        const tb = Number(proj.overallTotalBudget) || 0;
        if (tb > 0) {
          setFreelancerBudget(Math.round(tb * (1 - platformMarginPct / 100)));
          setPlatformMargin(Math.round(tb * (platformMarginPct / 100)));
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.response?.data?.message || 'Failed to load enterprise project.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    // Restore draft from localStorage (only for THIS project)
    let restored = false;
    try {
      const raw = localStorage.getItem(`rfp_builder_draft_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTasks(parsed);
          restored = true;
        }
      }
    } catch { /* ignore */ }

    // If no draft, try to use client's suggested tasks
    if (!restored) {
      api.get(`/admin/enterprise-projects/${projectId}`)
        .then(({ data }) => {
          const proj = data.project || data.enterpriseProject || data;
          if (proj.suggestedTasks && proj.suggestedTasks.length > 0) {
            setTasks(proj.suggestedTasks.map((st) => ({
              ...emptyTask(),
              title: st.title || '',
              description: st.description || '',
              budget: st.budget ? String(st.budget) : '',
              skills: st.skills || [],
            })));
          }
        })
        .catch(() => {});
    }

    return () => { mounted = false; };
  }, [projectId]);

  // ── Persist draft ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(`rfp_builder_draft_${projectId}`, JSON.stringify(tasks));
    } catch { /* ignore */ }
  }, [projectId, tasks]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const setTaskField = (idx, field, value) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const addTask  = () => setTasks((prev) => [...prev, emptyTask()]);
  const removeTask = (idx) => setTasks((prev) => {
    const next = prev.filter((_, i) => i !== idx);
    return next.length > 0 ? next : [emptyTask()];
  });

  const validate = () => {
    if (!projectId) return 'Missing projectId in route.';
    if (!Array.isArray(tasks) || tasks.length === 0) return 'Add at least one micro-deliverable.';
    if (overBudget) return `Allocated budgets exceed the freelancer budget (${fmtINR(effectiveFreelancerBudget)}).`;

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t.title?.trim()) return `Task ${i + 1}: Title is required.`;
      if (!t.description?.trim()) return `Task ${i + 1}: Description is required.`;
      const tech = parseTechStack(t.requiredTechStackText);
      if (tech.length === 0) return `Task ${i + 1}: Required Tech Stack is required.`;
      const b = Number(t.allocatedBudget);
      if (!Number.isFinite(b) || b < 0) return `Task ${i + 1}: Allocated Budget must be a valid number >= 0.`;

      if (t.quizEnabled) {
        const isShared = copyQuizFromFirst && firstQuizTaskIndex >= 0 && i !== firstQuizTaskIndex;
        if (!isShared) {
          const q = Array.isArray(t.quizSelectedQuestions) ? t.quizSelectedQuestions : [];
          const expected = Number(t.quizQuestionCount) || q.length;
          if (q.length !== expected) return `Task ${i + 1}: Select exactly ${expected} quiz questions.`;
        }
      }
    }
    return '';
  };

  // ── AI WBS Generation ────────────────────────────────────────────────────
  const handleGenerateFromAI = async () => {
    if (!project?.originalRfpText) {
      alert('No RFP text available to analyze.');
      return;
    }
    setIsGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/admin/enterprise-projects/${projectId}/suggest-microjobs`, {
        aiInstructions: aiInstructions.trim()
      });
      if (data.suggestions && data.suggestions.length > 0) {
        setTasks(data.suggestions);
        if (data.platformMargin !== undefined) setPlatformMargin(data.platformMargin);
        if (data.freelancerBudget !== undefined) setFreelancerBudget(data.freelancerBudget);
      } else {
        alert('AI did not return any valid WBS tasks. Try again or add tasks manually.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to auto-generate WBS. Check server configuration.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handleBulkPublish = async () => {
    if (project?.status !== 'Pending Breakdown') {
      alert('This project has already been broken down and published!');
      return;
    }
    if (overBudget) {
      alert(`Cannot publish: total allocations exceed the freelancer budget of ${fmtINR(effectiveFreelancerBudget)}.`);
      return;
    }
    const msg = validate();
    if (msg) { alert(msg); return; }

    setSaving(true);
    setError('');
    try {
      const sharedQuizQuestions = firstQuizTaskIndex >= 0 ? tasks[firstQuizTaskIndex]?.quizSelectedQuestions : [];
      const payload = {
        overallTotalBudget: Number(editableBudget),
        microJobs: tasks.map((t, idx) => ({
          title: t.title.trim(),
          description: t.description.trim(),
          requiredTechStack: parseTechStack(t.requiredTechStackText),
          allocatedBudget: Number(t.allocatedBudget),
          assessment:
            t.quizEnabled === true
              ? {
                  enabled: true,
                  questions: copyQuizFromFirst && firstQuizTaskIndex >= 0 && idx !== firstQuizTaskIndex
                    ? sharedQuizQuestions
                    : t.quizSelectedQuestions,
                }
              : { enabled: false },
        })),
      };

      await api.post(`/admin/enterprise-projects/${projectId}/microjobs/bulk`, payload);

      try { localStorage.removeItem(`rfp_builder_draft_${projectId}`); } catch { /* ignore */ }

      setProject((prev) => prev ? { ...prev, status: 'In Progress' } : null);
      showToast('✅ Published successfully! All micro-deliverables are now live on the marketplace.', 'success', 6000);
    } catch (err) {
      setError(err.response?.data?.message || 'Publish failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="admin-project-builder">
        <h1>Enterprise Project Builder</h1>
        <div className="builder-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="builder-spinner" />
          <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading project...</p>
        </div>
      </div>
    );
  }

  const clientMarginPct = platformMarginPct;

  return (
    <div className="admin-project-builder">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="builder-header">
        <div>
          <h1>Enterprise Project Builder</h1>
          <div className="builder-subtitle">
            {project?.clientReference
              ? <span><strong>Client Ref:</strong> {project.clientReference}</span>
              : <span className="muted">Client Ref: (missing)</span>
            }
            <span className="dot">•</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <strong>Client Budget:</strong>
              <input
                type="number"
                value={editableBudget}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setEditableBudget(v);
                  setFreelancerBudget(Math.round(v * (1 - platformMarginPct / 100)));
                  setPlatformMargin(Math.round(v * (platformMarginPct / 100)));
                }}
                className="budget-input-inline"
                style={{ width: '110px', padding: '2px 6px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

        {project?.originalRfpDocumentUrl ? (
          <a className="btn btn-ghost" href={project.originalRfpDocumentUrl} target="_blank" rel="noreferrer">
            📎 View RFP Document
          </a>
        ) : (
          <span className="muted">No RFP document</span>
        )}
      </div>

      {/* ─── Budget Summary Strip ─────────────────────────────────────────── */}
      {totalBudget > 0 && (
        <div className="budget-summary-strip" style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20,
          padding: '14px 20px', background: 'var(--surface)',
          borderRadius: 12, border: '1px solid var(--border)',
        }}>
          <div className="budget-pill" style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem' }}>
            💰 Client Budget: {fmtINR(totalBudget)}
          </div>
          <div className="budget-pill" style={{ background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            🏦 Platform Margin
            <input
              type="number"
              min="0"
              max="100"
              value={platformMarginPct}
              onChange={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                setPlatformMarginPct(v);
                if (totalBudget > 0) {
                  setFreelancerBudget(Math.round(totalBudget * (1 - v / 100)));
                  setPlatformMargin(Math.round(totalBudget * (v / 100)));
                }
              }}
              style={{ width: '60px', padding: '2px 6px', border: '1px solid #d97706', borderRadius: '4px', background: 'transparent', color: '#92400e', fontWeight: 700 }}
            />
            %: {fmtINR(totalBudget - effectiveFreelancerBudget)}
          </div>
          <div className="budget-pill" style={{ background: '#d1fae5', color: '#065f46', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem' }}>
            👷 Freelancer Pool: {fmtINR(effectiveFreelancerBudget)}
          </div>
          <div className={`budget-pill`} style={{
            background: overBudget ? '#fee2e2' : totalAllocated > 0 ? '#dbeafe' : '#f1f5f9',
            color: overBudget ? '#991b1b' : '#1e3a5f',
            borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem',
          }}>
            📊 Allocated: {fmtINR(totalAllocated)} ({allocPercent}%)
          </div>
          {overBudget && (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem' }}>
              ⚠️ Over by {fmtINR(totalAllocated - effectiveFreelancerBudget)}
            </div>
          )}
        </div>
      )}

      {/* ─── Budget Progress Bar ─────────────────────────────────────────── */}
      {totalBudget > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 8, borderRadius: 8, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${allocPercent}%`,
              borderRadius: 8,
              background: overBudget
                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                : allocPercent > 90
                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                  : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {allocPercent}% of freelancer pool allocated
          </div>
        </div>
      )}

      {error && <div className="builder-error">{error}</div>}

      {/* ─── RFP Text Preview ────────────────────────────────────────────── */}
      {project?.originalRfpText && (
        <div className="builder-card">
          <h2>📄 RFP / PRD Content</h2>
          <pre className="rfp-text">{project.originalRfpText.slice(0, 1200)}{project.originalRfpText.length > 1200 ? '\n\n...(truncated for display)' : ''}</pre>
        </div>
      )}

      {/* ─── Micro-Deliverables ───────────────────────────────────────────── */}
      <div className="builder-card">
        <div className="builder-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2>🗂 Work Breakdown Structure (WBS)</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontWeight: 500, fontSize: '0.88rem' }}>
              <input
                type="checkbox"
                checked={copyQuizFromFirst}
                onChange={(e) => setCopyQuizFromFirst(e.target.checked)}
              />
              Share quiz from first task across all quiz-enabled tasks
            </label>
          </div>
          <div className={`budget-chip ${overBudget ? 'over' : ''}`}>
            {fmtINR(totalAllocated)} / {fmtINR(effectiveFreelancerBudget)}
          </div>
        </div>

        {/* ─── AI WBS Generation Box ─── */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
            <span style={{ marginRight: '6px' }}>🤖</span> AI WBS Generator Instructions (Optional)
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: '12px' }}>
            Guide the AI on how to break down the tasks. You can specify budget constraints, preferred tech stacks, or task granularity.
          </p>
          <textarea
            placeholder="E.g., 'Allocate the budget!! The client budget is 1,00,000 but we need to complete in just 70,000 max...'"
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }}
            disabled={isGenerating || (project && project.status !== 'Pending Breakdown')}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleGenerateFromAI}
              disabled={isGenerating || (project && project.status !== 'Pending Breakdown')}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgba(124,58,237,0.3)',
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: isGenerating ? 'wait' : 'pointer',
              }}
            >
              {isGenerating ? '✨ Generating...' : '✨ Auto-Generate with AI'}
            </button>
          </div>
        </div>

        {isGenerating && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6366f1' }}>
            <div className="builder-spinner" />
            <p style={{ marginTop: 12 }}>AI is analyzing the PRD and generating a full software delivery WBS...</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              This may take 10–30 seconds. Includes roles: PM, UX, Frontend, Backend, QA, DevOps & more.
            </p>
          </div>
        )}

        {tasks.map((t, idx) => (
          <div key={idx} className="task-card" style={{ borderLeft: `4px solid ${getRoleColor(t.title)}` }}>
            <div className="task-card-head">
              <h3 style={{ color: getRoleColor(t.title) }}>
                Task {idx + 1}
                {t.title && <span style={{ fontWeight: 400, fontSize: '0.85rem', marginLeft: 8, color: 'var(--text-muted)' }}>— {t.title}</span>}
              </h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTask(idx)}>
                🗑 Remove
              </button>
            </div>

            <div className="task-grid">
              <div className="field">
                <label>Role / Title</label>
                <input
                  value={t.title}
                  onChange={(e) => setTaskField(idx, 'title', e.target.value)}
                  placeholder="e.g., Backend: Authentication & JWT Service"
                />
              </div>

              <div className="field field-wide">
                <label>Description & Acceptance Criteria</label>
                <textarea
                  value={t.description}
                  onChange={(e) => setTaskField(idx, 'description', e.target.value)}
                  placeholder="Describe deliverables, acceptance criteria, what's in and out of scope..."
                  rows={4}
                />
              </div>

              <div className="field">
                <label>Required Tech Stack</label>
                <input
                  value={t.requiredTechStackText}
                  onChange={(e) => setTaskField(idx, 'requiredTechStackText', e.target.value)}
                  placeholder="React, Node.js, MongoDB"
                />
                <div className="hint">Comma-separated. Saved as an array.</div>
              </div>

              <div className="field">
                <label>Allocated Budget (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={t.allocatedBudget}
                  onChange={(e) => setTaskField(idx, 'allocatedBudget', e.target.value)}
                  placeholder="0"
                  style={{ borderColor: overBudget ? '#ef4444' : undefined }}
                />
                {Number(t.allocatedBudget) > 0 && effectiveFreelancerBudget > 0 && (
                  <div className="hint">
                    {Math.round((Number(t.allocatedBudget) / effectiveFreelancerBudget) * 100)}% of freelancer pool
                  </div>
                )}
              </div>

              <div className="field field-wide" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!t.quizEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setTaskField(idx, 'quizEnabled', enabled);
                      if (!enabled) setTaskField(idx, 'quizSelectedQuestions', []);
                    }}
                  />
                  Require assessment quiz before proposals for this task
                </label>
              </div>

              {t.quizEnabled && !(copyQuizFromFirst && firstQuizTaskIndex >= 0 && idx !== firstQuizTaskIndex) && (
                <div className="field field-wide" style={{ gridColumn: '1 / -1' }}>
                  <details open style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: '#6366f1', fontWeight: 700 }}>
                      Configure quiz for Task {idx + 1}
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <AssessmentBuilder
                        skillCategory={parseTechStack(t.requiredTechStackText).join(', ') || t.requiredTechStackText}
                        selectedQuestions={t.quizSelectedQuestions}
                        onSelectedQuestionsChange={(qs) => setTaskField(idx, 'quizSelectedQuestions', qs)}
                        onQuestionCountChange={(n) => setTaskField(idx, 'quizQuestionCount', n)}
                      />
                    </div>
                  </details>
                </div>
              )}

              {t.quizEnabled && copyQuizFromFirst && firstQuizTaskIndex >= 0 && idx !== firstQuizTaskIndex && (
                <div className="field field-wide" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <div style={{ color: '#718096', fontSize: '0.95em' }}>
                    Using shared quiz from Task {firstQuizTaskIndex + 1}.
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-primary" onClick={addTask}>
          + Add Another Task
        </button>
      </div>

      {/* ─── Sticky Publish Bar ───────────────────────────────────────────── */}
      <div className="builder-sticky">
        <div className="builder-sticky-inner">
          <div className="sticky-meta">
            <span className={overBudget ? 'warn' : ''}>
              {overBudget
                ? `⚠️ Over budget by ${fmtINR(totalAllocated - effectiveFreelancerBudget)} — adjust allocations`
                : tasks.length > 1
                  ? `✅ ${tasks.length} tasks ready — ${fmtINR(totalAllocated)} allocated`
                  : 'Add tasks then publish'}
            </span>
          </div>
          <button
            type="button"
            className={`btn btn-primary ${project?.status !== 'Pending Breakdown' ? 'btn-disabled' : ''}`}
            onClick={handleBulkPublish}
            disabled={saving || (project && project.status !== 'Pending Breakdown')}
          >
            {saving
              ? 'Publishing...'
              : project?.status !== 'Pending Breakdown'
                ? '✅ Already Published'
                : '🚀 Save & Publish to Marketplace'}
          </button>
        </div>
      </div>
    </div>
  );
}
