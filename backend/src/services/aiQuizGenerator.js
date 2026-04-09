import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithGroq, isTransientGeminiError } from './llmFallback.js';

function safeJsonParse(text) {
  if (!text) return null;

  let cleaned = String(text).trim();

  // Remove common markdown code fences if the model returns them anyway.
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract the first JSON array/object from the response.
    const firstArray = cleaned.indexOf('[');
    const firstObj = cleaned.indexOf('{');
    const start = [firstArray, firstObj].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (start === undefined) return null;
    const candidate = cleaned.slice(start);
    // Try again with the sliced candidate.
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const normalized = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] || {};
    const questionText = typeof q.questionText === 'string' ? q.questionText.trim() : '';
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const correctOptionIndex = Number(q.correctOptionIndex);

    if (!questionText) return null;
    if (!Array.isArray(options) || options.length < 2) return null;
    if (!Number.isInteger(correctOptionIndex)) return null;
    if (correctOptionIndex < 0 || correctOptionIndex >= options.length) return null;

    normalized.push({
      questionText,
      options,
      correctOptionIndex,
    });
  }

  return normalized;
}

/**
 * Generate multiple-choice quiz questions for a given skill category.
 *
 * Output schema (strict):
 * [
 *   { questionText: string, options: string[], correctOptionIndex: number }
 * ]
 */
export async function generateQuizQuestions({
  skillCategory,
  questionCount = 5,
}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY/GOOGLE_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  const count = Number(questionCount);
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(count, 20)) : 5;

  const prompt = `You are an expert technical training content writer.

Generate EXACTLY ${safeCount} multiple-choice questions to assess competency for the following skill category:
SKILL CATEGORY: ${skillCategory}

Each question MUST be appropriate for freelancers and must test practical knowledge, not trivia.

For each question, produce exactly 4 answer options.
One option MUST be the correct answer and you MUST set correctOptionIndex to the index (0..3) of that correct option.

Return ONLY a valid JSON array (no markdown, no explanations) with the exact keys:
[
  {
    "questionText": "string",
    "options": ["string","string","string","string"],
    "correctOptionIndex": 0
  }
]
`;

  let parsed = null;
  let lastErr = null;
  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const text = result?.response?.text?.() ?? '';
        parsed = safeJsonParse(text);
        if (parsed) break;
        throw new Error('AI returned non-JSON response');
      } catch (err) {
        lastErr = err;
        const transient = isTransientGeminiError(err);
        if (!transient || attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
      }
    }
    if (parsed) break;
  }

  if (!parsed) {
    const groqText = await generateWithGroq(prompt);
    if (groqText) parsed = safeJsonParse(groqText);
  }

  if (!parsed) throw (lastErr || new Error('AI quiz generation failed'));

  const validated = validateQuestions(parsed);
  if (!validated || validated.length !== safeCount) {
    throw new Error('AI quiz generation failed validation');
  }

  // Ensure options length is exactly 4 (generator prompt requests it, but validate anyway).
  // If the model deviates, fail fast so we don't create broken quizzes.
  for (const q of validated) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error('AI quiz generation produced invalid option count');
    }
    if (q.correctOptionIndex < 0 || q.correctOptionIndex > 3) {
      throw new Error('AI quiz generation produced invalid correctOptionIndex');
    }
  }

  return validated;
}

