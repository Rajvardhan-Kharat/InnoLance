import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api';
import './AdminAssemblyDashboard.css';

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function pct(approved, total) {
  if (!total) return 0;
  return Math.round((approved / total) * 100);
}

export default function AdminAssemblyDashboard() {
  const { projectId } = useParams();

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');
  const [project, setProject] = useState(null);

  const microJobs = useMemo(() => safeArray(project?.microJobs), [project]);

  const stats = useMemo(() => {
    const total = microJobs.length;
    const approved = microJobs.filter((j) => j?.status === 'Approved').length;
    const submitted = microJobs.filter((j) => j?.status === 'Submitted').length;
    return {
      total,
      approved,
      submitted,
      percent: pct(approved, total),
    };
  }, [microJobs]);

  const fetchProject = () => {
    setLoading(true);
    setError('');

    api.get(`/admin/enterprise-projects/${projectId}`)
      .then(({ data }) => {
        setProject(data.project || data.enterpriseProject || data);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load enterprise project (endpoint may be missing).');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const approveJob = async (jobId) => {
    setUpdatingId(jobId);
    setError('');
    try {
      await api.patch(`/admin/microjobs/${jobId}/status`, { status: 'Approved' });

      // Optimistic UI update
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.microJobs = safeArray(prev.microJobs).map((j) => (j?._id === jobId ? { ...j, status: 'Approved' } : j));
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status (endpoint may be missing).');
    } finally {
      setUpdatingId('');
    }
  };

  const markComplete = async () => {
    if (!window.confirm('Are you sure you want to finalize this project as Completed?')) return;
    setUpdatingId('complete-btn');
    setError('');
    try {
      await api.patch(`/admin/enterprise-projects/${projectId}/complete`);
      setProject((prev) => ({ ...prev, status: 'Completed' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete project.');
    } finally {
      setUpdatingId('');
    }
  };

  if (loading) {
    return (
      <div className="admin-assembly">
        <h1>Assembly Dashboard</h1>
        <div className="assembly-card">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-assembly">
      <div className="assembly-head">
        <div>
          <h1>Assembly Dashboard</h1>
          <div className="assembly-subtitle">
            {project?.clientReference ? (
              <span><strong>Client Ref:</strong> {project.clientReference}</span>
            ) : (
              <span className="muted">Client Ref: (missing)</span>
            )}
            <span className="dot">•</span>
            <span><strong>Status:</strong> {project?.status || '—'}</span>
            <span className="dot">•</span>
            <span><strong>Total Budget:</strong> {Number(project?.overallTotalBudget || 0)}</span>
          </div>
        </div>

        <Link className="btn btn-ghost" to={`/admin/project-builder/${projectId}`}>
          Open Project Builder
        </Link>
        {project?.status === 'Assembling' && (
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={markComplete}
            disabled={updatingId === 'complete-btn'}
          >
            {updatingId === 'complete-btn' ? 'Finalizing...' : 'Mark Integrated & Complete'}
          </button>
        )}
      </div>

      {error && <div className="assembly-error">{error}</div>}

      <div className="assembly-card">
        <div className="progress-top">
          <div className="progress-meta">
            <div className="progress-title">Overall progress</div>
            <div className="progress-count">
              {stats.approved} out of {stats.total} tasks Approved ({stats.percent}%)
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fetchProject}>
            Refresh
          </button>
        </div>

        <div className="progress-bar" role="progressbar" aria-valuenow={stats.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
        </div>

        {stats.submitted > 0 && (
          <div className="progress-hint">
            {stats.submitted} task{stats.submitted === 1 ? '' : 's'} awaiting review (Submitted).
          </div>
        )}
      </div>

      <div className="assembly-card">
        <h2>MicroJobs</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Hired Freelancer</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {microJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">No micro-jobs linked yet.</td>
                </tr>
              ) : (
                microJobs.map((j) => {
                  const hired = j?.hiredUser;
                  const hiredLabel = hired
                    ? `${hired.firstName || ''} ${hired.lastName || ''}`.trim() || hired.email || 'Assigned'
                    : 'Unassigned';

                  const canApprove = j?.status === 'Submitted';

                  return (
                    <tr key={j._id}>
                      <td className="title-col">{j.title || '—'}</td>
                      <td>{Number(j.allocatedBudget || 0)}</td>
                      <td>
                        <span className={`status-pill status-${String(j.status || '').toLowerCase()}`}>
                          {j.status || '—'}
                        </span>
                      </td>
                      <td>
                        <div className="freelancer-cell">
                          <div className="freelancer-name">{hiredLabel}</div>
                          {hired?.email && <div className="freelancer-email">{hired.email}</div>}
                        </div>
                      </td>
                      <td>
                        {canApprove ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={updatingId === j._id}
                            onClick={() => approveJob(j._id)}
                          >
                            {updatingId === j._id ? 'Approving...' : 'Approve'}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

