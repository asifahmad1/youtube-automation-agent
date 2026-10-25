// video.js — build a real MP4 with ffmpeg.
// No paid keys needed: each scene becomes either a Ken Burns still (if you
// put JPG/PNG images in the project folder) or a simple coloured title card
// with the scene heading drawn on it. Subtitles are written to an .srt file
// and burned into the video when possible.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, hasFfmpeg } from './config.js';
import { saveProject, projectDir } from './store.js';
import { narrationToSrt, estimateDurationSec } from './script.js';

const execFileAsync = promisify(execFile);

const BRAND_GREEN = '0x103E32'; // deep green from the channel branding
const BRAND_GOLD = '0xD4A017';

// Find a font ffmpeg can use for on-screen text (Windows first, then Linux).
export function findFont() {
  const candidates = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Paths inside an ffmpeg filter must use forward slashes and an escaped
// drive colon: in a filter description ':' separates options and '\' is an
// escape character, so a raw Windows path like C:\Users\... breaks the
// filter parser ("No option name near ..."). The subtitles filter in
// buildVideo() already used this form; title cards and thumbnails did not.
function filterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

function wrapText(text, maxLen = 34) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxLen && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 4).join('\n');
}

// Make one title-card image (PNG) with centred text.
export async function makeTitleCard(text, outPng, { width = 1280, height = 720, bg = BRAND_GREEN } = {}) {
  const font = findFont();
  const textFile = outPng + '.txt';
  fs.writeFileSync(textFile, wrapText(text), 'utf8');
  const args = ['-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${width}x${height}:d=1`];
  if (font) {
    args.push('-vf', `drawtext=textfile='${filterPath(textFile)}':fontfile='${filterPath(font)}':fontsize=${Math.round(width / 22)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black`);
  }
  args.push('-frames:v', '1', outPng);
  await execFileAsync('ffmpeg', args);
  try { fs.unlinkSync(textFile); } catch { /* ignore */ }
  return outPng;
}

// Thumbnail: 1280x720 card with the title and a gold bar at the bottom.
export async function makeThumbnail(title, outPng) {
  const font = findFont();
  const textFile = outPng + '.txt';
  fs.writeFileSync(textFile, wrapText(title, 26), 'utf8');
  const args = ['-y', '-f', 'lavfi', '-i', `color=c=${BRAND_GREEN}:s=1280x720:d=1`];
  const filters = [];
  if (font) {
    filters.push(`drawtext=textfile='${filterPath(textFile)}':fontfile='${filterPath(font)}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-20:borderw=3:bordercolor=black`);
  }
  filters.push(`drawbox=x=0:y=660:w=1280:h=60:color=${BRAND_GOLD}:t=fill`);
  args.push('-vf', filters.join(','), '-frames:v', '1', outPng);
  await execFileAsync('ffmpeg', args);
  try { fs.unlinkSync(textFile); } catch { /* ignore */ }
  return outPng;
}

// Build the final MP4 for a project. Returns paths to video, thumbnail, SRT.
export async function buildVideo(project) {
  if (!hasFfmpeg()) {
    throw new Error('ffmpeg was not found. Install it first (SETUP-GUIDE.md, step 2) — the agent cannot build videos without it.');
  }
  if (!project.audioPath || !fs.existsSync(project.audioPath)) {
    throw new Error('There is no voiceover yet. Run "3 — Generate voiceover" first.');
  }
  const dir = projectDir(project);
  const isShort = project.type === 'short';
  const width = isShort ? 720 : 1280;
  const height = isShort ? 1280 : 720;
  const totalSec = Math.max(5, Math.round(project.audioDurationSec || estimateDurationSec(project.narrationText)));

  // 1) Subtitles file.
  const srtPath = path.join(dir, 'captions.srt');
  fs.writeFileSync(srtPath, narrationToSrt(project.narrationText || ''), 'utf8');

  // 2) One image per scene (Ken Burns still if provided, else title card).
  const sceneImages = [];
  const providedImages = fs.readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('thumb') && !f.startsWith('scene-'))
    .sort()
    .map((f) => path.join(dir, f));
  const scenes = project.scenes && project.scenes.length ? project.scenes : [{ heading: project.topic, narration: project.narrationText }];
  const perSceneSec = Math.max(3, Math.round(totalSec / scenes.length));
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imgPath = path.join(dir, `scene-${i + 1}.png`);
    if (providedImages[i]) {
      // Ken Burns: slow zoom on the provided still.
      const zoomed = path.join(dir, `scene-${i + 1}-zoom.mp4`);
      await execFileAsync('ffmpeg', ['-y', '-loop', '1', '-i', providedImages[i],
        '-vf', `scale=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0008,1.25)':d=${perSceneSec * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30`,
        '-t', String(perSceneSec), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', zoomed]);
      sceneImages.push(zoomed);
    } else {
      await makeTitleCard(scene.heading || project.topic, imgPath, { width, height });
      const still = path.join(dir, `scene-${i + 1}.mp4`);
      await execFileAsync('ffmpeg', ['-y', '-loop', '1', '-i', imgPath,
        '-t', String(perSceneSec), '-vf', `scale=${width}:${height}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', still]);
      sceneImages.push(still);
    }
    console.log(`  Scene ${i + 1}/${scenes.length} ready: ${scene.heading || ''}`);
  }

  // 3) Join the scene clips, add the voiceover, burn subtitles if possible.
  const listFile = path.join(dir, 'scenes.txt');
  fs.writeFileSync(listFile, sceneImages.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const joined = path.join(dir, 'joined.mp4');
  await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', joined]);

  const videoPath = path.join(dir, 'final-video.mp4');
  const srtForFilter = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
  const baseArgs = ['-y', '-i', joined, '-i', project.audioPath,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest'];
  try {
    // Try with burned-in subtitles first. (baseArgs = -y -i <video> -i <audio>
    // -map ... ; the -vf flag must go AFTER both -i inputs.)
    await execFileAsync('ffmpeg', [...baseArgs.slice(0, 5),
      '-vf', `subtitles='${srtForFilter}'`,
      ...baseArgs.slice(5), videoPath]);
    console.log('  Subtitles burned into the video.');
  } catch {
    console.log('  (Burned-in subtitles were not possible on this machine — the .srt file is still included for upload.)');
    await execFileAsync('ffmpeg', [...baseArgs, videoPath]);
  }

  // 4) Thumbnail.
  const thumbPath = path.join(dir, 'thumbnail.png');
  const seoTitle = project.seo?.titles?.[0] || project.topic;
  await makeThumbnail(seoTitle, thumbPath);

  project.videoPath = videoPath;
  project.thumbnailPath = thumbPath;
  project.srtPath = srtPath;
  project.status = 'video';
  saveProject(project);
  console.log(`\nVideo built: ${videoPath}`);
  console.log(`Thumbnail:   ${thumbPath}`);
  console.log(`Subtitles:   ${srtPath}`);
  return { videoPath, thumbnailPath: thumbPath, srtPath };
}
