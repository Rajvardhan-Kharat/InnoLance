import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [cmsPages, setCmsPages] = useState([]);
  const [enterpriseProjects, setEnterpriseProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cmsForm, setCmsForm] = useState({ slug: '', title: '', content: '', published: false });
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    const onNewRfp = (newProject) => {
      setEnterpriseProjects((prev) => [newProject, ...prev]);
    };
    socket.on('enterprise_rfp_new', onNewRfp);
    return () => socket.off('enterprise_rfp_new', onNewRfp);
  }, [socket]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }
    api.get('/admin/dashboard').then(({ data }) => {
      setStats(data.stats);
      setRecentProjects(data.recentProjects || []);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'admin' || activeTab !== 'users') return;
    api.get('/admin/users').then(({ data }) => setUsers(data.users || [])).catch(() => {});
  }, [user, activeTab]);

  useEffect(() => {
    if (user?.role !== 'admin' || activeTab !== 'cms') return;
    api.get('/admin/cms/pages').then(({ data }) => setCmsPages(data.pages || [])).catch(() => {});
  }, [user, activeTab]);

  useEffect(() => {
    if (user?.role !== 'admin' || activeTab !== 'enterprise') return;
    api.get('/admin/enterprise-projects?limit=50').then(({ data }) => {
      setEnterpriseProjects(data.projects || []);
    }).catch(() => {});
  }, [user, activeTab]);

  const handleCreatePage = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/cms/pages', cmsForm);
      setCmsForm({ slug: '', title: '', content: '', published: false });
      api.get('/admin/cms/pages').then(({ data }) => setCmsPages(data.pages || []));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleTogglePublish = async (slug, published) => {
    try {
      await api.patch(`/admin/cms/pages/${slug}`, { published });
      setCmsPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, published } : p)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleDeleteEnterprise = async (id) => {
    if (!window.confirm('Are you sure you want to delete this Enterprise RFP?')) return;
    try {
      await api.delete(`/admin/enterprise-projects/${id}`);
      setEnterpriseProjects((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <div className="admin-tabs">
        <button type="button" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button type="button" className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>Users</button>
        <button type="button" className={activeTab === 'enterprise' ? 'active' : ''} onClick={() => setActiveTab('enterprise')}>Enterprise RFP</button>
        <button type="button" className={activeTab === 'cms' ? 'active' : ''} onClick={() => setActiveTab('cms')}>CMS</button>
      </div>
      {activeTab === 'dashboard' && stats && (
        <div className="admin-content">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.userCount}</span>
              <span className="stat-label">Users</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.projectCount}</span>
              <span className="stat-label">Projects</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.proposalCount}</span>
              <span className="stat-label">Proposals</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.paymentCount}</span>
              <span className="stat-label">Payments</span>
            </div>
          </div>
          <section>
            <h2>Recent projects</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Client</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProjects.map((p) => (
                    <tr key={p._id}>
                      <td><a href={`/projects/${p._id}`}>{p.title}</a></td>
                      <td>{p.client?.firstName} {p.client?.lastName}</td>
                      <td><span className={`status status-${p.status?.replace('_', '-')}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {activeTab === 'users' && (
        <div className="admin-content">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.firstName} {u.lastName}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'cms' && (
        <div className="admin-content">
          <form onSubmit={handleCreatePage} className="cms-form">
            <h3>Create page</h3>
            <input
              placeholder="Slug (e.g. about)"
              value={cmsForm.slug}
              onChange={(e) => setCmsForm({ ...cmsForm, slug: e.target.value })}
              required
            />
            <input
              placeholder="Title"
              value={cmsForm.title}
              onChange={(e) => setCmsForm({ ...cmsForm, title: e.target.value })}
              required
            />
            <textarea
              placeholder="Content (markdown supported)"
              value={cmsForm.content}
              onChange={(e) => setCmsForm({ ...cmsForm, content: e.target.value })}
              rows={4}
            />
            <label>
              <input type="checkbox" checked={cmsForm.published} onChange={(e) => setCmsForm({ ...cmsForm, published: e.target.checked })} />
              Published
            </label>
            <button type="submit" className="btn btn-primary">Create</button>
          </form>
          <div className="cms-pages-list">
            <h3>Pages</h3>
            {cmsPages.map((p) => (
              <div key={p._id} className="cms-page-item">
                <span className="slug">/{p.slug}</span>
                <span>{p.title}</span>
                <span className={p.published ? 'published' : 'draft'}>{p.published ? 'Published' : 'Draft'}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleTogglePublish(p.slug, !p.published)}>
                  {p.published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {activeTab === 'enterprise' && (
        <div className="admin-content">
          <section>
            <h2>Enterprise Projects</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Client Reference</th>
                    <th>Status</th>
                    <th>Total Budget</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enterpriseProjects.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--text-muted)' }}>No enterprise RFPs yet.</td>
                    </tr>
                  ) : enterpriseProjects.map((ep) => (
                    <tr key={ep._id}>
                      <td>{ep.clientReference}</td>
                      <td>{ep.status}</td>
                      <td>{Number(ep.overallTotalBudget || 0)}</td>
                      <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Link className="btn btn-ghost btn-sm" to={`/admin/project-builder/${ep._id}`}>
                          Builder
                        </Link>
                        <Link className="btn btn-ghost btn-sm" to={`/admin/assembly/${ep._id}`}>
                          Assembly
                        </Link>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteEnterprise(ep._id)} style={{ padding: '0.25rem 0.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
