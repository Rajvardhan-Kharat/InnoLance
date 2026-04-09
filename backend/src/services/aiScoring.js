import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithGroq, isTransientGeminiError } from './llmFallback.js';

function safeJsonParse(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObj = cleaned.indexOf('{');
    if (firstObj < 0) return null;
    const candidate = cleaned.slice(firstObj);
    const lastBrace = candidate.lastIndexOf('}');
    if (lastBrace < 0) return null;
    try {
      return JSON.parse(candidate.slice(0, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Evaluates a freelancer proposal against project requirements using Gemini AI.
 * @param {string} projectTitle
 * @param {string} projectDescription
 * @param {string} proposalCoverLetter
 * @returns {Promise<{ score: number, feedback: string }>}
 */
export async function evaluateProposal(projectTitle, projectDescription, proposalCoverLetter) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY/GOOGLE_API_KEY not configured. Skipping AI scoring.');
      return { score: null, feedback: null };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    const prompt = `You are a strict, expert technical recruiter and project manager.
A freelancer has submitted a proposal for the following project:

PROJECT TITLE: ${projectTitle}
PROJECT DESCRIPTION: ${projectDescription}

FREELANCER PROPOSAL / COVER LETTER:
${proposalCoverLetter}

Your task is to evaluate this proposal's quality, relevance, and technical understanding of the project.
1. Score the proposal from 1 to 100 based on how well it fits the project.
2. Provide a brief 1-2 sentence constructive feedback on why you gave this score.

Return ONLY a valid JSON object with the exact keys: 'score' (an integer number between 1 and 100), and 'feedback' (a string). Do not use markdown blocks like \`\`\`json. Return raw JSON.`;

    let parsed = null;
    let lastErr = null;
    for (const modelName of modelsToTry) {
      const model = genAI.getGenerativeModel({ model: modelName });
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const text = result?.response?.text?.()?.trim() || '';
          parsed = safeJsonParse(text);
          if (parsed && typeof parsed === 'object') break;
          throw new Error('AI returned non-JSON response');
        } catch (err) {
          lastErr = err;
          const msg = String(err?.message || '');
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

    if (!parsed || typeof parsed !== 'object') {
      throw (lastErr || new Error('AI scoring failed'));
    }
    const score = Math.max(1, Math.min(100, Number(parsed.score) || 0));
    return {
      score,
      feedback: parsed.feedback || 'No feedback provided.',
    };

  } catch (error) {
    console.error('AI Proposal Evaluation Error:', error);
    return { score: null, feedback: null };
  }
}
