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

// Short on-screen label for a scene, from its visual prompt
// ("Close-up of oats in a bowl" -> "Oats in a bowl").
function sceneLabel(visual, narration) {
  const clean = (visual || '')
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/^(opening|title card|close-up|close up|end card|show|text on screen|visual)[:\s-]*/i, '')
    .replace(/["']/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  if (words) return words.charAt(0).toUpperCase() + words.slice(1);
  const nw = (narration || '').replace(/[^A-Za-z0-9'’ -]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  return nw ? nw.charAt(0).toUpperCase() + nw.slice(1) : '';
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
  // Parse one answer into narration / visuals / sources.
  // NOTE: sections are split by heading LINES (a line that is exactly the
  // heading). The old regex stopped the narration at the first caps
  // sub-heading inside the text (e.g. "THE 5 FOODS:"), leaving only the
  // hook (~10 words ≈ 4 seconds of video) — and it could also match a
  // heading inside another word.
  const splitSections = (text, headings) => {
    const norm = (line) => line.trim().replace(/^[#*>\s]+/, '').replace(/[*#:.\s]+$/, '').toUpperCase();
    const sections = {};
    let current = null;
    const preamble = [];
    for (const line of text.split('\n')) {
      const h = headings.find((hh) => norm(line) === hh);
      if (h) { current = h; sections[current] = []; continue; }
      if (current) sections[current].push(line);
      else preamble.push(line);
    }
    const out = {};
    for (const h of headings) out[h] = (sections[h] || []).join('\n').trim();
    out.PREAMBLE = preamble.join('\n').trim();
    return out;
  };
  const parseAnswer = (text) => {
    const s = splitSections(text, ['NARRATION', 'VISUALS', 'SOURCES']);
    // If the model skipped the NARRATION heading, use the text before the
    // first heading rather than saving an empty script.
    const narration = (s.NARRATION || s.PREAMBLE).replace(/\n+/g, ' ').trim();
    const visuals = s.VISUALS;
    const sourcesText = s.SOURCES;
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
      // On-screen label from the scene itself ("Oats in a bowl"), not a
      // generic "Part 1" — the card should say what the scene is about.
      scene.heading = sceneLabel(scene.visual, scene.narration) || scene.heading;
    });
    return { narration, scenes, sources: sources.length ? sources : ['(No sources returned — add WHO/FAO/PubMed sources before uploading.)'] };
  };

  let parsed = parseAnswer(answer);
  const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
  const minWords = isShort ? 60 : 500;
  // Guard: if the model returned a stub (e.g. only the hook), ask once for
  // the full script instead of building a 4-second video out of it.
  if (wordCount(parsed.narration) < minWords) {
    console.log(`\nThe script came back very short (${wordCount(parsed.narration)} words) — asking for the full script once more...`);
    try {
      const retry = await askLLM(
        `The script you just wrote was only ${wordCount(parsed.narration)} words, which is too short. ` +
        (isShort
          ? `Please write the FULL YouTube Shorts script again: 30-45 seconds, about 90-110 spoken words, on "${project.topic}", with the same NARRATION / VISUALS / SOURCES headings.`
          : `Please write the FULL long-form script again: 6-12 minutes, about 900-1,500 spoken words, on "${project.topic}", with the same NARRATION / VISUALS / SOURCES headings.`),
      );
      const parsed2 = parseAnswer(retry);
      if (wordCount(parsed2.narration) > wordCount(parsed.narration)) {
        parsed = parsed2;
        console.log(`Full script received (${wordCount(parsed.narration)} words, about ${estimateDurationSec(parsed.narration)} seconds).`);
      }
    } catch (err) {
      console.log(`(Could not get a longer script: ${err.message} — keeping the short one. You can run step 2 again.)`);
    }
  }
  if (wordCount(parsed.narration) < minWords) {
    console.log(`\nNOTE: this script is only ${wordCount(parsed.narration)} words (about ${estimateDurationSec(parsed.narration)} seconds). ` +
      `A Short should be 90-110 words. Read it below — if it is too short, run step 2 again.`);
  }
  const { narration, scenes, sources } = parsed;

  const script = { title: project.topic, narration, scenes, sources, note: '' };
  project.script = script;
  project.narrationText = narration;
  project.scenes = scenes;
  project.status = 'script';
  saveProject(project);

  // Save a readable copy next to the project files (the script actually used).
  const dir = projectDir(project);
  fs.writeFileSync(path.join(dir, 'script.txt'),
    `NARRATION\n${narration}\n\nSOURCES\n${sources.join('\n')}\n`, 'utf8');
  return { script, usedAi: true, raw: answer };
}
