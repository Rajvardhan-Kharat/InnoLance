import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Proposals.css';

export default function Proposals() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [filter, setFilter] = useState(''); // pending, accepted, rejected
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = filter ? { status: filter } : {};
    api.get('/proposals', { params }).then(({ data }) => {
      setProposals(data.proposals);
      setLoading(false);
    });
  }, [filter]);

  const handleAccept = async (id) => {
    try {
      await api.patch(`/proposals/${id}/accept`);
      setProposals((prev) => prev.map((p) => (p._id === id ? { ...p, status: 'accepted' } : p)));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.patch(`/proposals/${id}/reject`);
      setProposals((prev) => prev.filter((p) => p._id !== id));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  if (loading) return <div className="loading-screen">Loading...</div>;

  return (
    <div className="proposals-page page-container">
      <h1>Proposals</h1>
      <p className="page-sub">
        {user?.role === 'client' ? 'Proposals on your projects.' : 'Proposals you submitted.'}
      </p>
      <div className="proposals-toolbar">
        <button
          type="button"
          className={filter === '' ? 'active' : ''}
          onClick={() => setFilter('')}
        >
          All
        </button>
        <button
          type="button"
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button
          type="button"
          className={filter === 'accepted' ? 'active' : ''}
          onClick={() => setFilter('accepted')}
        >
          Accepted
        </button>
        <button
          type="button"
          className={filter === 'rejected' ? 'active' : ''}
          onClick={() => setFilter('rejected')}
        >
          Rejected
        </button>
      </div>
      {proposals.length === 0 ? (
        <div className="empty-state">No proposals found.</div>
      ) : (
        <div className="proposals-list">
          {proposals.map((prop) => (
            <div key={prop._id} className="proposal-card">
              <div className="proposal-head">
                <Link to={`/projects/${prop.project?._id}`} className="proposal-project">
                  {prop.project?.title}
                </Link>
                <span className={`proposal-status status-${prop.status}`}>{prop.status}</span>
              </div>
              {(user?.role === 'client' || user?.role === 'admin') && (
                <>
                  <Link to={`/profile/${prop.freelancer?._id}`} className="proposal-freelancer">
                    {prop.freelancer?.firstName} {prop.freelancer?.lastName} — {prop.freelancer?.headline}
                  </Link>
                  {prop.aiScore && (
                    <div style={{ margin: '8px 0', fontSize: '0.9em', color: '#2b6cb0', fontWeight: '500' }}>
                      🤖 AI Fit Score: {prop.aiScore}/100
                    </div>
                  )}
                </>
              )}
              <p className="proposal-cover">{prop.coverLetter?.slice(0, 200)}...</p>
              <div className="proposal-actions">
                <span className="bid">₹{prop.bidAmount}</span>
                {(user?.role === 'client' || user?.role === 'admin') && prop.status === 'pending' && (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAccept(prop._id)}>
                      Accept
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleReject(prop._id)}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
