// script.js — write a video script with the AI, or from a plain template
// when no AI key is set. Every script ends with a Sources section and
// keeps narration separate from on-screen visual notes.
import { askLLM, llmAvailable } from './llm.js';
import { config } from './config.js';
import { saveProject, projectDir } from './store.js';
import fs from 'node:fs';
import path from 'node:path';

// Split narration text into subtitle lines (~7 words each) with timings.
export function narrationToSrt(narration, startSec = 0) {
  const words = narration.split(/\s+/).filter(Boolean);
  const wordsPerSec = 2.5; // ~150 words per minute
  const lines = [];
  for (let i = 0; i < words.length; i += 7) {
    lines.push(words.slice(i, i + 7).join(' '));
  }
  const fmt = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    const ms = String(Math.round((s % 1) * 1000)).padStart(3, '0');
    return `${h}:${m}:${sec},${ms}`;
  };
  let t = startSec;
  return lines.map((line, i) => {
    const dur = Math.max(1, line.split(' ').length / wordsPerSec);
    const out = `${i + 1}\n${fmt(t)} --> ${fmt(t + dur)}\n${line}\n`;
    t += dur + 0.15;
    return out;
  }).join('\n');
}

export function estimateDurationSec(narration) {
  const words = narration.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 2.5));
}

function templateScript(project) {
  const { topic, type } = project;
  if (type === 'short') {
    const narration =
      `Did you know ${topic}? ` +
      `Here is the simple science behind it. ` +
      `Food works the same way in your kitchen as it does in a laboratory — ` +
      `small changes in heat, water, or time change everything. ` +
      `Try it yourself, and tell me in the comments what surprised you most. ` +
      `Follow Everyday Food Science for one food mystery every day.`;
    return {
      title: topic,
      narration,
      scenes: [
        { heading: 'Hook', narration: `Did you know ${topic}?`, visual: 'Title card with the question in large text.' },
        { heading: 'The science', narration: narration.split('. ')[1] + '. ' + narration.split('. ')[2] + '.', visual: 'Simple kitchen demo or title card with key words.' },
        { heading: 'Try it + CTA', narration: 'Try it yourself, and tell me in the comments what surprised you most. Follow Everyday Food Science for one food mystery every day.', visual: 'Subscribe end card.' },
      ],
      sources: ['(Add your sources here — WHO, FAO, or a PubMed article — before uploading.)'],
      note: 'TEMPLATE SCRIPT — no AI key is set, so this is a starter script. Please read it, fix the facts, and add real sources before uploading.',
    };
  }
  const narration =
    `Welcome back to ${config.channelName}. Today we explain ${topic} — ` +
    `what it is, why it happens, and what it means for the food on your plate. ` +
    `First, the basic science. Every food is made of water, proteins, fats, and carbohydrates, ` +
    `and heat, time, and acidity change how they behave. ` +
    `Second, a simple example you can see in your own kitchen. ` +
    `Third, what this means for your health and your cooking. ` +
    `And finally, the three things to remember. ` +
    `If this helped you, please subscribe — one food mystery, explained simply, every day.`;
  return {
    title: topic,
    narration,
    scenes: [
      { heading: 'Introduction (0:00)', narration: `Welcome back to ${config.channelName}. Today we explain ${topic}.`, visual: 'Title card.' },
      { heading: 'The basic science', narration: 'First, the basic science. Every food is made of water, proteins, fats, and carbohydrates, and heat, time, and acidity change how they behave.', visual: 'Title card with the four building blocks listed.' },
      { heading: 'A kitchen example', narration: 'Second, a simple example you can see in your own kitchen.', visual: 'Title card: "Try this at home".' },
      { heading: 'What it means for you', narration: 'Third, what this means for your health and your cooking.', visual: 'Title card with three takeaways.' },
      { heading: 'Summary + subscribe', narration: 'If this helped you, please subscribe — one food mystery, explained simply, every day.', visual: 'Subscribe end card.' },
    ],
    sources: ['(Add your sources here — WHO, FAO, or a PubMed article — before uploading.)'],
    note: 'TEMPLATE SCRIPT — no AI key is set, so this is a starter script. Please read it, fix the facts, and add real sources before uploading.',
  };
}

export async function writeScript(project) {
  if (!llmAvailable()) {
    const script = templateScript(project);
    project.script = script;
    project.narrationText = script.narration;
    project.scenes = script.scenes;
    project.status = 'script';
    saveProject(project);
    return { script, usedAi: false };
  }

  const isShort = project.type === 'short';
  const prompt = isShort
    ? `Write a YouTube Shorts script (30-45 seconds, about 90-110 spoken words) on this topic: "${project.topic}".\n` +
      `Structure: 1) a 3-second hook that asks a surprising question, 2) ONE clear scientific explanation in simple words, 3) a short call to action asking viewers to comment and subscribe.\n` +
      `Also give: a) 3 short on-screen visual prompts (one per part), b) a "Sources" list of 2-3 real authoritative sources (WHO, FAO, PubMed) that support the facts — never invent a source or a statistic.\n` +
      `Return the script as plain text with these headings: NARRATION, VISUALS, SOURCES.`
    : `Write a long-form YouTube script (6-12 minutes, about 900-1,500 spoken words) on this topic: "${project.topic}" for the channel "${config.channelName}".\n` +
      `Structure: 1) hook (first 20 seconds), 2) introduction, 3) 3-4 sections with clear headings and timestamps, 4) practical takeaways, 5) summary and subscribe call to action.\n` +
      `Also give: a) a visual prompt for each section (what should appear on screen), b) a "Sources" list of 3-5 real authoritative sources (WHO, FAO, PubMed) that support the facts — never invent a source or a statistic.\n` +
      `Return the script as plain text with these headings: NARRATION, VISUALS, SOURCES.`;

  const answer = await askLLM(prompt);
  const pick = (heading, fallback = '') => {
    const re = new RegExp(`${heading}\\s*[:\\n]+([\\s\\S]*?)(?=\\n[A-Z][A-Z ]{3,30}[:\\n]|$)`, 'i');
    const m = answer.match(re);
    return m ? m[1].trim() : fallback;
  };
  const narration = pick('NARRATION', answer).replace(/\n+/g, ' ').trim();
  const visuals = pick('VISUALS', '');
  const sourcesText = pick('SOURCES', '');
  const sources = sourcesText.split('\n').map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter((s) => s.length > 3);
  // Turn visual prompts into scenes by splitting on lines.
  const visualLines = visuals.split('\n').map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter((s) => s.length > 3);
  const scenes = visualLines.length
    ? visualLines.map((v, i) => ({ heading: `Part ${i + 1}`, narration: '', visual: v }))
    : [{ heading: 'Full script', narration, visual: 'Title cards + narration.' }];
  // Distribute narration across scenes roughly evenly for the video builder.
  const sentences = narration.match(/[^.!?]+[.!?]+["']?/g) || [narration];
  const perScene = Math.max(1, Math.ceil(sentences.length / scenes.length));
  scenes.forEach((scene, i) => {
    scene.narration = sentences.slice(i * perScene, (i + 1) * perScene).join(' ');
  });

  const script = { title: project.topic, narration, scenes, sources: sources.length ? sources : ['(No sources returned — add WHO/FAO/PubMed sources before uploading.)'], note: '' };
  project.script = script;
  project.narrationText = narration;
  project.scenes = scenes;
  project.status = 'script';
  saveProject(project);

  // Save a readable copy next to the project files.
  const dir = projectDir(project);
  fs.writeFileSync(path.join(dir, 'script.txt'), answer, 'utf8');
  return { script, usedAi: true, raw: answer };
}
