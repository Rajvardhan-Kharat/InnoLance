import 'dotenv/config';
import { generateWithFallbackChain } from './src/services/llmFallback.js';

const prompt = `You are an expert Technical Project Manager on a freelancing platform.
A client has submitted a rough idea:

CLIENT IDEA:
"""
I need a mobile and desktop app for tracking attendance of students of my class
"""

Transform this into a structured freelancing job post. Return ONLY a valid JSON object with these exact keys:
- "title": string (a concise, professional project title)
- "description": string (2-3 paragraphs professional project description with goals, deliverables, and requirements)
- "skills": array of strings (3-6 relevant technical skills from: React, Node.js, MongoDB, Python, UI/UX, Content Writing, SEO, AWS, Docker, TypeScript, GraphQL, REST, Figma)
- "budget": number (suggested fixed budget in INR, realistic for Indian freelancers, e.g. 15000-150000)
- "duration": string (one of: "<1week", "1-4weeks", "1-3months", "3+months")

Do not use markdown blocks. Return raw JSON only.`;

async function testGroq() {
  const fallback = await generateWithFallbackChain(prompt);
  console.log('Fallback result:', fallback);
}

testGroq();
