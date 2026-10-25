// index.js — Asif-YouTube-Agent main menu.
// Double-click Start-Agent.cmd (Windows) and follow the menu.
// Nothing is uploaded without you typing "yes" at the review screen.
import readline from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { config, checkSetup, ROOT } from './lib/config.js';
import { ensureDirs, listProjects, newProject, saveProject, projectDir } from './lib/store.js';
import { researchTopics } from './lib/research.js';
import { writeScript } from './lib/script.js';
import { generateVoiceover } from './lib/voice.js';
import { buildVideo } from './lib/video.js';
import { generateSeo } from './lib/seo.js';
import { uploadVideo } from './lib/publish.js';
import { fetchVideoAnalytics, fetchChannelOverview, printAnalytics } from './lib/analytics.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// A small line buffer so pasted input (many lines at once) is never lost:
// readline's question() drops lines that arrive while no question is pending,
// so we collect every line ourselves and hand them out in order.
let rlClosed = false;
const lineQueue = [];
let lineWaiter = null;
rl.on('line', (line) => {
  if (lineWaiter) { const resolve = lineWaiter; lineWaiter = null; resolve(line); }
  else lineQueue.push(line);
});
rl.on('close', () => {
  rlClosed = true;
  if (lineWaiter) { const resolve = lineWaiter; lineWaiter = null; resolve(''); }
});
const ask = (q) => {
  process.stdout.write(q);
  // Buffered lines first (they may have arrived before stdin closed),
  // then a fresh line, and only then give up if the input has ended.
  if (lineQueue.length) return Promise.resolve(lineQueue.shift());
  if (rlClosed) return Promise.resolve('');
  return new Promise((resolve) => { lineWaiter = resolve; });
};
const pause = async (msg = '\nPress Enter to continue...') => { await ask(msg); };

function line() { console.log('─'.repeat(60)); }

function printSetupBox() {
  const rows = checkSetup();
  const missing = rows.filter((r) => !r.ok);
  if (missing.length === 0) {
    console.log('Setup looks good — everything the agent needs is in place. ✅\n');
    return;
  }
  console.log('SETUP — a few things are still missing (the agent still works,');
  console.log('but some menu options will ask you to fix these first):\n');
  for (const r of rows) {
    console.log(`  ${r.ok ? '[OK]  ' : '[ !! ]'} ${r.item}`);
    if (!r.ok) console.log(`         -> ${r.fix}`);
  }
  console.log('\nFull step-by-step help: open SETUP-GUIDE.md in this folder.');
}

function pickProject() {
  const projects = listProjects();
  if (!projects.length) return null;
  return projects[projects.length - 1]; // most recent
}

async function chooseProject(action) {
  const projects = listProjects();
  if (!projects.length) {
    console.log(`\nNo videos yet. Start with "1 — Research topics" or "2 — Write script".`);
    return null;
  }
  console.log('\nYour videos:');
  projects.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.status}] (${p.type}) ${p.topic}`);
  });
  const n = await ask(`\nWhich one? (1-${projects.length}, or Enter for the newest): `);
  const idx = n.trim() === '' ? projects.length - 1 : Number(n.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
    console.log('That number is not on the list. Nothing was changed.');
    return null;
  }
  return projects[idx];
}

async function flowResearch() {
  line();
  console.log('1 — RESEARCH TOPICS');
  console.log('Find what people are searching for, and score the best ideas.\n');
  const seed = (await ask('Type a keyword to research (for example: fermentation, honey, protein): ')).trim();
  if (!seed) { console.log('No keyword typed. Back to the menu.'); return; }
  try {
    const { found, scored } = await researchTopics(seed);
    console.log('\nTop videos people are already watching:');
    found.slice(0, 5).forEach((v, i) => console.log(`  ${i + 1}. ${v.title} — ${v.views.toLocaleString()} views (${v.channel})`));
    console.log('\nScored ideas (best first):');
    scored.forEach((s, i) => {
      console.log(`\n  ${i + 1}. ${s.topic}`);
      console.log(`     Score: ${s.total}/100  (Demand ${s.demand} | Fit ${s.alignment} | Science ${s.validity})`);
      s.notes.forEach((n) => console.log(`     - ${n}`));
    });
    const pick = (await ask('\nType the number of an idea to use it (or press Enter to skip): ')).trim();
    const idx = Number(pick) - 1;
    if (pick && Number.isInteger(idx) && idx >= 0 && idx < scored.length) {
      const type = (await ask('Short (30-45 seconds) or Long (6-12 minutes)? Type short/long: ')).trim().toLowerCase();
      const project = newProject(scored[idx].topic, type === 'short' ? 'short' : 'long');
      console.log(`\nSaved as your current video: "${project.topic}" (${project.type}). Next step: 2 — Write script.`);
    }
  } catch (err) {
    console.log(`\nResearch could not run: ${err.message}`);
    console.log('You can still type a topic by hand: choose "2 — Write script" and enter it there.');
  }
  await pause();
}

async function flowScript() {
  line();
  console.log('2 — WRITE SCRIPT\n');
  let project = await chooseProject();
  if (!project) {
    const topic = (await ask('No video yet — type your video topic: ')).trim();
    if (!topic) { console.log('No topic typed. Back to the menu.'); return; }
    const type = (await ask('Short (30-45 seconds) or Long (6-12 minutes)? Type short/long: ')).trim().toLowerCase();
    project = newProject(topic, type === 'short' ? 'short' : 'long');
  }
  console.log(`\nWriting a ${project.type === 'short' ? 'Shorts' : 'long-form'} script for: "${project.topic}"`);
  console.log('This uses your AI provider (' + config.llmProvider + '). Please wait...');
  try {
    const { script, usedAi } = await writeScript(project);
    if (!usedAi) console.log(`\n${script.note}`);
    console.log('\n--- SCRIPT ---');
    console.log(script.narration);
    console.log('\n--- SOURCES ---');
    script.sources.forEach((s) => console.log(`- ${s}`));
    console.log(`\nSaved in: ${projectDir(project)}`);
    console.log('Next step: 3 — Generate voiceover.');
  } catch (err) {
    console.log(`\nThe script could not be written: ${err.message}`);
  }
  await pause();
}

async function flowVoice() {
  line();
  console.log('3 — GENERATE VOICEOVER\n');
  const project = await chooseProject();
  if (!project) return;
  if (!project.narrationText) { console.log('This video has no script yet. Run "2 — Write script" first.'); await pause(); return; }
  try {
    const { durationSec, usedTts } = await generateVoiceover(project);
    if (!usedTts) console.log('\nThe voiceover is silent audio (the voice service was unreachable). The video can still be built — subtitles carry the words.');
    console.log(`\nVoiceover ready (${Math.round(durationSec)} seconds). Next step: 4 — Build video.`);
  } catch (err) {
    console.log(`\nThe voiceover could not be made: ${err.message}`);
  }
  await pause();
}

async function flowVideo() {
  line();
  console.log('4 — BUILD VIDEO\n');
  const project = await chooseProject();
  if (!project) return;
  if (!project.audioPath) { console.log('This video has no voiceover yet. Run "3 — Generate voiceover" first.'); await pause(); return; }
  console.log(`Building the video for: "${project.topic}"`);
  console.log('Tip: to use your own pictures, put JPG/PNG files in this folder before building:');
  console.log(`  ${projectDir(project)}`);
  console.log('Otherwise the video uses simple title cards. Building now — please wait...\n');
  try {
    await buildVideo(project);
    console.log('\nNow generating the titles and description (SEO)...');
    const { seo, usedAi } = await generateSeo(project);
    if (!usedAi) console.log(`\n${seo.note}`);
    console.log('\n--- TITLE OPTIONS ---');
    seo.titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log('\n--- DESCRIPTION (first lines) ---');
    console.log(seo.description.split('\n').slice(0, 4).join('\n'));
    console.log(`\nTags: ${seo.tags.join(', ')}`);
    project.status = 'ready';
    saveProject(project);
    console.log('\nYour video package is ready. Next step: 5 — Review & upload.');
  } catch (err) {
    console.log(`\nThe video could not be built: ${err.message}`);
  }
  await pause();
}

async function flowReviewUpload() {
  line();
  console.log('5 — REVIEW & UPLOAD  (nothing uploads until you type "yes")\n');
  const project = await chooseProject();
  if (!project) return;
  if (!project.videoPath || !fs.existsSync(project.videoPath)) {
    console.log('This video is not built yet. Run "4 — Build video" first.');
    await pause();
    return;
  }
  console.log('=== PLEASE REVIEW EVERYTHING BELOW ===');
  console.log(`Topic:      ${project.topic}`);
  console.log(`Type:       ${project.type === 'short' ? 'Short (vertical)' : 'Long video'}`);
  console.log(`Video file: ${project.videoPath}`);
  console.log(`Thumbnail:  ${project.thumbnailPath}`);
  console.log(`Subtitles:  ${project.srtPath}`);
  console.log(`\nTitle:      ${(project.seo?.titles || ['(no title yet)'])[0]}`);
  console.log(`\nDescription:\n${project.seo?.description || '(no description yet)'}`);
  console.log(`\nTags: ${project.seo?.tags?.join(', ') || '(none)'}`);
  console.log(`\nScript (first 400 characters):\n${(project.narrationText || '').slice(0, 400)}...`);
  console.log(`\nSources:`);
  (project.script?.sources || ['(none listed)']).forEach((s) => console.log(`  - ${s}`));
  console.log(`\nPrivacy on upload: ${config.uploadPrivacy} (change UPLOAD_PRIVACY in .env)`);
  console.log('\nBefore you say yes, please check:');
  console.log('  1. Every fact in the script is true, and the sources are real.');
  console.log('  2. The title and description have no mistakes.');
  console.log('  3. You have the right to use any pictures in the video.');
  console.log('\nWatch the video file first if you can — open it from the folder above.');
  const answer = (await ask('\nType "yes" to upload this video to YouTube (anything else cancels): ')).trim().toLowerCase();
  if (answer !== 'yes') {
    console.log('\nCancelled. Nothing was uploaded. You can fix things and come back here.');
    await pause();
    return;
  }
  try {
    const { url } = await uploadVideo(project);
    console.log(`\nDone! Your video is live at: ${url}`);
  } catch (err) {
    console.log(`\nThe upload did not finish: ${err.message}`);
    console.log('Nothing was published. Check the message above and try again.');
  }
  await pause();
}

async function flowAnalytics() {
  line();
  console.log('6 — ANALYTICS (what is working?)\n');
  try {
    const stats = await fetchChannelOverview();
    console.log(`Channel: ${stats.name}`);
    console.log(`Subscribers: ${stats.subscribers.toLocaleString()} | Total views: ${stats.totalViews.toLocaleString()} | Videos: ${stats.videoCount}`);
  } catch (err) {
    console.log(`Channel numbers could not be read: ${err.message}`);
  }
  const projects = listProjects().filter((p) => p.youtubeVideoId);
  if (!projects.length) {
    console.log('\nNo uploaded videos yet, so there is no video performance to show.');
    await pause();
    return;
  }
  console.log('\nUploaded videos:');
  projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.topic} — ${p.youtubeUrl}`));
  const pick = (await ask('\nWhich video? (number, or Enter for the newest): ')).trim();
  const idx = pick === '' ? projects.length - 1 : Number(pick) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) { console.log('That number is not on the list.'); await pause(); return; }
  const days = (await ask('Last how many days? (1 or 7, default 7): ')).trim();
  const d = days === '1' ? 1 : 7;
  try {
    const result = await fetchVideoAnalytics(projects[idx].youtubeVideoId, d);
    printAnalytics(result);
  } catch (err) {
    console.log(`\nAnalytics could not be read: ${err.message}`);
    console.log('The first upload sign-in (menu 5) also unlocks analytics.');
  }
  await pause();
}

async function flowSettings() {
  line();
  console.log('7 — SETTINGS CHECK\n');
  console.log(`Channel:      ${config.channelName} (${config.channelId})`);
  console.log(`Channel URL:  ${config.channelUrl}`);
  console.log(`AI provider:  ${config.llmProvider} (model: ${config.llmProvider === 'gemini' ? config.geminiModel : config.llmProvider === 'openai' ? config.openaiModel : config.llmProvider === 'anthropic' ? config.anthropicModel : config.llmProvider === 'openrouter' ? config.openrouterModel : config.ollamaModel})`);
  console.log(`Voice:        ${config.ttsVoice}`);
  console.log(`Upload as:    ${config.uploadPrivacy}`);
  console.log(`Playlist:     ${config.playlistId || '(none set)'}`);
  console.log('');
  printSetupBox();
  await pause();
}

async function main() {
  ensureDirs();
  console.log('\n============================================================');
  console.log('  Asif-YouTube-Agent — simple YouTube automation');
  console.log(`  Channel: ${config.channelName}`);
  console.log('  Nothing is uploaded without your "yes" at the review step.');
  console.log('============================================================\n');
  printSetupBox();

  while (true) {
    line();
    console.log('MENU — what would you like to do?');
    console.log('  1  Research topics (find and score video ideas)');
    console.log('  2  Write script (Short or long video)');
    console.log('  3  Generate voiceover (free voice, no key needed)');
    console.log('  4  Build video (real MP4 + subtitles + thumbnail)');
    console.log('  5  Review & upload (you must type "yes")');
    console.log('  6  Analytics (views, likes, watch time)');
    console.log('  7  Settings check');
    console.log('  0  Exit');
    const choice = (await ask('\nType a number and press Enter: ')).trim();
    try {
      switch (choice) {
        case '1': await flowResearch(); break;
        case '2': await flowScript(); break;
        case '3': await flowVoice(); break;
        case '4': await flowVideo(); break;
        case '5': await flowReviewUpload(); break;
        case '6': await flowAnalytics(); break;
        case '7': await flowSettings(); break;
        case '0':
          console.log('\nGoodbye! Your work is saved in the data/ and output/ folders.');
          rl.close();
          return;
        default:
          console.log('Please type a number from the menu (0-7).');
      }
    } catch (err) {
      if (rlClosed && lineQueue.length === 0) {
        console.log('\nGoodbye! Your work is saved in the data/ and output/ folders.');
        rl.close();
        return;
      }
      console.log(`\nSomething went wrong: ${err.message}`);
      console.log('Your work is saved. Try again, or see SETUP-GUIDE.md — "What to do when it says…".');
      await pause();
    }
    if (rlClosed && lineQueue.length === 0) {
      console.log('\nGoodbye! Your work is saved in the data/ and output/ folders.');
      rl.close();
      return;
    }
  }
}

main();
