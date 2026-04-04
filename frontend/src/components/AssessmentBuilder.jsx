import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

export default function AssessmentBuilder({
  skillCategory,
  selectedQuestions,
  onSelectedQuestionsChange,
  onQuestionCountChange,
}) {
  const [aiCandidates, setAiCandidates] = useState([]);
  const [candidateCount, setCandidateCount] = useState(10);
  const [questionCount, setQuestionCount] = useState(Math.max(1, selectedQuestions?.length || 5));
  const [aiLoading, setAiLoading] = useState(false);

  const [custom, setCustom] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
  });

  const selectedIds = useMemo(() => new Set((selectedQuestions || []).map((q) => q._id || q.__id).filter(Boolean)), [selectedQuestions]);

  const getQuestionKey = (q, idx) => q.questionText + '::' + (q.correctOptionIndex ?? '') + '::' + (q.options || []).join('|') + '::' + idx;

  const selectedCount = selectedQuestions?.length || 0;

  const toggleSelected = (q) => {
    const current = selectedQuestions || [];

    const matchIndex = current.findIndex((cq) => (
      cq.questionText === q.questionText &&
      String(cq.correctOptionIndex) === String(q.correctOptionIndex) &&
      Array.isArray(cq.options) &&
      Array.isArray(q.options) &&
      cq.options.join('|') === q.options.join('|')
    ));

    const isCurrentlySelected = matchIndex !== -1;
    if (isCurrentlySelected) {
      onSelectedQuestionsChange(current.filter((_, i) => i !== matchIndex));
      return;
    }

    if (selectedCount >= questionCount) {
      alert(`You can select up to ${questionCount} questions.`);
      return;
    }

    onSelectedQuestionsChange([...current, q]);
  };

  const isSelected = (q, idx) => {
    const current = selectedQuestions || [];
    // Compare by content (questionText + options + correct index).
    return current.some((cq) => (
      cq.questionText === q.questionText &&
      String(cq.correctOptionIndex) === String(q.correctOptionIndex) &&
      Array.isArray(cq.options) &&
      Array.isArray(q.options) &&
      cq.options.join('|') === q.options.join('|')
    ));
  };

  const handleGenerateAI = async () => {
    if (!skillCategory?.trim()) return alert('Enter a skill category/seed for quiz generation.');
    try {
      setAiLoading(true);
      const { data } = await api.post('/quizzes/ai/generate-questions', {
        skillCategory: skillCategory.trim(),
        questionCount: Number(candidateCount),
      });
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        return alert('AI did not return questions.');
      }
      setAiCandidates(data.questions);
      onSelectedQuestionsChange([]);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate questions with AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddCustom = () => {
    const questionText = custom.questionText.trim();
    const options = custom.options.map((o) => o.trim());
    const correctOptionIndex = Number(custom.correctOptionIndex);

    if (!questionText) return alert('Custom question text is required');
    if (options.length !== 4 || options.some((o) => !o)) return alert('All 4 options are required');
    if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex > 3) {
      return alert('Correct option must be selected');
    }

    const q = { questionText, options, correctOptionIndex };
    setAiCandidates((prev) => [...prev, q]);
    // auto-select if quota remains
    if ((selectedQuestions || []).length < questionCount && !isSelected(q, aiCandidates.length)) {
      onSelectedQuestionsChange([...(selectedQuestions || []), q]);
    }
    setCustom({ questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 });
  };

  const handleQuestionCountChange = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    setQuestionCount(n);
    if (typeof onQuestionCountChange === 'function') onQuestionCountChange(n);
    if ((selectedQuestions || []).length > n) {
      onSelectedQuestionsChange((selectedQuestions || []).slice(0, n));
    }
  };

  useEffect(() => {
    if (typeof onQuestionCountChange === 'function') onQuestionCountChange(questionCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionCount]);

  const canSubmitSelection = (selectedQuestions || []).length === questionCount;

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
      <h3 style={{ marginTop: 0 }}>Assessment Quiz Builder</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Candidate questions (M)
          <input type="number" min="1" max="20" value={candidateCount} onChange={(e) => setCandidateCount(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Selected questions (N)
          <input type="number" min="1" max={candidateCount} value={questionCount} onChange={(e) => handleQuestionCountChange(e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost" disabled={aiLoading} onClick={handleGenerateAI}>
          {aiLoading ? 'Generating...' : 'Generate from AI'}
        </button>
        <span style={{ color: canSubmitSelection ? '#2f855a' : '#718096' }}>
          Selected: {selectedCount}/{questionCount}
        </span>
      </div>

      {aiCandidates.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4>Pick N questions</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflow: 'auto', paddingRight: 8 }}>
            {aiCandidates.map((q, idx) => (
              <label key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fbfcff' }}>
                  <input
                    type="checkbox"
                    checked={isSelected(q, idx)}
                    onChange={() => toggleSelected(q)}
                  />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.questionText}</div>
                  <div style={{ color: '#718096', fontSize: '0.9em' }}>Options: {q.options?.slice(0, 4).join(' / ')}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', color: '#2b6cb0', fontWeight: 600 }}>Add your own question</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            Question text
            <input value={custom.questionText} onChange={(e) => setCustom({ ...custom, questionText: e.target.value })} />
          </label>
          {[0, 1, 2, 3].map((i) => (
            <label key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              Option {i + 1}
              <input value={custom.options[i]} onChange={(e) => {
                const next = [...custom.options];
                next[i] = e.target.value;
                setCustom({ ...custom, options: next });
              }} />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: '#718096' }}>Correct option</span>
            {[0, 1, 2, 3].map((i) => (
              <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="custom-correct"
                  checked={custom.correctOptionIndex === i}
                  onChange={() => setCustom({ ...custom, correctOptionIndex: i })}
                />
                {i + 1}
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleAddCustom}>
            Add custom question
          </button>
        </div>
      </details>
    </div>
  );
}

