// analytics.js — fetch simple performance numbers for a video and for the
// channel, and save them in data/analytics.json so you can see what works.
// Uses the YouTube Analytics API (needs the same sign-in as uploading).
import { google } from 'googleapis';
import { config } from './config.js';
import { getAuth } from './publish.js';
import { getChannelStats } from './research.js';
import { appendLog } from './store.js';

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function fetchVideoAnalytics(videoId, days = 7) {
  const auth = await getAuth();
  const analytics = google.youtubeAnalytics({ version: 'v2', auth });
  const res = await analytics.reports.query({
    ids: `channel==${config.channelId}`,
    startDate: isoDaysAgo(days),
    endDate: isoDaysAgo(0),
    metrics: 'views,likes,comments,estimatedMinutesWatched,subscribersGained,averageViewDuration',
    filters: `video==${videoId}`,
  });
  const row = res.data.rows?.[0];
  if (!row) {
    return { videoId, days, views: 0, likes: 0, comments: 0, minutesWatched: 0, subscribersGained: 0, averageViewDurationSec: 0, note: 'No data yet — YouTube needs a day or two after publishing.' };
  }
  const [views, likes, comments, minutesWatched, subscribersGained, avgView] = row;
  const result = {
    videoId, days,
    views: Number(views), likes: Number(likes), comments: Number(comments),
    minutesWatched: Number(minutesWatched), subscribersGained: Number(subscribersGained),
    averageViewDurationSec: Number(avgView),
  };
  appendLog('analytics', result);
  return result;
}

export async function fetchChannelOverview() {
  const stats = await getChannelStats();
  return stats;
}

export function printAnalytics(result) {
  console.log('\n--- Performance ---');
  console.log(`Video: ${result.videoId}`);
  console.log(`Last ${result.days} day(s):`);
  console.log(`  Views:                  ${result.views}`);
  console.log(`  Likes:                  ${result.likes}`);
  console.log(`  Comments:               ${result.comments}`);
  console.log(`  Watch time:             ${result.minutesWatched} minutes`);
  console.log(`  New subscribers:        ${result.subscribersGained}`);
  console.log(`  Average view duration:  ${Math.round(result.averageViewDurationSec)} seconds`);
  if (result.note) console.log(`\nNote: ${result.note}`);
}
