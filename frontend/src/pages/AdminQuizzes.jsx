import { useState, useEffect } from 'react';
import api from '../utils/api';
import './AdminDashboard.css'; // Reusing some base styles

export default function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [aiGenerating, setAiGenerating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    skillCategory: '',
    passThreshold: 70,
    timeLimitMinutes: 15,
  });
  
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  
  const [questions, setQuestions] = useState([
    { questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 }
  ]);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const { data } = await api.get('/quizzes');
      setQuizzes(data.quizzes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = () => {
    setQuestions([
      ...questions, 
      { questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 }
    ]);
  };

  const handleQuestionChange = (index, field, value) => {
    const updated = [...questions];
    updated[index][field] = value;
    setQuestions(updated);
  };

  const handleOptionChange = (qIndex, oIndex, value) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (questions.some(q => !q.questionText || q.options.some(o => !o))) {
        return alert("Please fill all questions and options");
      }
      const payload = {
        title: form.title,
        skillCategory: form.skillCategory,
        passThreshold: Number(form.passThreshold),
        timeLimitMinutes: Number(form.timeLimitMinutes),
        questions
      };
      
      await api.post('/quizzes', payload);
      alert('Quiz created successfully!');
      setForm({ title: '', skillCategory: '', passThreshold: 70, timeLimitMinutes: 15 });
      setQuestions([{ questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 }]);
      fetchQuizzes();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create quiz');
    }
  };

  const generateQuestionsWithAI = async () => {
    if (!form.skillCategory?.trim()) {
      return alert('Please enter a Skill Category first.');
    }
    try {
      setAiGenerating(true);
      const payload = { skillCategory: form.skillCategory.trim(), questionCount: Number(aiQuestionCount) };
      const { data } = await api.post('/quizzes/ai/generate-questions', payload);
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        return alert('AI did not return any questions.');
      }
      setQuestions(data.questions);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate quiz questions with AI');
    } finally {
      setAiGenerating(false);
    }
  };

  if (loading) return <div>Loading Quizzes...</div>;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>🛠️ Manage Skill Quizzes</h1>
        <p>Create quizzes to verify freelancer skills before they can bid on Enterprise jobs.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3>Create New Quiz</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label>Quiz Title</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. React Native Expert Verification" />
            
            <label>Skill Category</label>
            <input required value={form.skillCategory} onChange={e => setForm({ ...form, skillCategory: e.target.value })} placeholder="e.g. React Native" />
            
            <label>Pass Threshold (%)</label>
            <input type="number" required min="1" max="100" value={form.passThreshold} onChange={e => setForm({ ...form, passThreshold: e.target.value })} />
            
            <label>Time Limit (Minutes)</label>
            <input type="number" required min="1" value={form.timeLimitMinutes} onChange={e => setForm({ ...form, timeLimitMinutes: e.target.value })} />

            <hr style={{ margin: '20px 0' }} />
            <h4>Questions</h4>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ margin: 0 }}>AI Question Count</label>
              <input
                type="number"
                min="1"
                max="20"
                value={aiQuestionCount}
                onChange={(e) => setAiQuestionCount(e.target.value)}
                style={{ width: '120px' }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={aiGenerating}
                onClick={generateQuestionsWithAI}
              >
                {aiGenerating ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            
            {questions.map((q, qIndex) => (
              <div key={qIndex} style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '6px', marginBottom: '10px' }}>
                <input 
                  required 
                  placeholder={`Question ${qIndex + 1}`} 
                  value={q.questionText} 
                  onChange={e => handleQuestionChange(qIndex, 'questionText', e.target.value)} 
                  style={{ width: '100%', marginBottom: '10px' }}
                />
                
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <input 
                      type="radio" 
                      name={`correct-${qIndex}`} 
                      checked={q.correctOptionIndex === oIndex} 
                      onChange={() => handleQuestionChange(qIndex, 'correctOptionIndex', oIndex)} 
                    />
                    <input 
                      required 
                      placeholder={`Option ${oIndex + 1}`} 
                      value={opt} 
                      onChange={e => handleOptionChange(qIndex, oIndex, e.target.value)} 
                      style={{ flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            ))}
            
            <button type="button" className="btn btn-ghost" onClick={handleAddQuestion}>+ Add Another Question</button>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '20px' }}>Save Quiz</button>
          </form>
        </div>

        <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3>Active Quizzes</h3>
          {quizzes.length === 0 ? <p className="muted">No quizzes created yet.</p> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {quizzes.map(quiz => (
                <li key={quiz._id} style={{ padding: '15px', borderBottom: '1px solid #edf2f7' }}>
                  <strong>{quiz.title}</strong>
                  <div style={{ fontSize: '0.85em', color: '#718096', marginTop: '5px' }}>
                    Skill: {quiz.skillCategory} | Threshold: {quiz.passThreshold}% | Time: {quiz.timeLimitMinutes}m
                  </div>
                  <div style={{ fontSize: '0.85em', marginTop: '5px' }}>{quiz.questions?.length} Questions</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

