import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallbackChain, isTransientGeminiError } from './llmFallback.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────
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
 * Try Gemini models in sequence (with retries), then fall through to the
 * multi-provider fallback chain (Groq → OpenRouter → HuggingFace → Cohere).
 * Returns raw text or null.
 */
async function generateTextWithAllProviders(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. Try Gemini
  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    for (const modelName of modelsToTry) {
      const model = genAI.getGenerativeModel({ model: modelName });
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const text = result?.response?.text?.()?.trim();
          if (text) return text;
        } catch (err) {
          const transient = isTransientGeminiError(err);
          if (!transient || attempt === 3) break;
          await new Promise((resolve) => setTimeout(resolve, 600 * (2 ** (attempt - 1))));
        }
      }
    }
  }

  // 2. Fall through to multi-provider chain
  return generateWithFallbackChain(prompt);
}

// ─── generatePrdFromIdea ──────────────────────────────────────────────────────
/**
 * Generates a structured Project Requirements Document (PRD) from a raw client idea.
 * @param {string} ideaText
 * @returns {Promise<string>}
 */
export async function generatePrdFromIdea(ideaText) {
  try {
    const prompt = `You are an expert Technical Project Manager and Systems Architect.
A client has submitted a rough, high-level idea for a software project:

CLIENT IDEA:
"""
${ideaText}
"""

Your task is to transform this raw idea into a professional, structured Project Requirements Document (PRD).
The PRD should be formatted in Markdown and include the following sections:
1. **Executive Summary:** A refined overview of the project's purpose and goals.
2. **Core Features (Epics & User Stories):** Key functionalities required, broken down into epics or high-level user stories.
3. **Technical Requirements & Tech Stack (Suggested):** Recommended frontend, backend, database, and any third-party services, based on project needs.
4. **Milestones & Deliverables:** Recommended high-level phases (e.g., Phase 1: MVP).
5. **Non-Functional Requirements:** Security, scalability, and performance considerations.

Be professional, thorough, and analytical. Return ONLY the Markdown formatted PRD. Do not include any conversational filler.`;

    const generatedText = await generateTextWithAllProviders(prompt);
    if (!generatedText) throw new Error('All AI providers failed');
    return generatedText;
  } catch (error) {
    console.error('AI PRD Generation Error:', error);
    return 'Failed to automatically generate PRD. Raw Idea:\n\n' + ideaText;
  }
}

// ─── generateTitleAndDescription ─────────────────────────────────────────────
/**
 * Generates a title and description formatted for a standard project posting from a raw idea.
 * @param {string} ideaText
 * @returns {Promise<{title: string, description: string}>}
 */
export async function generateTitleAndDescription(ideaText) {
  try {
    const prompt = `You are a Technical Project Manager.
A client has submitted a rough, high-level idea for a software project:

CLIENT IDEA:
"""
${ideaText}
"""

Transform this raw idea into a concise but descriptive 'Title' and 'Description' suitable for a freelancing job board post.
The description should outline the goal, key functionality required, and be structured professionally in a few paragraphs.

Return ONLY a valid JSON object with the exact keys: 'title' (a string) and 'description' (a string). Do not use markdown blocks. Return raw JSON.`;

    const text = await generateTextWithAllProviders(prompt);
    if (text) {
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === 'object' && parsed.title && parsed.description) {
        return parsed;
      }
    }
    return { title: 'Untitled Project', description: ideaText };
  } catch (err) {
    console.error('AI generateTitleAndDescription Error:', err);
    return { title: 'Untitled Project', description: ideaText };
  }
}

// ─── generateFullProjectDetails ───────────────────────────────────────────────
/**
 * Generates full project details: title, description, skills, budget, duration.
 * @param {string} ideaText
 * @param {string} [aiInstructions]
 * @returns {Promise<{title, description, skills, budget, duration}>}
 */
export async function generateFullProjectDetails(ideaText, aiInstructions = '') {
  try {
    const prompt = `You are an expert Technical Project Manager helping a client write a professional job post on a freelancing platform.
The client gave you their rough idea below. Your job is to transform it into a polished job posting.

CLIENT IDEA:
"""
${ideaText}
"""

Transform this into a structured freelancing job post. Return ONLY a valid JSON object with these exact keys:
- "title": string (a concise, professional project title — NOT 'Untitled Project')
- "description": string (A single string containing 2-3 paragraphs written in FIRST PERSON from the client's perspective. Use "I" or "We" — for example: "I am looking for a skilled developer to build...", "We need a professional to help us...". Use \\n\\n for paragraph breaks. Do NOT write in third person like "The client requires...")
- "skills": array of strings (3-6 relevant skills. Can include tech skills OR non-tech skills like: Graphic Design, Content Writing, Video Editing, Social Media Marketing, Accounting, Legal Consulting, Virtual Assistance, SEO, UI/UX, React, Node.js, MongoDB, Python, AWS, Docker, TypeScript, Figma, Photoshop, Illustrator, etc.)
- "budget": number (suggested fixed budget in INR rounded to nearest 1000, realistic for Indian freelancers, e.g. 15000, 25000, 50000)
- "duration": string (one of: "<1week", "1-4weeks", "1-3months", "3+months")

${aiInstructions ? `ADDITIONAL CLIENT INSTRUCTIONS FOR GENERATION:\n"""\n${aiInstructions}\n"""\nMake sure to strictly follow the above additional instructions while generating the details.\n` : ''}
Do not use markdown blocks. Return raw JSON only.`;

    const text = await generateTextWithAllProviders(prompt);
    if (!text) throw new Error('All AI providers returned empty response');

    const parsed = safeJsonParse(text);
    if (parsed && parsed.title && parsed.description) {
      // Validate it didn't just echo back the input
      const descIsSameAsInput = parsed.description.trim() === ideaText.trim();
      const titleIsDefault = parsed.title === 'Untitled Project';
      if (descIsSameAsInput || titleIsDefault) {
        throw new Error('AI returned fallback/echo content — retrying not possible');
      }
      return {
        title: parsed.title,
        description: parsed.description,
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        budget: Number(parsed.budget) || 5000,
        duration: parsed.duration || '1-3months',
      };
    }
    throw new Error('AI response could not be parsed as valid JSON with required fields');
  } catch (err) {
    console.error('AI generateFullProjectDetails Error:', err);
    throw new Error('AI failed to generate project details. Please try again or fill fields manually.');
  }
}

// ─── generateRfpFromIdea ──────────────────────────────────────────────────────
/**
 * Generates a structured Enterprise RFP document from a rough idea paragraph.
 * @param {string} ideaText
 * @param {string} [aiInstructions]
 * @returns {Promise<{projectOverview, technicalScope, goalsAndRequirements, suggestedBudgetRange, suggestedTimeline}>}
 */
export async function generateRfpFromIdea(ideaText, aiInstructions = '') {
  try {
    const prompt = `You are a Senior Enterprise Solutions Architect helping a client write a professional Enterprise RFP (Request for Proposal).
The client gave you their rough idea below. Your job is to expand it into a polished, thorough enterprise RFP document.

CLIENT IDEA:
"""
${ideaText}
"""

Expand this into a professional, structured Enterprise Request for Proposal (RFP) document. Return ONLY a valid JSON object with these exact keys:
- "projectOverview": string (A single string containing a detailed 2-3 paragraph executive summary written in FIRST PERSON from the client's perspective. Use "We are looking for...", "Our organisation needs...", "I need to build...". Use \\n\\n for paragraphs. Do NOT write in third person like "The client requires...")
- "technicalScope": string (Detailed technical scope covering: required tech stacks, integrations, APIs, system architecture considerations, specific features, scalability requirements, security considerations)
- "goalsAndRequirements": string (Structured list of functional and non-functional requirements, success criteria, and key deliverables)
- "suggestedBudgetRange": string (A realistic enterprise budget range as a string, e.g. "₹5,00,000 – ₹15,00,000")
- "suggestedTimeline": string (Recommended project timeline with phases, e.g. "Phase 1 (MVP): 3 months | Phase 2 (Full Launch): 6 months")

${aiInstructions ? `ADDITIONAL CLIENT INSTRUCTIONS FOR GENERATION:\n"""\n${aiInstructions}\n"""\nMake sure to strictly follow the above additional instructions while generating the RFP.\n` : ''}
Be professional, thorough, and enterprise-grade. Do not use markdown blocks. Return raw JSON only.`;

    const text = await generateTextWithAllProviders(prompt);
    if (!text) throw new Error('All AI providers returned empty response');

    const parsed = safeJsonParse(text);
    if (parsed && parsed.projectOverview) {
      // Validate it didn't just echo back the input
      const overviewIsSameAsInput = parsed.projectOverview.trim() === ideaText.trim();
      if (overviewIsSameAsInput) {
        throw new Error('AI returned echo content — retrying not possible');
      }
      return {
        projectOverview: parsed.projectOverview,
        technicalScope: parsed.technicalScope || '',
        goalsAndRequirements: parsed.goalsAndRequirements || '',
        suggestedBudgetRange: parsed.suggestedBudgetRange || '',
        suggestedTimeline: parsed.suggestedTimeline || '',
      };
    }
    throw new Error('AI response could not be parsed as valid JSON with required fields');
  } catch (err) {
    console.error('AI generateRfpFromIdea Error:', err);
    throw new Error('AI failed to generate RFP draft. Please try again or fill fields manually.');
  }
}
