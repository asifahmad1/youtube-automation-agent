// publish.js — upload a finished video to YouTube with the official API.
// OAuth 2.0: the first upload shows you a link to sign in with Google;
// the sign-in is then saved in token.json so you do not repeat it.
// NOTHING uploads unless you type "yes" at the review screen in index.js.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { google } from 'googleapis';
import { config, CREDENTIALS_PATH, TOKEN_PATH } from './config.js';
import { saveProject, appendLog } from './store.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function loadCredentials() {
  // Option 1 (simplest for most people): the two values in .env.
  // No file download needed — copy them from the Google Cloud client page.
  if (config.youtubeClientId && config.youtubeClientSecret) {
    return {
      client_id: config.youtubeClientId,
      client_secret: config.youtubeClientSecret,
      redirect_uris: ['http://localhost'],
    };
  }
  // Option 2: the downloaded credentials.json file.
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'YouTube sign-in details were not found.\n' +
      'Either add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to your .env file,\n' +
      'or download credentials.json from Google Cloud (SETUP-GUIDE.md, step 3)\n' +
      'and save it in this folder as credentials.json.',
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const client = raw.installed || raw.web;
  if (!client || !client.client_id || !client.client_secret) {
    throw new Error('credentials.json does not look right — it should contain client_id and client_secret. Please re-download it from Google Cloud.');
  }
  return client;
}

export async function getAuth() {
  const client = loadCredentials();
  const { OAuth2 } = google.auth;
  const oAuth2Client = new OAuth2(client.client_id, client.client_secret, client.redirect_uris?.[0] || 'http://localhost');
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return oAuth2Client;
  }
  // First sign-in: show the link, the user pastes back the code.
  const url = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n--- YouTube sign-in (one time only) ---');
  console.log('1. Open this link in your browser:');
  console.log(`   ${url}`);
  console.log('2. Sign in with the Google account that owns the channel.');
  console.log('3. Google will show you a code. Copy it and paste it below.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let code = (await rl.question('\nPaste the code here: ')).trim();
  rl.close();
  // Accept the full localhost redirect URL too: Google sends the browser to
  // http://localhost/?code=... (which shows "can't reach this page" because
  // no server runs there) — the code is in the address bar, so pull it out.
  const m = code.match(/[?&]code=([^&\s]+)/);
  if (m) code = decodeURIComponent(m[1]);
  if (!code) throw new Error('No code was pasted. Upload cancelled — nothing was uploaded.');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('Signed in. Your sign-in is saved in token.json — you will not need to do this again.');
  return oAuth2Client;
}

export async function uploadVideo(project) {
  if (!project.videoPath || !fs.existsSync(project.videoPath)) {
    throw new Error('There is no finished video file yet. Run "4 — Build video" first.');
  }
  const auth = await getAuth();
  const youtube = google.youtube({ version: 'v3', auth });
  const seo = project.seo || {};
  const title = seo.titles?.[0] || project.topic;
  const description = seo.description || project.topic;
  const tags = seo.tags || [];
  console.log(`\nUploading "${title}" ... (this can take a few minutes for a long video)`);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: '27', // Education
        defaultLanguage: config.language,
        defaultAudioLanguage: config.language,
      },
      status: {
        privacyStatus: config.uploadPrivacy, // private | unlisted | public
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: fs.createReadStream(project.videoPath) },
  });
  const videoId = res.data.id;
  const url = `https://youtu.be/${videoId}`;
  console.log(`\nUploaded! Video ID: ${videoId}`);
  console.log(`Watch it here: ${url}`);
  console.log(`Privacy: ${config.uploadPrivacy}${config.uploadPrivacy === 'private' ? ' (only you can see it — change UPLOAD_PRIVACY in .env to "public" to publish openly)' : ''}`);

  // Thumbnail.
  if (project.thumbnailPath && fs.existsSync(project.thumbnailPath)) {
    try {
      await youtube.thumbnails.set({ videoId, media: { body: fs.createReadStream(project.thumbnailPath) } });
      console.log('Thumbnail uploaded.');
    } catch (err) {
      console.log(`Thumbnail could not be uploaded (${err.message}). You can add it by hand in YouTube Studio.`);
    }
  }
  // Playlist.
  if (config.playlistId) {
    try {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: { snippet: { playlistId: config.playlistId, resourceId: { kind: 'youtube#video', videoId } } },
      });
      console.log('Added to your playlist.');
    } catch (err) {
      console.log(`Could not add to playlist (${err.message}). The video itself is uploaded.`);
    }
  }
  // Pinned comment (only if the upload was public/unlisted and SEO provided one).
  if (seo.pinnedComment && config.uploadPrivacy !== 'private') {
    try {
      const comment = await youtube.commentThreads.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: seo.pinnedComment } } } },
      });
      const commentId = comment.data.id;
      // Pinning needs the comment id; if it fails, the comment is still there.
      try {
        await youtube.comments.setModerationStatus({ id: commentId, moderationStatus: 'published' });
      } catch { /* pinning is best-effort */ }
      console.log('Opening comment posted. (Pin it in YouTube Studio: Comments → three dots → Pin.)');
    } catch (err) {
      console.log(`Opening comment could not be posted (${err.message}). You can post it by hand.`);
    }
  }

  project.youtubeVideoId = videoId;
  project.youtubeUrl = url;
  project.status = 'uploaded';
  saveProject(project);
  appendLog('uploads', { projectId: project.id, topic: project.topic, videoId, url, privacy: config.uploadPrivacy });
  return { videoId, url };
}
