// config.js — reads the .env file and checks what is still missing.
// Everything in here is plain settings. No coding knowledge needed:
// to change the channel or the AI provider, edit the .env file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const CREDENTIALS_PATH = path.join(ROOT, 'credentials.json');
export const TOKEN_PATH = path.join(ROOT, 'token.json');

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  // ---- Channel (change these in .env to point at a different channel) ----
  channelId: env('CHANNEL_ID', 'UCjFTXuF1LhQdKsktFxPRKSw'),
  channelName: env('CHANNEL_NAME', 'Asif Ahmad Food Tech'),
  channelUrl: env('CHANNEL_URL', 'https://www.youtube.com/c/AsifAhmadfoodtech'),
  // ---- AI provider: gemini | openai | anthropic | openrouter | ollama ----
  llmProvider: env('LLM_PROVIDER', 'gemini').toLowerCase(),
  geminiKey: env('GEMINI_API_KEY'),
  geminiModel: env('GEMINI_MODEL', 'gemini-3.8-flash'),
  openaiKey: env('OPENAI_API_KEY'),
  openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini'),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest'),
  openrouterKey: env('OPENROUTER_API_KEY'),
  openrouterModel: env('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
  ollamaHost: env('OLLAMA_HOST', 'http://localhost:11434'),
  ollamaModel: env('OLLAMA_MODEL', 'llama3.1'),
  // ---- YouTube ----
  youtubeApiKey: env('YOUTUBE_API_KEY'),
  // OAuth sign-in for uploading. EITHER put credentials.json in this folder
  // OR fill in these two lines — no download needed. (SETUP-GUIDE.md, step 3)
  youtubeClientId: env('YOUTUBE_CLIENT_ID'),
  youtubeClientSecret: env('YOUTUBE_CLIENT_SECRET'),
  uploadPrivacy: env('UPLOAD_PRIVACY', 'private'), // private | unlisted | public
  playlistId: env('PLAYLIST_ID'),
  language: env('VIDEO_LANGUAGE', 'en'),
  // ---- Voice ----
  ttsVoice: env('TTS_VOICE', 'en-US-ChristopherNeural'),
};

// Which API key does the chosen provider need? Returns the key name or null.
export function llmKeyName() {
  switch (config.llmProvider) {
    case 'gemini': return 'GEMINI_API_KEY';
    case 'openai': return 'OPENAI_API_KEY';
    case 'anthropic': return 'ANTHROPIC_API_KEY';
    case 'openrouter': return 'OPENROUTER_API_KEY';
    case 'ollama': return null; // local, no key needed
    default: return 'GEMINI_API_KEY';
  }
}

export function hasLlmKey() {
  if (config.llmProvider === 'ollama') return true;
  const name = llmKeyName();
  return Boolean(process.env[name]);
}

export function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Friendly check of everything the agent needs. Returns a list of
// { item, ok, fix } rows so the menu can print them in plain English.
export function checkSetup() {
  const rows = [];
  const envExists = fs.existsSync(path.join(ROOT, '.env'));
  rows.push({
    item: '.env settings file',
    ok: envExists,
    fix: envExists ? 'Found.' : 'Copy .env.example to a new file called .env and fill in at least one API key. (SETUP-GUIDE.md, step 5)',
  });
  rows.push({
    item: `AI provider (${config.llmProvider}) key`,
    ok: hasLlmKey(),
    fix: hasLlmKey()
      ? `Key for ${config.llmProvider} is set.`
      : config.llmProvider === 'ollama'
        ? 'Ollama needs no key, but Ollama must be running on your computer. (SETUP-GUIDE.md, step 6)'
        : `Add ${llmKeyName()} to your .env file. (SETUP-GUIDE.md, step 4)`,
  });
  rows.push({
    item: 'YouTube API key (for research)',
    ok: Boolean(config.youtubeApiKey),
    fix: config.youtubeApiKey
      ? 'Set.'
      : 'Add YOUTUBE_API_KEY to .env to use Research. Without it you can still type a topic yourself. (SETUP-GUIDE.md, step 3)',
  });
  const creds = fs.existsSync(CREDENTIALS_PATH)
    || (Boolean(config.youtubeClientId) && Boolean(config.youtubeClientSecret));
  rows.push({
    item: 'YouTube sign-in details (for uploading)',
    ok: creds,
    fix: creds
      ? 'Found.'
      : 'Either save credentials.json in this folder, or add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env. (SETUP-GUIDE.md, step 3)',
  });
  const token = fs.existsSync(TOKEN_PATH);
  rows.push({
    item: 'YouTube sign-in (token.json)',
    ok: token,
    fix: token
      ? 'Signed in.'
      : 'Not signed in yet. The agent will show you a link to sign in the first time you upload. (SETUP-GUIDE.md, step 7)',
  });
  const ffmpeg = hasFfmpeg();
  rows.push({
    item: 'ffmpeg (for building videos)',
    ok: ffmpeg,
    fix: ffmpeg ? 'Found.' : 'ffmpeg is not installed or not in PATH. (SETUP-GUIDE.md, step 2)',
  });
  return rows;
}
