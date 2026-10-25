// voice.js — turn the script narration into spoken audio.
// Uses Microsoft Edge's free text-to-speech (edge-tts package, no key needed).
// If the voice service is unreachable, it falls back to a silent audio track
// of the right length so the video can still be built — and says so clearly.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { saveProject, projectDir } from './store.js';
import { estimateDurationSec } from './script.js';

const execFileAsync = promisify(execFile);

// NOTE: edge-tts ships its built code in out/index.js (its "main" points at a
// .ts file that Node cannot load directly), so we import the built file.
async function ttsToFile(text, outPath, voice) {
  const { tts } = await import('edge-tts/out/index.js');
  const buffer = await tts(text, { voice, rate: '+0%', pitch: '+0Hz' });
  fs.writeFileSync(outPath, buffer);
}

export async function getAudioDurationSec(file) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function makeSilentAudio(outPath, seconds) {
  await execFileAsync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(Math.max(3, seconds)), '-c:a', 'libmp3lame', '-q:a', '4', outPath,
  ]);
}

export async function generateVoiceover(project) {
  const dir = projectDir(project);
  const audioPath = path.join(dir, 'narration.mp3');
  const narration = (project.narrationText || '').trim();
  if (!narration) {
    throw new Error('There is no narration text yet. Run "2 — Write script" first.');
  }
  const estSec = estimateDurationSec(narration);
  console.log(`\nReading the script aloud (${narration.split(/\s+/).length} words, about ${estSec} seconds)...`);
  console.log(`Voice: ${config.ttsVoice} (change TTS_VOICE in .env to try another voice)`);
  try {
    await ttsToFile(narration, audioPath, config.ttsVoice);
    const duration = await getAudioDurationSec(audioPath);
    project.audioPath = audioPath;
    project.audioDurationSec = duration || estSec;
    project.status = 'voice';
    saveProject(project);
    console.log(`Voiceover saved: ${audioPath} (${Math.round(project.audioDurationSec)}s)`);
    return { audioPath, durationSec: project.audioDurationSec, usedTts: true };
  } catch (err) {
    console.log('\nThe free voice service could not be reached right now.');
    console.log(`Reason: ${err.message}`);
    console.log('The video will be built with silent audio instead, and the subtitles will still carry every word.');
    console.log('Tip: check your internet connection and try again later — the voice is free and needs no key.');
    await makeSilentAudio(audioPath, estSec);
    project.audioPath = audioPath;
    project.audioDurationSec = estSec;
    project.status = 'voice';
    saveProject(project);
    return { audioPath, durationSec: estSec, usedTts: false };
  }
}
