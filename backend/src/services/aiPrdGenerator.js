import { safeJsonParse, generateTextWithAllProviders } from '../utils/aiUtils.js';

// ─── Local deterministic fallback ────────────────────────────────────────────
/**
 * Generates a structured RFP purely from the input text — no AI required.
 * Used when ALL AI providers fail so the user always gets a usable draft.
 */
function buildLocalRfpFallback(ideaText, aiInstructions = '') {
  const idea = (ideaText || '').trim();
  const lines = idea.split(/[.\n]+/).map((l) => l.trim()).filter(Boolean);

  // Heuristic: extract keywords for tech suggestions
  const lower = idea.toLowerCase();
  const techHints = [];
  if (/website|web app|frontend|react|angular|vue/.test(lower)) techHints.push('React.js / Next.js (Frontend)');
  if (/mobile|android|ios|app/.test(lower)) techHints.push('React Native / Flutter (Mobile App)');
  if (/api|backend|server|node|python|django/.test(lower)) techHints.push('Node.js + Express (Backend API)');
  if (/database|mongodb|mysql|postgres|sql/.test(lower)) techHints.push('MongoDB / PostgreSQL (Database)');
  if (/payment|billing|invoice|stripe|razorpay/.test(lower)) techHints.push('Payment Gateway Integration (Razorpay / Stripe)');
  if (/dashboard|analytics|chart|report/.test(lower)) techHints.push('Dashboard & Analytics Module');
  if (/auth|login|register|oauth/.test(lower)) techHints.push('Authentication & Authorization (JWT / OAuth)');
  if (/ai|ml|machine learning|chatbot|nlp/.test(lower)) techHints.push('AI / ML Integration');
  if (/cloud|aws|gcp|azure|deploy/.test(lower)) techHints.push('Cloud Deployment (AWS / GCP)');
  if (!techHints.length) techHints.push('Web Application Stack', 'REST API Backend', 'Relational / NoSQL Database');

  // Budget estimate heuristic based on complexity words
  let budgetRange = '₹1,00,000 – ₹3,00,000';
  if (/enterprise|large|complex|multiple|integration|automation/.test(lower)) budgetRange = '₹5,00,000 – ₹15,00,000';
  else if (/simple|basic|small|single/.test(lower)) budgetRange = '₹25,000 – ₹80,000';

  // Timeline heuristic
  let timeline = 'Phase 1 (MVP): 2–3 months | Phase 2 (Full Launch): 4–6 months';
  if (/urgent|asap|quick|fast/.test(lower)) timeline = 'Phase 1 (MVP): 4–6 weeks | Phase 2 (Full Launch): 2–3 months';

  const projectOverview = [
    `We are seeking a qualified technology partner to design and develop a comprehensive solution based on our requirements.`,
    `Our core need is as follows: ${idea.slice(0, 600)}${idea.length > 600 ? '...' : ''}`,
    `We expect the solution to be reliable, scalable, and delivered on schedule with clear milestones.`,
    aiInstructions ? `Additional context: ${aiInstructions.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n\n');

  const technicalScope = [
    `**Required Technology Stack:**`,
    techHints.map((t) => `• ${t}`).join('\n'),
    ``,
    `**Core Features Required:**`,
    lines.slice(0, 6).map((l) => `• ${l}`).join('\n'),
    ``,
    `**System Requirements:**`,
    `• Responsive design (desktop and mobile)`,
    `• Secure data handling and storage`,
    `• RESTful or GraphQL API architecture`,
    `• Admin dashboard for management`,
    `• Role-based access control`,
    `• Third-party integration support`,
  ].join('\n');

  const goalsAndRequirements = [
    `**Functional Requirements:**`,
    lines.slice(0, 8).map((l) => `• ${l}`).join('\n'),
    ``,
    `**Non-Functional Requirements:**`,
    `• System uptime ≥ 99.5%`,
    `• Page load time < 2 seconds`,
    `• Support for concurrent users`,
    `• Data encryption at rest and in transit`,
    `• GDPR / data privacy compliance`,
    ``,
    `**Success Criteria:**`,
    `• Successful delivery of all listed features`,
    `• Passing of User Acceptance Testing (UAT)`,
    `• Full source code and documentation handover`,
    `• Post-launch support period of at least 30 days`,
  ].join('\n');

  return {
    projectOverview,
    technicalScope,
    goalsAndRequirements,
    suggestedBudgetRange: budgetRange,
    suggestedTimeline: timeline,
    _fallback: true, // internal marker so caller knows it was local
  };
}

/**
 * Generates a structured Enterprise RFP.
 * ALWAYS returns a valid object — never throws.
 * Uses AI if available, falls back to deterministic local generation.
 */
export async function generateRfpFromIdea(ideaText, aiInstructions = '') {
  // ── 1. Try AI providers ──────────────────────────────────────────────────
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

    if (text) {
      const parsed = safeJsonParse(text);
      if (parsed && parsed.projectOverview) {
        const overviewIsSameAsInput = parsed.projectOverview.trim() === ideaText.trim();
        if (!overviewIsSameAsInput) {
          return {
            projectOverview: parsed.projectOverview,
            technicalScope: parsed.technicalScope || '',
            goalsAndRequirements: parsed.goalsAndRequirements || '',
            suggestedBudgetRange: parsed.suggestedBudgetRange || '',
            suggestedTimeline: parsed.suggestedTimeline || '',
          };
        }
      }
    }
  } catch (err) {
    console.warn('[generateRfpFromIdea] AI providers failed:', err.message);
  }

  // ── 2. Local deterministic fallback — always succeeds ───────────────────
  console.log('[generateRfpFromIdea] All AI providers exhausted — using local fallback');
  return buildLocalRfpFallback(ideaText, aiInstructions);
}

// ─── generatePrdFromIdea ──────────────────────────────────────────────────────
/**
 * Generates a structured Project Requirements Document (PRD) from a raw client idea.
 * ALWAYS returns a string — never throws.
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
    if (generatedText) return generatedText;
  } catch (error) {
    console.warn('[generatePrdFromIdea] AI failed:', error.message);
  }

  // Local Markdown PRD fallback
  const lines = (ideaText || '').split(/[.\n]+/).map((l) => l.trim()).filter(Boolean);
  return [
    `# Project Requirements Document`,
    ``,
    `## Executive Summary`,
    `This document outlines the requirements for the following project: ${ideaText.slice(0, 400)}`,
    ``,
    `## Core Features`,
    lines.slice(0, 8).map((l) => `- ${l}`).join('\n'),
    ``,
    `## Technical Requirements`,
    `- Frontend: Web or Mobile Application`,
    `- Backend: RESTful API Server`,
    `- Database: Relational or NoSQL`,
    `- Hosting: Cloud (AWS / GCP / Azure) or VPS`,
    ``,
    `## Milestones & Deliverables`,
    `- Phase 1 (MVP): Core feature development — 4–8 weeks`,
    `- Phase 2 (Launch): QA, deployment, and handover — 2–4 weeks`,
    ``,
    `## Non-Functional Requirements`,
    `- Security: HTTPS, data encryption, role-based access`,
    `- Performance: Response time < 2s under normal load`,
    `- Scalability: Support growth in user base`,
  ].join('\n');
}

// ─── generateTitleAndDescription ─────────────────────────────────────────────
/**
 * Generates a title and description for a standard project posting.
 * ALWAYS returns a valid object — never throws.
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
  } catch (err) {
    console.warn('[generateTitleAndDescription] AI failed:', err.message);
  }

  // Local fallback
  const words = ideaText.trim().split(/\s+/);
  const shortTitle = words.slice(0, 6).join(' ');
  return {
    title: shortTitle.length > 5 ? shortTitle : 'Custom Software Project',
    description: ideaText,
  };
}

// ─── generateFullProjectDetails ───────────────────────────────────────────────
/**
 * Generates full project details: title, description, skills, budget, duration.
 * ALWAYS returns a valid object — never throws.
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
    if (text) {
      const parsed = safeJsonParse(text);
      if (parsed && parsed.title && parsed.description) {
        const descIsSameAsInput = parsed.description.trim() === ideaText.trim();
        const titleIsDefault = parsed.title === 'Untitled Project';
        if (!descIsSameAsInput && !titleIsDefault) {
          return {
            title: parsed.title,
            description: parsed.description,
            skills: Array.isArray(parsed.skills) ? parsed.skills : [],
            budget: Number(parsed.budget) || 5000,
            duration: parsed.duration || '1-3months',
          };
        }
      }
    }
  } catch (err) {
    console.warn('[generateFullProjectDetails] AI failed:', err.message);
  }

  // ── Local deterministic fallback ─────────────────────────────────────────
  console.log('[generateFullProjectDetails] All AI providers exhausted — using local fallback');
  const lower = ideaText.toLowerCase();
  const words = ideaText.trim().split(/\s+/);

  // Derive a title from the first 6–8 meaningful words
  const stopWords = new Set(['i', 'we', 'a', 'an', 'the', 'to', 'for', 'and', 'or', 'in', 'on', 'of', 'is', 'are', 'with', 'my', 'our']);
  const titleWords = words.filter((w) => !stopWords.has(w.toLowerCase())).slice(0, 6);
  const title = titleWords.length > 2
    ? titleWords.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
    : 'Custom Software Development Project';

  const description = [
    `I am looking for a skilled freelancer to help me with the following project:`,
    ``,
    ideaText.slice(0, 600),
    ``,
    `Please reach out if you have relevant experience and can deliver quality results on time.`,
    aiInstructions ? `\nAdditional notes: ${aiInstructions.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n');

  // Infer skills
  const skills = [];
  if (/website|web|react|angular|vue|html|css/.test(lower)) skills.push('Web Development');
  if (/mobile|android|ios|flutter|react native/.test(lower)) skills.push('Mobile App Development');
  if (/api|backend|node|python|django|express/.test(lower)) skills.push('Backend Development');
  if (/design|ui|ux|figma|photoshop/.test(lower)) skills.push('UI/UX Design');
  if (/database|sql|mongodb|postgres/.test(lower)) skills.push('Database Design');
  if (/payment|billing|invoice/.test(lower)) skills.push('Payment Integration');
  if (!skills.length) skills.push('Software Development', 'Web Development', 'API Integration');

  // Infer budget
  let budget = 15000;
  if (/enterprise|large|complex|multiple/.test(lower)) budget = 75000;
  else if (/simple|basic|small/.test(lower)) budget = 8000;

  // Infer duration
  let duration = '1-3months';
  if (/quick|fast|urgent|asap/.test(lower)) duration = '1-4weeks';
  else if (/large|enterprise|complex/.test(lower)) duration = '3+months';

  return { title, description, skills, budget, duration };
}
