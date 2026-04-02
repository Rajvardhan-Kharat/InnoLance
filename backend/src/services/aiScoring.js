import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Evaluates a freelancer proposal against project requirements using Gemini AI.
 * @param {string} projectTitle
 * @param {string} projectDescription
 * @param {string} proposalCoverLetter
 * @returns {Promise<{ score: number, feedback: string }>}
 */
export async function evaluateProposal(projectTitle, projectDescription, proposalCoverLetter) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured. Skipping AI scoring.');
      return { score: null, feedback: null };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Clean up potential markdown blocks
    if (text.startsWith('\`\`\`json')) {
      text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    } else if (text.startsWith('\`\`\`')) {
      text = text.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
    }

    const parsed = JSON.parse(text);
    return {
      score: Number(parsed.score) || 0,
      feedback: parsed.feedback || 'No feedback provided.',
    };

  } catch (error) {
    console.error('AI Proposal Evaluation Error:', error);
    return { score: null, feedback: null };
  }
}
