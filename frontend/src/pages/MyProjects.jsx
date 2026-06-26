import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './MyProjects.css';

export default function MyProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRfps, setExpandedRfps] = useState({});

  const toggleRfp = (id) => {
    setExpandedRfps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    let mounted = true;
    const fetchProjects = async () => {
      try {
        if (user?.role === 'client' || user?.role === 'admin') {
          const [regularRes, enterpriseRes] = await Promise.all([
            api.get('/projects/my'),
            api.get('/enterprise-rfp/my').catch(() => ({ data: { projects: [] } }))
          ]);
          if (!mounted) return;
          const enterpriseData = enterpriseRes.data?.projects || [];
          const microJobProjectIds = new Set();
          enterpriseData.forEach(ep => {
            if (ep.microJobs) {
              ep.microJobs.forEach(mj => {
                if (mj.marketplaceProject) {
                  microJobProjectIds.add(typeof mj.marketplaceProject === 'object' ? mj.marketplaceProject._id : mj.marketplaceProject);
                }
              });
            }
          });

          const regular = (regularRes.data?.projects || [])
            .filter(p => !microJobProjectIds.has(p._id))
            .map(p => ({ ...p, isEnterprise: false }));

          const enterprise = enterpriseData.map(p => ({ ...p, isEnterprise: true, title: p.clientReference || 'Enterprise RFP', budgetType: 'Enterprise', budget: p.overallTotalBudget, description: p.originalRfpText?.substring(0, 100) }));
          
          const combined = [...regular, ...enterprise].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
          setProjects(combined);
        } else {
          const { data } = await api.get('/projects/my');
          if (!mounted) return;
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchProjects();
    return () => { mounted = false; };
  }, [user]);

  const markComplete = async (projectId) => {
    if (!confirm('Mark this project as completed?')) return;
    try {
      await api.patch(`/projects/${projectId}`, { status: 'completed' });
      setProjects((prev) => prev.map((p) => (p._id === projectId ? { ...p, status: 'completed' } : p)));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  if (loading) return <div className="loading-screen">Loading...</div>;

  return (
    <div className="my-projects page-container">
      <div className="page-header">
        <h1>My Projects</h1>
        <p className="muted">
          {(user?.role === 'client' || user?.role === 'admin') ? 'Projects you posted and their status.' : 'Projects you are working on.'}
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          {(user?.role === 'client' || user?.role === 'admin') ? (
            <>
              <p>You haven't posted any projects yet.</p>
              <Link to="/post-project" className="btn btn-primary">Post a project</Link>
            </>
          ) : (
            <>
              <p>You don't have any active projects. Browse and submit proposals.</p>
              <Link to="/projects" className="btn btn-primary">Find work</Link>
            </>
          )}
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <div className={`project-card status-${p.status}`} key={p._id}>
              <div className="card-top">
                <h3>
                  {p.isEnterprise ? (
                    <span style={{ color: 'var(--primary)' }}>🏢 {p.title}</span>
                  ) : (
                    <Link to={`/projects/${p._id}`}>{p.title}</Link>
                  )}
                </h3>
                <span className={`status-badge ${p.status.toLowerCase().replace(' ', '_')}`}>
                  {p.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <p className="card-meta">
                <strong>Type:</strong> {p.budgetType}
                <span className="dot">•</span>
                <strong>Budget:</strong> ₹{p.budget} {p.budgetMax ? `- ₹${p.budgetMax}` : ''}
              </p>
              <p className="card-desc">{p.description?.substring(0, 100)}...</p>
              
              <div className="card-footer">
                {(user?.role === 'client' || user?.role === 'admin') && p.freelancer && (
                  <div className="assigned-to">
                    <span>Hired: {p.freelancer.firstName} {p.freelancer.lastName}</span>
                  </div>
                )}
                {user?.role === 'freelancer' && p.client && (
                  <span>Client: {p.client.firstName} {p.client.lastName}</span>
                )}
                {!p.freelancer && p.status === 'open' && (
                  <div className="open-notice">Accepting Proposals</div>
                )}
              </div>
              
              
              {p.status === 'in_progress' && !p.isEnterprise && (user?.role === 'client' || user?.role === 'admin') && (
                <div className="card-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={() => markComplete(p._id)}>
                    Mark complete
                  </button>
                </div>
              )}

              {p.isEnterprise && p.microJobs && p.microJobs.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <button 
                    onClick={() => toggleRfp(p._id)} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {expandedRfps[p._id] ? '▼ Hide Tasks' : '▶ View Tasks'} ({p.microJobs.length})
                  </button>
                  
                  {expandedRfps[p._id] && (
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {p.microJobs.map((mj) => {
                        const mp = mj.marketplaceProject;
                        if (!mp) return null;
                        return (
                          <div key={mj._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem' }}>
                                <Link to={`/projects/${typeof mp === 'object' ? mp._id : mp}`}>{mj.title}</Link>
                              </h4>
                              <span className={`status-badge ${mj.status.toLowerCase().replace(' ', '_')}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                {mj.status.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Budget: ₹{mj.allocatedBudget}
                            </div>
                            {mj.hiredUser && (
                              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--primary)' }}>
                                ↳ Assigned to: {mj.hiredUser.firstName} {mj.hiredUser.lastName}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
