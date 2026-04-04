import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function SkillVerification() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [timeLeftMs, setTimeLeftMs] = useState(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const { data } = await api.get('/quizzes/available');
      setQuizzes(data.quizzes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeLeft = (ms) => {
    if (ms === null || !Number.isFinite(ms)) return '--:--';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // Countdown for timed quiz attempts.
  useEffect(() => {
    if (!activeQuiz?.expiresAt) {
      setTimeLeftMs(null);
      return;
    }

    const deadline = new Date(activeQuiz.expiresAt).getTime();
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
  }, [activeQuiz]);

  const startQuiz = async (id) => {
    try {
      setLoading(true);
      const { data } = await api.post(`/quizzes/${id}/start`);
      setActiveQuiz({
        ...data.quiz,
        attemptId: data.attemptId,
        startedAt: data.startedAt,
        expiresAt: data.expiresAt,
      });
      setAnswers({});
      setResult(null);
      setTimeLeftMs(null);
    } catch (err) {
      alert('Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!activeQuiz?.attemptId) return alert('Quiz attempt not initialized.');

    if (timeLeftMs !== null && timeLeftMs <= 0) {
      return alert('Time limit exceeded');
    }

    if (Object.keys(answers).length < activeQuiz.questions.length) {
      return alert('Please answer all questions before submitting.');
    }

    // answers object is { qIndex: selectedOptionIndex }
    // API expects an array of option indexes matching the questions array
    const answersArray = activeQuiz.questions.map((_, i) => answers[i]);

    try {
      const { data } = await api.post(`/quizzes/${activeQuiz._id}/attempt`, {
        attemptId: activeQuiz.attemptId,
        answers: answersArray,
      });
      setResult(data);
      if (data.passed) {
        // Technically context could update here, but they can just refresh to see updated skill tags.
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit quiz');
    }
  };

  const isTimeUp = timeLeftMs !== null && timeLeftMs <= 0;

  if (loading) return <div className="loading-screen">Loading...</div>;

  // View: Completed single quiz result
  if (result && activeQuiz) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center', background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h1>{result.passed ? '🎉 Passed!' : '❌ Not Passed'}</h1>
        <h2 style={{ margin: '20px 0', fontSize: '3rem', color: result.passed ? '#48bb78' : '#e53e3e' }}>{result.score}%</h2>
        <p>{result.message}</p>
        <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={() => { setActiveQuiz(null); setResult(null); setTimeLeftMs(null); fetchQuizzes(); }}>
          Back to Verification Center
        </button>
      </div>
    );
  }

  // View: Taking a Quiz
  if (activeQuiz) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h1 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>{activeQuiz.title}</h1>
        <p className="muted">
          Time limit: {activeQuiz.timeLimitMinutes} minutes | Time left: {formatTimeLeft(timeLeftMs)} | Pass Threshold: {activeQuiz.passThreshold}%
        </p>
        
        <div style={{ marginTop: '30px' }}>
          {activeQuiz.questions.map((q, qIndex) => (
            <div key={q._id || qIndex} style={{ margin: '20px 0', padding: '15px', background: '#f7fafc', borderRadius: '8px' }}>
              <strong>{qIndex + 1}. {q.questionText}</strong>
              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {q.options.map((opt, oIndex) => (
                  <label key={oIndex} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name={`question-${qIndex}`} 
                      checked={answers[qIndex] === oIndex}
                      onChange={() => setAnswers({ ...answers, [qIndex]: oIndex })}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
          <button className="btn btn-primary" disabled={isTimeUp} onClick={submitQuiz}>
            {isTimeUp ? 'Time expired' : 'Submit Answers'}
          </button>
          <button className="btn btn-ghost" onClick={() => { setActiveQuiz(null); setTimeLeftMs(null); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // View: List Quizzes
  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto' }}>
      <h1>Skill Verification Center</h1>
      <p className="page-sub">Pass brief technical quizzes to earn the "Verified Skill" badge. Note: Enterprise gigs require verification.</p>
      
      {/* Display user's currently verified skills if any */}
      {user?.verifiedSkills?.length > 0 && (
        <div style={{ background: '#ebf8ff', padding: '15px', borderRadius: '8px', marginBottom: '30px', borderLeft: '4px solid #3182ce' }}>
          <strong>Your Verified Skills:</strong>
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            {user.verifiedSkills.map(s => (
              <span key={s} style={{ background: '#3182ce', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.85em' }}>✓ {s}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {quizzes.length === 0 ? (
          <p className="muted">No verification quizzes available right now.</p>
        ) : (
          quizzes.map(quiz => {
            const isAlreadyVerified = user?.verifiedSkills?.includes(quiz.skillCategory);
            return (
              <div key={quiz._id} style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>{quiz.title}</h3>
                <p style={{ margin: '0 0 15px 0', fontSize: '0.9em', color: '#718096' }}>
                  Target Skill: <strong>{quiz.skillCategory}</strong><br/>
                  Pass mark: {quiz.passThreshold}%<br/>
                  Questions: {quiz.questions?.length}
                </p>
                {isAlreadyVerified ? (
                  <button className="btn btn-primary" disabled style={{ background: '#48bb78', borderColor: '#48bb78' }}>Already Verified</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => startQuiz(quiz._id)}>Take Verification Test</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

