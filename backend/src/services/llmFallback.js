/**
 * llmFallback.js
 * Multi-provider AI fallback chain: Groq → OpenRouter → HuggingFace → Cohere
 * Used as fallbacks when Gemini is unavailable or rate-limited.
 */

// ─── Transient error detection for Gemini ────────────────────────────────────
export function isTransientGeminiError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('503')
    || msg.includes('Service Unavailable')
    || msg.includes('high demand')
    || msg.includes('overloaded')
    || msg.includes('429')
    || msg.includes('Too Many Requests')
    || msg.includes('quota')
    || msg.includes('RESOURCE_EXHAUSTED')
    || msg.includes('rate limit')
  );
}

// ─── Helper: post to any OpenAI-compatible chat endpoint ─────────────────────
async function callOpenAICompatible({ url, apiKey, model, prompt, temperature = 0.2, systemPrompt = 'Return strict JSON only when requested.' }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status} from ${url}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

// ─── Provider 1: Groq ─────────────────────────────────────────────────────────
export async function generateWithGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  try {
    return await callOpenAICompatible({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey,
      model,
      prompt,
    });
  } catch (err) {
    console.warn('[LLM Fallback] Groq failed:', err.message);
    return null;
  }
}

// ─── Provider 2: OpenRouter (access to Claude, Mistral, Llama, etc.) ──────────
export async function generateWithOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  // Free-tier friendly models on OpenRouter
  const model = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5173',
        'X-Title': 'InnoLance Platform',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Return strict JSON only when requested.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[LLM Fallback] OpenRouter failed:', err.message);
    return null;
  }
}

// ─── Provider 3: HuggingFace Inference API ───────────────────────────────────
export async function generateWithHuggingFace(prompt) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return null;

  // Use a capable instruction-following model
  const model = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: `[INST] Return strict JSON only when requested.\n\n${prompt} [/INST]`,
        parameters: {
          max_new_tokens: 4096,
          temperature: 0.2,
          return_full_text: false,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HuggingFace error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    // HF returns array of generated_text
    const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
    return typeof text === 'string' ? text.trim() : null;
  } catch (err) {
    console.warn('[LLM Fallback] HuggingFace failed:', err.message);
    return null;
  }
}

// ─── Provider 4: Cohere Command ──────────────────────────────────────────────
export async function generateWithCohere(prompt) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.COHERE_MODEL || 'command-r',
        prompt: `Return strict JSON only when requested.\n\n${prompt}`,
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cohere error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    return data?.generations?.[0]?.text?.trim() || null;
  } catch (err) {
    console.warn('[LLM Fallback] Cohere failed:', err.message);
    return null;
  }
}

// ─── Master fallback chain ────────────────────────────────────────────────────
/**
 * Tries all configured fallback providers in order: Groq → OpenRouter → HuggingFace → Cohere
 * Returns the first successful response, or null if all fail.
 */
export async function generateWithFallbackChain(prompt) {
  const providers = [
    { name: 'Groq',         fn: () => generateWithGroq(prompt) },
    { name: 'OpenRouter',   fn: () => generateWithOpenRouter(prompt) },
    { name: 'HuggingFace',  fn: () => generateWithHuggingFace(prompt) },
    { name: 'Cohere',       fn: () => generateWithCohere(prompt) },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result && result.trim().length > 10) {
        console.log(`[LLM Fallback] Success via ${provider.name}`);
        return result;
      }
    } catch (err) {
      console.warn(`[LLM Fallback] ${provider.name} threw:`, err.message);
    }
  }

  console.error('[LLM Fallback] ALL providers exhausted — returning null');
  return null;
}
