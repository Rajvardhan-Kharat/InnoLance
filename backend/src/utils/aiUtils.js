/**
 * aiUtils.js
 * Shared AI utility helpers used across multiple services and routes.
 * Eliminates code duplication between aiPrdGenerator.js and admin.js.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallbackChain, isTransientGeminiError } from '../services/llmFallback.js';

/**
 * Safely parse a JSON string that may be wrapped in markdown code fences.
 * Tries full parse first, then attempts to extract the first valid JSON object or array.
 * @param {string} text
 * @returns {any | null}
 */
export function safeJsonParse(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  // Strip common markdown code fence wrappers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting the first complete JSON object {...}
    const firstObj = cleaned.indexOf('{');
    const firstArr = cleaned.indexOf('[');
    const startIndex = firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)
      ? firstObj
      : firstArr;

    if (startIndex < 0) return null;
    const closeChar = cleaned[startIndex] === '{' ? '}' : ']';
    const candidate = cleaned.slice(startIndex);
    const lastClose = candidate.lastIndexOf(closeChar);
    if (lastClose < 0) return null;
    try {
      return JSON.parse(candidate.slice(0, lastClose + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Generate text via Gemini (with multi-model fallback + retries),
 * then fall through to the multi-provider chain (Groq → OpenRouter → HuggingFace → Cohere).
 * Returns raw text or null.
 * @param {string} prompt
 * @returns {Promise<string | null>}
 */
export async function generateTextWithAllProviders(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. Try Gemini models in order, with retries and exponential backoff
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
