// llm.js — one small function per AI provider, all answering the same prompt.
// Choose the provider with one line in .env: LLM_PROVIDER=gemini
// (gemini | openai | anthropic | openrouter | ollama)
// No extra SDKs: every provider is called with the built-in fetch().
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT, llmKeyName } from './config.js';

export function loadSystemPrompt() {
  try {
    return fs.readFileSync(path.join(ROOT, 'prompts', 'asif_youtube_agent.md'), 'utf8');
  } catch {
    return 'You are Asif-YouTube-Agent, a helpful assistant for a food-science YouTube channel.';
  }
}

const SCIENCE_RULES = `
SCIENTIFIC INTEGRITY RULES (always follow):
- Only use facts you can trace to WHO, FAO, PubMed, or another authoritative source.
- Never invent statistics, study results, percentages, or quotes. If you are unsure, say so or leave it out.
- Every script must end with a "Sources" section listing the real sources used.
- Do not give medical advice or claim a food cures or treats a disease.
- Write in clear, simple English suitable for a general audience.
`;

async function fetchJson(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.error || data.message)) || text || res.statusText;
      throw new Error(`Request failed (${res.status}): ${String(msg).slice(0, 300)}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The AI provider took too long to answer (timeout). Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function askGemini(prompt) {
  if (!config.geminiKey) throw new Error(`No Gemini key found. Add GEMINI_API_KEY to your .env file (free at https://aistudio.google.com).`);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiKey}`;
  const body = {
    contents: [{ parts: [{ text: `${loadSystemPrompt()}\n${SCIENCE_RULES}\n\n${prompt}` }] }],
  };
  // Gemini can be slow or busy: allow 3 minutes per try and retry on
  // timeouts and 503 (high demand) errors, with a short wait between tries.
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 180000);
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
      if (!text) throw new Error('Gemini returned an empty answer. Please try again.');
      return text;
    } catch (err) {
      lastErr = err;
      const busy = err.message.includes('took too long') || err.message.includes('(503)');
      if (attempt < 3 && busy) {
        console.log(`Gemini is busy (attempt ${attempt} of 3) — waiting 20 seconds and trying again...`);
        await new Promise((r) => setTimeout(r, 20000));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function askOpenAI(prompt) {
  if (!config.openaiKey) throw new Error('No OpenAI key found. Add OPENAI_API_KEY to your .env file.');
  const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: `${loadSystemPrompt()}\n${SCIENCE_RULES}` },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned an empty answer. Please try again.');
  return text;
}

async function askAnthropic(prompt) {
  if (!config.anthropicKey) throw new Error('No Anthropic key found. Add ANTHROPIC_API_KEY to your .env file.');
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 4000,
      system: `${loadSystemPrompt()}\n${SCIENCE_RULES}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const text = data?.content?.map((b) => b.text).join('');
  if (!text) throw new Error('Anthropic returned an empty answer. Please try again.');
  return text;
}

async function askOpenRouter(prompt) {
  if (!config.openrouterKey) throw new Error('No OpenRouter key found. Add OPENROUTER_API_KEY to your .env file.');
  const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openrouterKey}`,
      'HTTP-Referer': 'https://github.com/asifahmad1/youtube-automation-agent',
      'X-Title': 'Asif-YouTube-Agent',
    },
    body: JSON.stringify({
      model: config.openrouterModel,
      messages: [
        { role: 'system', content: `${loadSystemPrompt()}\n${SCIENCE_RULES}` },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned an empty answer. Please try again.');
  return text;
}

async function askOllama(prompt) {
  const data = await fetchJson(`${config.ollamaHost.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      messages: [
        { role: 'system', content: `${loadSystemPrompt()}\n${SCIENCE_RULES}` },
        { role: 'user', content: prompt },
      ],
    }),
  }, 180000);
  const text = data?.message?.content;
  if (!text) throw new Error('Ollama returned an empty answer. Is Ollama running? Start it and pull a model, e.g. "ollama pull llama3.1".');
  return text;
}

// The one function the rest of the agent calls.
export async function askLLM(prompt) {
  switch (config.llmProvider) {
    case 'gemini': return askGemini(prompt);
    case 'openai': return askOpenAI(prompt);
    case 'anthropic': return askAnthropic(prompt);
    case 'openrouter': return askOpenRouter(prompt);
    case 'ollama': return askOllama(prompt);
    default:
      throw new Error(
        `LLM_PROVIDER is set to "${config.llmProvider}", which is not recognised. ` +
        `Use one of: gemini, openai, anthropic, openrouter, ollama. (Missing key name would be ${llmKeyName()}.)`,
      );
  }
}

export function llmAvailable() {
  if (config.llmProvider === 'ollama') return true; // local, no key
  return Boolean(process.env[llmKeyName()]);
}
