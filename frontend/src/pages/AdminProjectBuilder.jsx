import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import AssessmentBuilder from '../components/AssessmentBuilder';
import './AdminProjectBuilder.css';

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
    if (!Number.isFinite(n)) return acc;
    return acc + n;
  }, 0);
}

export default function AdminProjectBuilder() {
  const { projectId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [project, setProject] = useState(null);

  const [tasks, setTasks] = useState([emptyTask()]);
  const [editableBudget, setEditableBudget] = useState(0);
  const [copyQuizFromFirst, setCopyQuizFromFirst] = useState(false);

  const totalAllocated = useMemo(() => sumBudgets(tasks), [tasks]);
  const totalBudget = Number(editableBudget) || 0;
  const overBudget = Number.isFinite(totalBudget) && totalAllocated > totalBudget;

  const firstQuizTaskIndex = useMemo(() => tasks.findIndex((t) => t?.quizEnabled), [tasks]);

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
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.response?.data?.message || 'Failed to load enterprise project (endpoint may be missing).');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    // Restore draft tasks from localStorage
    try {
      const key = `rfp_builder_draft_${projectId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setTasks(parsed);
      }
    } catch {
      // ignore
    }

    return () => {
      mounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    // Persist drafts
    try {
      const key = `rfp_builder_draft_${projectId}`;
      localStorage.setItem(key, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [projectId, tasks]);

  const setTaskField = (idx, field, value) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const addTask = () => setTasks((prev) => [...prev, emptyTask()]);

  const removeTask = (idx) => {
    setTasks((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [emptyTask()];
    });
  };

  const validate = () => {
    if (!projectId) return 'Missing projectId in route.';
    if (!Array.isArray(tasks) || tasks.length === 0) return 'Add at least one micro-deliverable.';
    if (overBudget) return 'Allocated budgets exceed overallTotalBudget.';

    for (let i = 0; i < tasks.length; i += 1) {
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

  const handleGenerateFromAI = async () => {
    if (!project?.originalRfpText) {
      alert('No RFP text available to analyze.');
      return;
    }
    setIsGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/admin/enterprise-projects/${projectId}/suggest-microjobs`);
      if (data.suggestions && data.suggestions.length > 0) {
        setTasks(data.suggestions);
      } else {
        alert('AI did not return any valid tasks.');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to auto-generate from AI. Is GEMINI_API_KEY set?');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkPublish = async () => {
    if (project?.status !== 'Pending Breakdown') {
      alert('This project has already been broken down and published to the marketplace! You cannot publish the same jobs twice.');
      return;
    }
    
    if (overBudget) {
      alert('Cannot publish: Total allocations exceed the overall project budget.');
      return;
    }

    const msg = validate();
    if (msg) {
      alert(msg);
      return;
    }

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
                  questions:
                    copyQuizFromFirst && firstQuizTaskIndex >= 0 && idx !== firstQuizTaskIndex
                      ? sharedQuizQuestions
                      : t.quizSelectedQuestions,
                }
              : { enabled: false },
        })),
      };

      await api.post(`/admin/enterprise-projects/${projectId}/microjobs/bulk`, payload);

      // Clear draft on success
      try {
        localStorage.removeItem(`rfp_builder_draft_${projectId}`);
      } catch {
        // ignore
      }

      setProject(prev => prev ? { ...prev, status: 'In Progress' } : null);
      alert('Published successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Publish failed (endpoint may be missing).');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-project-builder">
        <h1>Enterprise Project Builder</h1>
        <div className="builder-card">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-project-builder">
      <div className="builder-header">
        <div>
          <h1>Enterprise Project Builder</h1>
          <div className="builder-subtitle">
            {project?.clientReference ? (
              <span><strong>Client Ref:</strong> {project.clientReference}</span>
            ) : (
              <span className="muted">Client Ref: (missing)</span>
            )}
            <span className="dot">•</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <strong>Total Budget:</strong> 
              <input 
                type="number" 
                value={editableBudget} 
                onChange={(e) => setEditableBudget(e.target.value)} 
                className="budget-input-inline" 
                style={{ width: '100px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

        {project?.originalRfpDocumentUrl ? (
          <a className="btn btn-ghost" href={project.originalRfpDocumentUrl} target="_blank" rel="noreferrer">
            View RFP Document
          </a>
        ) : (
          <span className="muted">No RFP URL provided</span>
        )}
      </div>

      {error && (
        <div className="builder-error">
          {error}
        </div>
      )}

      {project?.originalRfpText && (
        <div className="builder-card">
          <h2>RFP Text (excerpt)</h2>
          <pre className="rfp-text">{project.originalRfpText}</pre>
        </div>
      )}

      <div className="builder-card">
        <div className="builder-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2>Micro-Deliverables</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={copyQuizFromFirst}
                    onChange={(e) => setCopyQuizFromFirst(e.target.checked)}
                  />
                  Use first task quiz for all quiz-enabled tasks
                </label>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={handleGenerateFromAI}
              disabled={isGenerating || (project && project.status !== 'Pending Breakdown')}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.3)',
              }}
            >
              {isGenerating ? '✨ Generating...' : '✨ Auto-Generate with AI'}
            </button>
          </div>
          <div className={`budget-chip ${overBudget ? 'over' : ''}`}>
            Allocated: {totalAllocated} / {Number.isFinite(totalBudget) ? totalBudget : 0}
          </div>
        </div>

        {tasks.map((t, idx) => (
          <div key={idx} className="task-card">
            <div className="task-card-head">
              <h3>Task {idx + 1}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTask(idx)}>
                Remove
              </button>
            </div>

            <div className="task-grid">
              <div className="field">
                <label>Title</label>
                <input
                  value={t.title}
                  onChange={(e) => setTaskField(idx, 'title', e.target.value)}
                  placeholder="e.g., Build SSO login screen"
                />
              </div>

              <div className="field field-wide">
                <label>Description</label>
                <textarea
                  value={t.description}
                  onChange={(e) => setTaskField(idx, 'description', e.target.value)}
                  placeholder="Describe deliverables, acceptance criteria, and constraints..."
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
                <div className="hint">Comma-separated. Will be saved as an array.</div>
              </div>

              <div className="field">
                <label>Allocated Budget</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={t.allocatedBudget}
                  onChange={(e) => setTaskField(idx, 'allocatedBudget', e.target.value)}
                  placeholder="0"
                />
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

              {t.quizEnabled && !(
                copyQuizFromFirst && firstQuizTaskIndex >= 0 && idx !== firstQuizTaskIndex
              ) && (
                <div className="field field-wide" style={{ gridColumn: '1 / -1' }}>
                  <details open style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: '#2b6cb0', fontWeight: 700 }}>
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
                    Using quiz from Task {firstQuizTaskIndex + 1} (shared mode).
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-primary" onClick={addTask}>
          Add Another Task
        </button>
      </div>

      <div className="builder-sticky">
        <div className="builder-sticky-inner">
          <div className="sticky-meta">
            <span className={overBudget ? 'warn' : ''}>
              {overBudget ? 'Over budget — adjust allocations' : 'Ready to publish'}
            </span>
          </div>
          <button
            type="button"
            className={`btn btn-primary ${project?.status !== 'Pending Breakdown' ? 'btn-disabled' : ''}`}
            onClick={handleBulkPublish}
            disabled={saving || (project && project.status !== 'Pending Breakdown')}
          >
            {saving ? 'Publishing...' : (project?.status !== 'Pending Breakdown' ? 'Already Published' : 'Save & Publish to Marketplace')}
          </button>
        </div>
      </div>
    </div>
  );
}

