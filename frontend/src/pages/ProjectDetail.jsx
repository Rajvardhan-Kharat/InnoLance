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

  const [myAssessment, setMyAssessment] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  const [assessmentResults, setAssessmentResults] = useState(null);
  const [assessmentResultsOpen, setAssessmentResultsOpen] = useState(false);
  const [assessmentResultsLoading, setAssessmentResultsLoading] = useState(false);

  const [escrowSubmit, setEscrowSubmit] = useState({ text: '', links: '' });
  const [escrowActionBusy, setEscrowActionBusy] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');

  const formatMs = (ms) => {
    if (ms === null || ms === undefined) return '--:--';
    if (!Number.isFinite(ms)) return '--:--';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

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
    if (!user || user.role !== 'freelancer' || !project || !project.assessmentEnabled) return;
    setAssessmentLoading(true);
    const run = async () => {
      try {
        const { data } = await api.get(`/project-assessments/project/${id}/me`);
        setMyAssessment(data);
      } catch {
        setMyAssessment(null);
      } finally {
        setAssessmentLoading(false);
      }
    };
    run();
  }, [user, project, id]);

  // Re-fetch assessment status when a freelancer submits a quiz from /assessment page.
  useEffect(() => {
    if (!user || user.role !== 'freelancer') return;

    const handler = (e) => {
      const projectId = e?.detail?.projectId;
      if (String(projectId) !== String(id)) return;
      if (!project?.assessmentEnabled) return;

      setAssessmentLoading(true);
      api.get(`/project-assessments/project/${id}/me`)
        .then(({ data }) => setMyAssessment(data))
        .catch(() => setMyAssessment(null))
        .finally(() => setAssessmentLoading(false));
    };

    window.addEventListener('assessment:updated', handler);
    return () => window.removeEventListener('assessment:updated', handler);
  }, [user, project, id]);

  useEffect(() => {
    if (!user || (user.role !== 'client' && user.role !== 'admin') || !project) return;
    if (!['open', 'in_progress', 'in_review'].includes(project.status)) return;
    const fetchProposals = async () => {
      const { data } = await api.get('/proposals', { params: { projectId: id } });
      setProposals(data.proposals || []);
    };
    fetchProposals();
  }, [user, project, id]);

  useEffect(() => {
    if (!user || !project || project.budgetType !== 'fixed') return;
    if (!['in_progress', 'in_review'].includes(project.status)) return;
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
      const { data } = await api.get(`/projects/${id}`);
      setProject(data.project);
      setProposals((prev) => prev.map((p) => (p._id === proposalId ? { ...p, status: 'accepted' } : p)));
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  const handleEscrowSubmitWork = async (e) => {
    e.preventDefault();
    setEscrowActionBusy(true);
    try {
      const links = escrowSubmit.links
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post(`/projects/${id}/submit-work`, {
        submissionText: escrowSubmit.text.trim(),
        submissionLinks: links,
      });
      const { data } = await api.get(`/projects/${id}`);
      setProject(data.project);
      setEscrowSubmit({ text: '', links: '' });
      alert('Submitted for client review.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit');
    } finally {
      setEscrowActionBusy(false);
    }
  };

  const handleEscrowRelease = async () => {
    if (!window.confirm('Approve this delivery and release payment to the freelancer?')) return;
    setEscrowActionBusy(true);
    try {
      const { data } = await api.post(`/payments/escrow/release/${id}`);
      setProject(data.project);
      alert('Payment released. Project marked completed.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to release');
    } finally {
      setEscrowActionBusy(false);
    }
  };

  const openRevisionModal = () => {
    setRevisionNote('');
    setRevisionModalOpen(true);
  };

  const handleEscrowRequestChangesSubmit = async (e) => {
    e.preventDefault();
    const note = revisionNote.trim();
    if (!note) {
      alert('Please describe what you want changed.');
      return;
    }
    setEscrowActionBusy(true);
    try {
      const { data } = await api.patch(`/projects/${id}/request-changes`, { message: note });
      setProject(data.project);
      setRevisionModalOpen(false);
      setRevisionNote('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    } finally {
      setEscrowActionBusy(false);
    }
  };

  const handleEscrowDispute = async () => {
    const disputeMsg =
      user?.role === 'freelancer'
        ? 'Flag this project as disputed? Your payment will stay on hold until this is resolved.'
        : 'Flag this project as disputed? Payment will stay locked until this is resolved.';
    if (!window.confirm(disputeMsg)) return;
    setEscrowActionBusy(true);
    try {
      const { data } = await api.patch(`/projects/${id}/dispute`);
      setProject(data.project);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    } finally {
      setEscrowActionBusy(false);
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
    if (project?.assessmentEnabled && !myAssessment?.best) {
      alert('Please complete the project assessment quiz before submitting a proposal.');
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

  const fetchAssessmentResults = async () => {
    if (!project?.assessmentEnabled) return;
    setAssessmentResultsLoading(true);
    try {
      const { data } = await api.get(`/project-assessments/project/${id}/results`);
      setAssessmentResults(data);
      setAssessmentResultsOpen(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load assessment results');
    } finally {
      setAssessmentResultsLoading(false);
    }
  };

  if (loading || !project) return <div className="loading-screen">Loading...</div>;

  const isClient = (user?.role === 'client' || user?.role === 'admin') && project.client._id === user?._id;
  const isFreelancer = user && project.freelancer?._id === user._id;
  const canReview = project.status === 'completed' && (isClient || isFreelancer);
  const alreadyReviewed = canReview && reviews.some((r) => r.reviewer?._id === user?._id);
  const hasEscrow = project.budgetType === 'fixed' && Number(project.escrowLockedPaise) > 0;
  const acceptedBidDisplay = Number(project.acceptedBidAmount) > 0 ? Number(project.acceptedBidAmount) : null;

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
          {hasEscrow && ['in_progress', 'in_review', 'disputed'].includes(project.status) && (
            <section>
              <h2>{isFreelancer ? 'Your payment & delivery' : 'Delivery & payment'}</h2>
              {isFreelancer && (
                <p className="text-muted">
                  {acceptedBidDisplay != null ? (
                    <>
                      You were hired at <strong>₹{acceptedBidDisplay}</strong>. We safely hold that amount for you until the client approves your delivery—then it is added to your wallet.
                    </>
                  ) : (
                    <>We safely hold your payment for this job until the client approves your delivery—then it is added to your wallet.</>
                  )}
                </p>
              )}
              {!isFreelancer && (
                <p className="text-muted">
                  ₹{((Number(project.escrowLockedPaise) || 0) / 100).toFixed(2)} is reserved for this job until you approve delivery or the review window ends.
                  On approval, ₹{((Number(project.escrowFreelancerCreditPaise) || 0) / 100).toFixed(2)} is paid to the freelancer.
                </p>
              )}
              {project.status === 'disputed' && (
                <p className="text-muted">
                  <strong>Disputed:</strong> payment is on hold. Contact support or resolve with the other party.
                </p>
              )}
              {project.status === 'in_progress' && isFreelancer && project.revisionRequestNote && (
                <div
                  style={{
                    marginTop: 12,
                    marginBottom: 12,
                    padding: 12,
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: 8,
                  }}
                >
                  <strong>Client requested changes</strong>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{project.revisionRequestNote}</p>
                </div>
              )}
              {project.status === 'in_progress' && isFreelancer && (
                <form onSubmit={handleEscrowSubmitWork} className="milestone-form" style={{ marginTop: 12 }}>
                  <label>What you delivered (notes)</label>
                  <textarea
                    rows={4}
                    value={escrowSubmit.text}
                    onChange={(e) => setEscrowSubmit((s) => ({ ...s, text: e.target.value }))}
                    placeholder="Describe the deliverable, repo branch, etc."
                  />
                  <label>Links (one per line)</label>
                  <textarea
                    rows={3}
                    value={escrowSubmit.links}
                    onChange={(e) => setEscrowSubmit((s) => ({ ...s, links: e.target.value }))}
                    placeholder="https://..."
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={escrowActionBusy}>
                    {escrowActionBusy ? 'Submitting...' : 'Submit for client review'}
                  </button>
                </form>
              )}
              {(project.status === 'in_progress' || project.status === 'in_review') && isFreelancer && (
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={escrowActionBusy} onClick={handleEscrowDispute}>
                    Dispute
                  </button>
                </div>
              )}
              {project.status === 'in_review' && (isClient || user?.role === 'admin') && (
                <div style={{ marginTop: 12 }}>
                  {project.submittedAt && (
                    <p className="text-muted">Submitted {new Date(project.submittedAt).toLocaleString()}</p>
                  )}
                  {project.submissionText ? (
                    <div style={{ marginBottom: 12 }}>
                      <strong>Freelancer notes</strong>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{project.submissionText}</p>
                    </div>
                  ) : null}
                  {project.submissionLinks?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong>Links</strong>
                      <ul>
                        {project.submissionLinks.map((u) => (
                          <li key={u}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={escrowActionBusy} onClick={handleEscrowRelease}>
                      Approve &amp; release payment
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={escrowActionBusy} onClick={openRevisionModal}>
                      Request changes
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={escrowActionBusy} onClick={handleEscrowDispute}>
                      Dispute
                    </button>
                  </div>
                </div>
              )}
              {project.status === 'in_progress' && isFreelancer && project.submittedAt && (
                <p className="text-muted" style={{ marginTop: 8 }}>Waiting for the client after a revision request.</p>
              )}
            </section>
          )}
          {['in_progress', 'in_review'].includes(project.status) && project.budgetType === 'fixed' && (isClient || isFreelancer) && (
            <section>
              <h2>Milestones</h2>
              {hasEscrow && (
                <p className="text-muted">
                  {isFreelancer
                    ? 'This job is paid when the client approves your final delivery above. Per-milestone card payments are turned off for this project.'
                    : 'Payment for this job is released when you approve the final delivery above. Per-milestone payments are disabled for this project.'}
                </p>
              )}
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
                      {isClient && m.status === 'in_review' && !hasEscrow && (
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
          {isClient && ['open', 'in_progress', 'in_review'].includes(project.status) && (
            <div className="sidebar-card">
              <button type="button" className="btn btn-primary btn-block" onClick={() => setShowProposals(!showProposals)}>
                {showProposals ? 'Hide' : 'View'} proposals ({proposals.length || proposalCount})
              </button>
            </div>
          )}

          {isClient && project.status === 'open' && project.assessmentEnabled && (
            <div className="sidebar-card">
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={assessmentResultsLoading}
                onClick={() => fetchAssessmentResults()}
              >
                {assessmentResultsOpen ? 'Refresh assessment results' : 'View assessment results'}
              </button>

              {assessmentResultsOpen && assessmentResults && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Ranking (best marks)</div>
                  {assessmentResults.bestEntries.length === 0 ? (
                    <div style={{ color: '#718096' }}>No assessment submissions yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {assessmentResults.bestEntries.map((entry) => (
                        <div key={entry.user?._id || entry.userId} style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                          <div style={{ fontWeight: 700 }}>
                            {entry.user?.firstName} {entry.user?.lastName}
                          </div>
                          <div style={{ color: '#4a5568', fontSize: '0.9em' }}>
                            Marks: {entry.marks} | Time: {formatMs(entry.timeUsedMs)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 14, fontWeight: 800, marginBottom: 6 }}>All attempts</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflow: 'auto', paddingRight: 6 }}>
                    {assessmentResults.allAttempts.map((a) => (
                      <div key={a._id} style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                          {a.user?.firstName} {a.user?.lastName} ({a.user?.email})
                        </div>
                        <div style={{ color: '#4a5568', fontSize: '0.9em' }}>
                          Marks: {a.marks} | Time: {formatMs(a.timeUsedMs)} | Submitted: {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              {project.assessmentEnabled && !assessmentLoading && !myAssessment?.best && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ color: '#718096', marginBottom: 10 }}>
                    Assessment quiz is required before you can submit a proposal.
                  </p>
                  <Link to={`/projects/${id}/assessment`} className="btn btn-primary btn-block">
                    Take assessment quiz
                  </Link>
                </div>
              )}
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
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={submitting || (project.assessmentEnabled && !myAssessment?.best)}
                >
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
            <div key={prop._id} className={`proposal-item ${prop.status === 'accepted' ? 'proposal-accepted' : ''}`}>
              <div className="proposal-freelancer">
                <Link to={`/profile/${prop.freelancer._id}`}>
                  {prop.freelancer.firstName} {prop.freelancer.lastName}
                </Link>
                <span className="headline">{prop.freelancer.headline}</span>
              </div>
              {prop.aiScore ? (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f0f4f8', borderRadius: '4px', borderLeft: '4px solid #3182ce' }}>
                  <strong>🤖 AI Fit Score: {prop.aiScore}/100</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', color: '#4a5568' }}>{prop.aiFeedback}</p>
                </div>
              ) : null}

              {prop.assessmentMarks !== undefined && prop.assessmentMarks !== null ? (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f7fafc', borderRadius: '4px', borderLeft: '4px solid #2b6cb0' }}>
                  <strong>🧠 Assessment Marks: {prop.assessmentMarks}</strong>
                  <div style={{ marginTop: 4, color: '#4a5568', fontSize: '0.9em' }}>
                    Time used: {formatMs(prop.assessmentTimeUsedMs)}
                  </div>
                </div>
              ) : null}
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
                {prop.status === 'accepted' ? (
                  <span className="btn btn-ghost btn-sm" style={{ cursor: 'default', opacity: 0.9 }} aria-label="Accepted proposal">
                    Accepted
                  </span>
                ) : prop.status === 'pending' ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAcceptProposal(prop._id)}
                  >
                    Accept
                  </button>
                ) : (
                  <span className="text-muted" style={{ fontSize: '0.85em' }}>{prop.status}</span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {revisionModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0 }}>Request changes</h3>
            <p className="text-muted" style={{ fontSize: '0.9em' }}>Tell the freelancer what to fix or add. They will see this on the project page.</p>
            <form onSubmit={handleEscrowRequestChangesSubmit}>
              <textarea
                rows={5}
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="e.g. Please update the login flow and share a new demo link."
                required
                style={{ width: '100%', marginTop: 12, marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevisionModalOpen(false)} disabled={escrowActionBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={escrowActionBusy}>
                  {escrowActionBusy ? 'Sending...' : 'Send to freelancer'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
