import 'dotenv/config';
import { generateWithFallbackChain } from './src/services/llmFallback.js';

const ideaText = 'I need a mobile and desktop app for tracking attendance of students of my class';

const prompt = `You are a Senior Enterprise Solutions Architect and Technical Business Analyst.
A client has a rough idea for a large-scale enterprise software project:

CLIENT IDEA:
"""
${ideaText}
"""

Expand this into a professional, structured Enterprise Request for Proposal (RFP) document. Return ONLY a valid JSON object with these exact keys:
- "projectOverview": string (A single string containing a detailed 2-3 paragraph executive summary describing the problem statement, business goals, and what needs to be built. Use \\n\\n for paragraphs. Do NOT output multiple strings for paragraphs.)
- "technicalScope": string (Detailed technical scope covering: required tech stacks, integrations, APIs, system architecture considerations, specific features, scalability requirements, security considerations)
- "goalsAndRequirements": string (Structured list of functional and non-functional requirements, success criteria, and key deliverables)
- "suggestedBudgetRange": string (A realistic enterprise budget range as a string, e.g. "₹5,00,000 – ₹15,00,000")
- "suggestedTimeline": string (Recommended project timeline with phases, e.g. "Phase 1 (MVP): 3 months | Phase 2 (Full Launch): 6 months")

Be professional, thorough, and enterprise-grade. Do not use markdown blocks. Return raw JSON only.`;

async function debugGroq() {
  const text = await generateWithFallbackChain(prompt);
  console.log('--- RAW GROQ RESPONSE ---');
  console.log(text);
  console.log('-------------------------');
  console.log('JSON Parse success:', !!JSON.parse(text));
}

debugGroq();
