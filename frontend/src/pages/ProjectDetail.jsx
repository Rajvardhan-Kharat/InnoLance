import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StripePaymentModal from '../components/StripePaymentModal';
import './ProjectDetail.css';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [proposalCount, setProposalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [showProposals, setShowProposals] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proposalForm, setProposalForm] = useState({ coverLetter: '', bidAmount: '', estimatedDays: '', resumeFile: null });
  const [milestones, setMilestones] = useState([]);
  const [milestoneForm, setMilestoneForm] = useState({ title: '', amount: '', description: '', dueDate: '' });
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [suggestedFreelancers, setSuggestedFreelancers] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeForm, setTimeForm] = useState({ minutes: '', description: '' });
  const [payModal, setPayModal] = useState({ open: false, milestoneId: null, amount: 0 });
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data.project);
      setProposalCount(data.proposalCount || 0);
      setLoading(false);
    };
    fetchProject();
  }, [id]);

  useEffect(() => {
    if (!user || (user.role !== 'client' && user.role !== 'admin') || !project) return;
    const fetchProposals = async () => {
      const { data } = await api.get('/proposals', { params: { projectId: id } });
      setProposals(data.proposals);
    };
    fetchProposals();
  }, [user, project, id]);

  useEffect(() => {
    if (!user || !project || project.status !== 'in_progress' || project.budgetType !== 'fixed') return;
    api.get(`/milestones/project/${id}`).then(({ data }) => setMilestones(data.milestones)).catch(() => setMilestones([]));
  }, [user, project, id]);

  useEffect(() => {
    if (!user || (user.role !== 'client' && user.role !== 'admin') || !project || project.status !== 'open') return;
    api.get(`/recommendations/freelancers/${id}`).then(({ data }) => setSuggestedFreelancers(data.freelancers || [])).catch(() => setSuggestedFreelancers([]));
  }, [user, project, id]);

  useEffect(() => {
    if (!project || project.budgetType !== 'hourly' || project.status !== 'in_progress') return;
    api.get('/time-entries', { params: { projectId: id } }).then(({ data }) => setTimeEntries(data.entries || [])).catch(() => setTimeEntries([]));
  }, [project, id]);

  useEffect(() => {
    if (!project || project.status !== 'completed') return;
    api.get('/reviews', { params: { projectId: id } }).then(({ data }) => setReviews(data.reviews || [])).catch(() => setReviews([]));
  }, [project, id]);

  const handleAddMilestone = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/milestones/project/${id}`, {
        title: milestoneForm.title,
        amount: Number(milestoneForm.amount),
        description: milestoneForm.description || undefined,
        dueDate: milestoneForm.dueDate || undefined,
      });
      setMilestones((prev) => [...prev, data.milestone].sort((a, b) => a.order - b.order));
      setMilestoneForm({ title: '', amount: '', description: '', dueDate: '' });
      setAddingMilestone(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleMilestoneStatus = async (milestoneId, status) => {
    try {
      const { data } = await api.patch(`/milestones/${milestoneId}/status`, { status });
      setMilestones((prev) => prev.map((m) => (m._id === milestoneId ? data.milestone : m)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleLogTime = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/time-entries', {
        project: id,
        minutes: Number(timeForm.minutes),
        description: timeForm.description || undefined,
      });
      setTimeEntries((prev) => [data.entry, ...prev]);
      setTimeForm({ minutes: '', description: '' });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleApproveTime = async (entryId) => {
    try {
      await api.patch(`/time-entries/${entryId}/approve`);
      setTimeEntries((prev) => prev.map((e) => (e._id === entryId ? { ...e, status: 'approved' } : e)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleMarkPaid = async (entryId) => {
    try {
      await api.patch(`/time-entries/${entryId}/mark-paid`);
      setTimeEntries((prev) => prev.map((e) => (e._id === entryId ? { ...e, status: 'paid' } : e)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!project || !user) return;
    const isClient = (user.role === 'client' || user.role === 'admin') && project.client._id === user._id;
    const isFreelancer = user && project.freelancer?._id === user._id;
    const reviewee = isClient ? project.freelancer?._id : project.client?._id;
    if (!reviewee) return;
    setSubmittingReview(true);
    try {
      await api.post('/reviews', {
        project: id,
        reviewee,
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment,
      });
      const { data } = await api.get('/reviews', { params: { projectId: id } });
      setReviews(data.reviews || []);
      setReviewForm({ rating: 5, comment: '' });
      alert('Review submitted.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handlePayMilestone = (milestoneId, amount) => {
    setPayModal({ open: true, milestoneId, amount });
  };

  const handleAcceptProposal = async (proposalId) => {
    try {
      await api.patch(`/proposals/${proposalId}/accept`);
      setProject((p) => ({ ...p, status: 'in_progress', freelancer: proposals.find((x) => x._id === proposalId)?.freelancer }));
      setProposals((prev) => prev.filter((p) => p._id !== proposalId));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'freelancer') {
      alert('Only freelancers can submit proposals.');
      return;
    }
    setSubmitting(true);
    try {
      const hasResume = !!proposalForm.resumeFile;
      if (hasResume) {
        const fd = new FormData();
        fd.append('project', id);
        fd.append('coverLetter', proposalForm.coverLetter);
        fd.append('bidAmount', String(Number(proposalForm.bidAmount)));
        if (proposalForm.estimatedDays) fd.append('estimatedDays', String(Number(proposalForm.estimatedDays)));
        fd.append('resume', proposalForm.resumeFile);
        await api.post('/proposals', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/proposals', {
          project: id,
          coverLetter: proposalForm.coverLetter,
          bidAmount: Number(proposalForm.bidAmount),
          estimatedDays: proposalForm.estimatedDays ? Number(proposalForm.estimatedDays) : undefined,
        });
      }
      setProposalForm({ coverLetter: '', bidAmount: '', estimatedDays: '', resumeFile: null });
      setProposalCount((c) => c + 1);
      alert('Proposal submitted successfully.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !project) return <div className="loading-screen">Loading...</div>;

  const isClient = (user?.role === 'client' || user?.role === 'admin') && project.client._id === user?._id;
  const isFreelancer = user && project.freelancer?._id === user._id;
  const canReview = project.status === 'completed' && (isClient || isFreelancer);
  const alreadyReviewed = canReview && reviews.some((r) => r.reviewer?._id === user?._id);

  return (
    <div className="project-detail">
      <div className="project-header">
        <h1>{project.title}</h1>
        <div className="project-header-meta">
          <span className="category">{project.category}</span>
          <span className="budget">
            {project.budgetType === 'fixed' ? `₹${project.budget}` : `₹${project.budget} - ₹${project.budgetMax || project.budget}/hr`}
          </span>
          <span className={`status status-${(project.status || '').replace('_', '-')}`}>{project.status}</span>
        </div>
      </div>
      <div className="project-body">
        <div className="project-main">
          <section>
            <h2>Description</h2>
            <p>{project.description}</p>
          </section>
          {project.skills?.length > 0 && (
            <section>
              <h2>Skills</h2>
              <div className="skill-tags">
                {project.skills.map((s) => (
                  <span key={s} className="skill-tag">{s}</span>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2>Client</h2>
            <div className="client-info">
              <span className="avatar">{project.client.firstName?.[0]}{project.client.lastName?.[0]}</span>
              <div>
                <Link to={`/profile/${project.client._id}`}>
                  {project.client.firstName} {project.client.lastName}
                </Link>
                {project.client.companyName && <span className="company"> — {project.client.companyName}</span>}
                {user && (isFreelancer || isClient) && (
                  <span className="msg-link">
                    {' '}
                    <Link to="/messages">Message</Link>
                  </span>
                )}
              </div>
            </div>
          </section>
          {project.freelancer && (
            <section>
              <h2>Freelancer</h2>
              <div className="client-info">
                <span className="avatar">{project.freelancer.firstName?.[0]}{project.freelancer.lastName?.[0]}</span>
                <Link to={`/profile/${project.freelancer._id}`}>
                  {project.freelancer.firstName} {project.freelancer.lastName} — {project.freelancer.headline}
                </Link>
              </div>
            </section>
          )}
          {project.status === 'in_progress' && project.budgetType === 'fixed' && (isClient || isFreelancer) && (
            <section>
              <h2>Milestones</h2>
              {milestones.length === 0 && !addingMilestone && (
                <p className="text-muted">No milestones yet. {isClient && 'Add one below.'}</p>
              )}
              {milestones.map((m) => (
                <div key={m._id} className="milestone-item">
                  <div className="milestone-head">
                    <strong>{m.title}</strong>
                    <span className="milestone-amount">₹{m.amount}</span>
                    <span className={`milestone-status status-${m.status?.replace('_', '-')}`}>{m.status}</span>
                  </div>
                  {m.description && <p className="milestone-desc">{m.description}</p>}
                  {(isFreelancer || isClient) && (
                    <div className="milestone-actions">
                      {isFreelancer && m.status === 'pending' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleMilestoneStatus(m._id, 'in_review')}>
                          Submit for review
                        </button>
                      )}
                      {isClient && m.status === 'in_review' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handlePayMilestone(m._id, m.amount)}>
                          Pay ₹{m.amount}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isClient && (
                <>
                  {!addingMilestone ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingMilestone(true)}>
                      + Add milestone
                    </button>
                  ) : (
                    <form onSubmit={handleAddMilestone} className="milestone-form">
                      <input
                        placeholder="Title"
                        value={milestoneForm.title}
                        onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
                        required
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Amount (₹)"
                        value={milestoneForm.amount}
                        onChange={(e) => setMilestoneForm({ ...milestoneForm, amount: e.target.value })}
                        required
                      />
                      <textarea
                        placeholder="Description (optional)"
                        value={milestoneForm.description}
                        onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                        rows={2}
                      />
                      <input
                        type="date"
                        placeholder="Due date"
                        value={milestoneForm.dueDate}
                        onChange={(e) => setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })}
                      />
                      <div>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingMilestone(false); setMilestoneForm({ title: '', amount: '', description: '', dueDate: '' }); }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </section>
          )}
          {project.status === 'in_progress' && project.budgetType === 'hourly' && (isClient || isFreelancer) && (
            <section>
              <h2>Time entries</h2>
              {(project.weeklyMinMinutes || project.weeklyMaxMinutes) && (
                <p className="text-muted">
                  Weekly limit: {project.weeklyMinMinutes ? `${Math.round(project.weeklyMinMinutes / 60)}h min` : '—'}
                  {' '} / {project.weeklyMaxMinutes ? `${Math.round(project.weeklyMaxMinutes / 60)}h max` : '—'}
                </p>
              )}
              {isFreelancer && (
                <form onSubmit={handleLogTime} className="time-entry-form">
                  <input
                    type="number"
                    min="15"
                    step="15"
                    placeholder="Minutes"
                    value={timeForm.minutes}
                    onChange={(e) => setTimeForm({ ...timeForm, minutes: e.target.value })}
                    required
                  />
                  <input
                    placeholder="Description (optional)"
                    value={timeForm.description}
                    onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  />
                  <button type="submit" className="btn btn-primary btn-sm">Log time</button>
                </form>
              )}
              {timeEntries.length === 0 ? (
                <p className="text-muted">No time entries yet.</p>
              ) : (
                <div className="time-entries-list">
                  {timeEntries.map((e) => (
                    <div key={e._id} className="time-entry-item">
                      <span>{e.minutes} min</span>
                      <span>₹{e.amount?.toFixed(2)}</span>
                      <span className={`status status-${e.status}`}>{e.status}</span>
                      {e.description && <span className="desc">{e.description}</span>}
                      {isClient && e.status === 'pending' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleApproveTime(e._id)}>Approve</button>
                      )}
                      {isClient && e.status === 'approved' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleMarkPaid(e._id)}>Mark paid</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {project.status === 'completed' && canReview && (
            <section>
              <h2>Reviews</h2>
              {reviews.length > 0 && (
                <div className="reviews-list">
                  {reviews.map((r) => (
                    <div key={r._id} className="review-item">
                      <strong>{r.reviewer?.firstName} {r.reviewer?.lastName}</strong>
                      <span className="text-muted"> — {r.rating}/5</span>
                      {r.comment && <p className="text-muted">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
              {!alreadyReviewed && (
                <form onSubmit={handleSubmitReview} className="review-form">
                  <label>Rating</label>
                  <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}>
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Good</option>
                    <option value={3}>3 - Okay</option>
                    <option value={2}>2 - Poor</option>
                    <option value={1}>1 - Bad</option>
                  </select>
                  <label>Comment (optional)</label>
                  <textarea
                    rows={3}
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder="Share feedback about the work/communication..."
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={submittingReview}>
                    {submittingReview ? 'Submitting...' : 'Submit review'}
                  </button>
                </form>
              )}
              {alreadyReviewed && <p className="text-muted">You already reviewed this project.</p>}
            </section>
          )}
        </div>
        <aside className="project-sidebar">
          {isClient && project.status === 'open' && (
            <div className="sidebar-card">
              <button type="button" className="btn btn-primary btn-block" onClick={() => setShowProposals(!showProposals)}>
                {showProposals ? 'Hide' : 'View'} proposals ({proposalCount})
              </button>
            </div>
          )}
          {isClient && project.status === 'open' && suggestedFreelancers.length > 0 && (
            <div className="sidebar-card">
              <h3>Suggested freelancers</h3>
              {suggestedFreelancers.slice(0, 3).map((f) => (
                <Link key={f._id} to={`/profile/${f._id}`} className="suggested-freelancer">
                  <span className="avatar small">{f.firstName?.[0]}{f.lastName?.[0]}</span>
                  <div>
                    <strong>{f.firstName} {f.lastName}</strong>
                    <span className="headline">{f.headline}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {user?.role === 'freelancer' && project.status === 'open' && (
            <div className="sidebar-card">
              <h3>Submit a proposal</h3>
              <form onSubmit={handleSubmitProposal}>
                <label>Cover letter</label>
                <textarea
                  value={proposalForm.coverLetter}
                  onChange={(e) => setProposalForm({ ...proposalForm, coverLetter: e.target.value })}
                  placeholder="Why are you a good fit?"
                  rows={4}
                  required
                />
                <label>Your bid (₹)</label>
                <input
                  type="number"
                  min="1"
                  value={proposalForm.bidAmount}
                  onChange={(e) => setProposalForm({ ...proposalForm, bidAmount: e.target.value })}
                  required
                />
                <label>Estimated days (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={proposalForm.estimatedDays}
                  onChange={(e) => setProposalForm({ ...proposalForm, estimatedDays: e.target.value })}
                />
                <label>Resume (optional)</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setProposalForm({ ...proposalForm, resumeFile: e.target.files?.[0] || null })}
                />
                <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit proposal'}
                </button>
              </form>
            </div>
          )}
          {!user && (
            <div className="sidebar-card">
              <p>Log in to submit a proposal.</p>
              <Link to="/login" className="btn btn-primary btn-block">Log in</Link>
            </div>
          )}
        </aside>
      </div>
      {showProposals && proposals.length > 0 && (
        <section className="proposals-list">
          <h2>Proposals</h2>
          {proposals.map((prop) => (
            <div key={prop._id} className="proposal-item">
              <div className="proposal-freelancer">
                <Link to={`/profile/${prop.freelancer._id}`}>
                  {prop.freelancer.firstName} {prop.freelancer.lastName}
                </Link>
                <span className="headline">{prop.freelancer.headline}</span>
              </div>
              <p className="cover-letter">{prop.coverLetter}</p>
              <div className="proposal-meta">
                <strong>₹{prop.bidAmount}</strong>
                {prop.estimatedDays && <span>{prop.estimatedDays} days</span>}
                {prop.resume?.url && (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`http://localhost:5003${prop.resume.url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download resume
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAcceptProposal(prop._id)}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      <StripePaymentModal
        open={payModal.open}
        milestoneId={payModal.milestoneId}
        amount={payModal.amount}
        onPaid={() => {
          setMilestones((prev) => prev.map((m) => (m._id === payModal.milestoneId ? { ...m, status: 'released' } : m)));
        }}
        onClose={() => setPayModal({ open: false, milestoneId: null, amount: 0 })}
      />
    </div>
  );
}
