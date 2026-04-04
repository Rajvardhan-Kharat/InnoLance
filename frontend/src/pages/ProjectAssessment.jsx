import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

function formatMs(ms) {
  if (!Number.isFinite(ms)) return '--:--';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ProjectAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeftMs, setTimeLeftMs] = useState(null);
  const [result, setResult] = useState(null);

  const canSubmit = useMemo(() => {
    if (!attempt) return false;
    return Array.isArray(questions) && questions.length > 0 && Object.keys(answers).length === questions.length;
  }, [attempt, questions, answers]);

  useEffect(() => {
    // If no user, let API reject but show a quick UX message.
    if (!user) return;
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!attempt?.expiresAt) {
      setTimeLeftMs(null);
      return;
    }
    const deadline = new Date(attempt.expiresAt).getTime();
    if (!Number.isFinite(deadline)) {
      setTimeLeftMs(null);
      return;
    }

    const tick = () => {
      setTimeLeftMs(deadline - Date.now());
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [attempt]);

  const startAttempt = async () => {
    setLoading(true);
    setResult(null);
    setAttempt(null);
    setQuestions([]);
    setAnswers({});
    try {
      const { data } = await api.post(`/project-assessments/project/${id}/start`);
      setAttempt({
        attemptId: data.attemptId,
        startedAt: data.startedAt,
        expiresAt: data.expiresAt,
      });
      setQuestions(data.questions || []);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to start assessment');
    } finally {
      setLoading(false);
    }
  };

  const submitAttempt = async () => {
    if (!attempt?.attemptId) return;
    if (timeLeftMs !== null && timeLeftMs <= 0) return alert('Time limit exceeded');

    const answersArray = questions.map((_, i) => answers[i]);

    setLoading(true);
    try {
      const { data } = await api.post(`/project-assessments/project/${id}/submit`, {
        attemptId: attempt.attemptId,
        answers: answersArray,
      });
      setResult(data);

      // Notify the project page so it can re-fetch /me and enable proposal submission.
      window.dispatchEvent(
        new CustomEvent('assessment:updated', {
          detail: { projectId: id },
        })
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit assessment');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !attempt && !result) return <div className="loading-screen">Loading...</div>;

  if (result) {
    return (
      <div style={{ maxWidth: 800, margin: '40px auto', background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0 }}>Assessment Result</h2>
        <div style={{ fontSize: '1.3em', fontWeight: 800 }}>
          Marks: {result.marks}
        </div>
        <div style={{ color: '#718096', marginTop: 8 }}>
          Correct: {result.correctCount} | Incorrect: {result.incorrectCount} | Time used: {formatMs(result.timeUsedMs)}
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate(`/projects/${id}`)}>Back to project</button>
          <button className="btn btn-ghost" onClick={startAttempt}>Try another attempt</button>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div style={{ maxWidth: 800, margin: '40px auto', background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0 }}>Assessment Quiz</h2>
        <p className="page-sub">You will have a strict total time limit. Answer before submitting.</p>
        <button className="btn btn-primary" onClick={startAttempt} disabled={loading}>
          {loading ? 'Starting...' : 'Start assessment'}
        </button>
        <button className="btn btn-ghost" style={{ marginLeft: 10 }} onClick={() => navigate(`/projects/${id}`)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '30px auto', background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Quiz Attempt</h2>
        <div style={{ color: '#718096', fontWeight: 600 }}>
          Time left: {formatMs(timeLeftMs)}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, qIndex) => (
          <div key={qIndex} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, background: '#fbfcff' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{qIndex + 1}. {q.questionText}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options.map((opt, oIndex) => (
                <label key={oIndex} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`q-${qIndex}`}
                    checked={answers[qIndex] === oIndex}
                    onChange={() => setAnswers((prev) => ({ ...prev, [qIndex]: oIndex }))}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!canSubmit || loading} onClick={submitAttempt}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
        <button className="btn btn-ghost" disabled={loading} onClick={() => navigate(`/projects/${id}`)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

