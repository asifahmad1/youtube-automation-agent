// store.js — tiny JSON storage. No database, no server.
// Everything the agent remembers lives as plain .json files in data/,
// so you can open them in Notepad any time.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, OUTPUT_DIR } from './config.js';

export function ensureDirs() {
  for (const dir of [DATA_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function filePath(name) {
  return path.join(DATA_DIR, name.endsWith('.json') ? name : `${name}.json`);
}

export function load(name, fallback) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(name, value) {
  ensureDirs();
  fs.writeFileSync(filePath(name), JSON.stringify(value, null, 2), 'utf8');
  return filePath(name);
}

// Append one entry to a JSON list file (used for logs).
export function appendLog(name, entry) {
  const list = load(name, []);
  list.push({ time: new Date().toISOString(), ...entry });
  save(name, list);
}

// ---- Projects ----
// A "project" is one video: topic, script, voiceover, video file, SEO, status.
export function listProjects() {
  return load('projects', []);
}

export function saveProject(project) {
  const projects = listProjects();
  const i = projects.findIndex((p) => p.id === project.id);
  if (i >= 0) projects[i] = project;
  else projects.push(project);
  save('projects', projects);
  return project;
}

export function newProject(topic, type) {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'video';
  const project = {
    id: `${stamp}-${slug}`,
    topic,
    type: type === 'short' ? 'short' : 'long', // 'short' = 30-45s vertical, 'long' = 6-12 min
    status: 'topic', // topic -> script -> voice -> video -> ready -> uploaded
    createdAt: now.toISOString(),
    script: null,
    narrationText: '',
    scenes: [],
    audioPath: '',
    audioDurationSec: 0,
    videoPath: '',
    thumbnailPath: '',
    srtPath: '',
    seo: null,
    youtubeVideoId: '',
    youtubeUrl: '',
  };
  return saveProject(project);
}

export function projectDir(project) {
  const dir = path.join(OUTPUT_DIR, project.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
