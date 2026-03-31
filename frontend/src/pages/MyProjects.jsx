import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './MyProjects.css';

export default function MyProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects/my').then(({ data }) => {
      setProjects(data.projects);
      setLoading(false);
    });
  }, []);

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
                <h3><Link to={`/projects/${p._id}`}>{p.title}</Link></h3>
                <span className={`status-badge ${p.status}`}>
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
              
              {p.status === 'in_progress' && (user?.role === 'client' || user?.role === 'admin') && (
                <div className="card-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={() => markComplete(p._id)}>
                    Mark complete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
