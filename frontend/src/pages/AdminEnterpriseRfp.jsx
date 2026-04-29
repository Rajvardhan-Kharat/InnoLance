import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import './AdminEnterpriseRfp.css';

const STATUS_COLORS = {
  RFP_Submitted: { bg: 'rgba(99,102,241,0.12)', color: '#6366f1', label: 'RFP Submitted' },
  'Pending Breakdown': { bg: 'rgba(234,179,8,0.12)', color: '#ca8a04', label: 'Pending Breakdown' },
  'In Progress': { bg: 'rgba(59,130,246,0.12)', color: '#2563eb', label: 'In Progress' },
  Assembling: { bg: 'rgba(249,115,22,0.12)', color: '#ea580c', label: 'Assembling' },
  Completed: { bg: 'rgba(22,163,74,0.12)', color: '#16a34a', label: 'Completed' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: 'rgba(0,0,0,0.05)', color: '#666', label: status };
  return (
    <span
      style={{
        padding: '4px 11px',
        borderRadius: 20,
        fontSize: '0.78rem',
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const styles = {
    direct:    { bg: 'rgba(99,102,241,0.1)',  color: '#6366f1', label: '🖥 Direct Submit' },
    idea:      { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7', label: '💡 From Idea'     },
    email:     { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', label: '📧 Email Intake'  },
  };
  const s = styles[type] || styles.email;
  return (
    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: '0.74rem', fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function AdminEnterpriseRfp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [stats, setStats] = useState({ total: 0, submitted: 0, inProgress: 0, completed: 0 });

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/'); return; }
    fetchProjects();
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const onNewRfp = (newProject) => {
      setProjects((prev) => [newProject, ...prev]);
      setStats((s) => ({ ...s, total: s.total + 1, submitted: s.submitted + 1 }));
    };
    socket.on('enterprise_rfp_new', onNewRfp);
    return () => socket.off('enterprise_rfp_new', onNewRfp);
  }, [socket]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/enterprise-projects?limit=100');
      const list = data.projects || [];
      setProjects(list);
      setStats({
        total: list.length,
        submitted: list.filter((p) => p.status === 'RFP_Submitted' || p.status === 'Pending Breakdown').length,
        inProgress: list.filter((p) => p.status === 'In Progress' || p.status === 'Assembling').length,
        completed: list.filter((p) => p.status === 'Completed').length,
      });
    } catch (_) {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/admin/enterprise-projects/${id}`);
      setProjects((prev) => prev.filter((p) => p._id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const filtered = projects.filter((p) => {
    const matchSearch = !search || (p.clientReference || '').toLowerCase().includes(search.toLowerCase())
      || (p.clientUser?.firstName || '').toLowerCase().includes(search.toLowerCase())
      || (p.clientUser?.email || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="ent-rfp-page">
      {/* ── Header ── */}
      <div className="ent-rfp-header">
        <div>
          <h1>Enterprise RFP Dashboard</h1>
          <p>Manage incoming Enterprise Requests for Proposal from clients</p>
        </div>
        <Link to="/admin" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>← Admin Panel</Link>
      </div>

      {/* ── Stats ── */}
      <div className="ent-rfp-stats">
        <div className="ent-stat-card">
          <span className="ent-stat-value">{stats.total}</span>
          <span className="ent-stat-label">Total RFPs</span>
        </div>
        <div className="ent-stat-card submitted">
          <span className="ent-stat-value">{stats.submitted}</span>
          <span className="ent-stat-label">Awaiting Review</span>
        </div>
        <div className="ent-stat-card in-progress">
          <span className="ent-stat-value">{stats.inProgress}</span>
          <span className="ent-stat-label">In Progress</span>
        </div>
        <div className="ent-stat-card completed">
          <span className="ent-stat-value">{stats.completed}</span>
          <span className="ent-stat-label">Completed</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="ent-rfp-filters">
        <div className="ent-search-wrap">
          <span className="ent-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by reference, client name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ent-search-input"
            id="rfp-search"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ent-status-filter"
          id="rfp-status-filter"
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => (
            <option key={s} value={s}>{STATUS_COLORS[s].label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost" onClick={fetchProjects}>↻ Refresh</button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="ent-rfp-loading">
          <div className="ent-spinner" />
          <p>Loading enterprise RFPs...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ent-rfp-empty">
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
          <h3>{search || statusFilter ? 'No RFPs match your filters' : 'No Enterprise RFPs yet'}</h3>
          <p>When clients submit Enterprise RFPs, they'll appear here in real-time.</p>
        </div>
      ) : (
        <div className="ent-rfp-table-wrap">
          <table className="ent-rfp-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ep) => (
                <>
                  <tr
                    key={ep._id}
                    className={`ent-rfp-row ${expandedId === ep._id ? 'expanded' : ''}`}
                    onClick={() => setExpandedId(expandedId === ep._id ? null : ep._id)}
                  >
                    <td>
                      <div className="ent-client-cell">
                        <div className="ent-client-avatar">
                          {(ep.clientUser?.firstName || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="ent-client-name">
                            {ep.clientUser ? `${ep.clientUser.firstName} ${ep.clientUser.lastName}` : 'External Client'}
                          </div>
                          <div className="ent-client-email">{ep.clientUser?.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="ent-ref">{ep.clientReference || '—'}</code>
                    </td>
                    <td><TypeBadge type={ep.submissionType} /></td>
                    <td>
                      {ep.budgetRange
                        ? <span style={{ fontWeight: 600, color: '#16a34a' }}>{ep.budgetRange}</span>
                        : ep.overallTotalBudget > 0
                          ? <span style={{ fontWeight: 600, color: '#16a34a' }}>₹{Number(ep.overallTotalBudget).toLocaleString('en-IN')}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>TBD</span>
                      }
                    </td>
                    <td><StatusBadge status={ep.status} /></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {new Date(ep.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="ent-actions">
                        <Link
                          className="btn btn-ghost btn-sm ent-action-btn"
                          to={`/admin/project-builder/${ep._id}`}
                          title="Open in Project Builder"
                        >
                          🔨 Builder
                        </Link>
                        <Link
                          className="btn btn-ghost btn-sm ent-action-btn"
                          to={`/admin/assembly/${ep._id}`}
                          title="Open Assembly Dashboard"
                        >
                          ⚙️ Assembly
                        </Link>
                        {deleteConfirm === ep._id ? (
                          <>
                            <button type="button" className="ent-btn-confirm-delete" onClick={() => handleDelete(ep._id)}>Confirm</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" className="ent-btn-delete" onClick={() => setDeleteConfirm(ep._id)} title="Delete RFP">🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded detail row */}
                  {expandedId === ep._id && (
                    <tr key={`${ep._id}-detail`} className="ent-detail-row">
                      <td colSpan={7}>
                        <div className="ent-detail-content">
                          <div className="ent-detail-grid">
                            {ep.originalRfpText && (
                              <div className="ent-detail-section">
                                <h4>📄 RFP / PRD Content</h4>
                                <pre className="ent-rfp-text">{ep.originalRfpText.slice(0, 1500)}{ep.originalRfpText.length > 1500 ? '\n\n...(truncated)' : ''}</pre>
                              </div>
                            )}
                            <div className="ent-detail-meta">
                              <h4>ℹ️ Details</h4>
                              <table className="ent-meta-table">
                                <tbody>
                                  <tr><td>Project ID</td><td><code>{ep._id}</code></td></tr>
                                  <tr><td>Submission Type</td><td><TypeBadge type={ep.submissionType} /></td></tr>
                                  {ep.budgetRange && <tr><td>Budget Range</td><td><strong>{ep.budgetRange}</strong></td></tr>}
                                  {ep.startDate && <tr><td>Start Date</td><td>{new Date(ep.startDate).toLocaleDateString('en-IN')}</td></tr>}
                                  {ep.finalDeadline && <tr><td>Final Deadline</td><td>{new Date(ep.finalDeadline).toLocaleDateString('en-IN')}</td></tr>}
                                  {ep.originalRfpDocumentUrl && (
                                    <tr>
                                      <td>Document</td>
                                      <td>
                                        <a href={ep.originalRfpDocumentUrl} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
                                          📎 View Uploaded File
                                        </a>
                                      </td>
                                    </tr>
                                  )}
                                  <tr><td>MicroJobs</td><td>{ep.microJobs?.length || 0} created</td></tr>
                                  <tr><td>Created At</td><td>{new Date(ep.createdAt).toLocaleString('en-IN')}</td></tr>
                                </tbody>
                              </table>
                              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <Link className="btn btn-primary" to={`/admin/project-builder/${ep._id}`}>
                                  🔨 Open in Builder
                                </Link>
                                <Link className="btn btn-ghost" to={`/admin/assembly/${ep._id}`}>
                                  ⚙️ Assembly Dashboard
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
