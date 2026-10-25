// research.js — find and score video topics.
// Uses the YouTube Data API v3 (needs YOUTUBE_API_KEY in .env).
// If there is no API key, the menu simply lets you type a topic yourself.
import { google } from 'googleapis';
import { config } from './config.js';
import { save } from './store.js';
import { askLLM, llmAvailable } from './llm.js';

function youtubeClient() {
  if (!config.youtubeApiKey) {
    throw new Error('No YouTube API key. Add YOUTUBE_API_KEY to your .env file (SETUP-GUIDE.md, step 3), or type your topic by hand instead.');
  }
  return google.youtube({ version: 'v3', auth: config.youtubeApiKey });
}

// Search YouTube for a keyword and return the top videos with view counts.
export async function searchYouTube(keyword, maxResults = 8) {
  const yt = youtubeClient();
  const res = await yt.search.list({
    part: ['snippet'],
    q: keyword,
    type: ['video'],
    order: 'viewCount',
    maxResults,
    relevanceLanguage: 'en',
  });
  const ids = (res.data.items || []).map((v) => v.id.videoId).filter(Boolean);
  let views = {};
  if (ids.length) {
    const stats = await yt.videos.list({ part: ['statistics'], id: ids });
    for (const v of stats.data.items || []) views[v.id] = Number(v.statistics?.viewCount || 0);
  }
  return (res.data.items || []).map((v) => ({
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    videoId: v.id.videoId,
    url: `https://youtu.be/${v.id.videoId}`,
    views: views[v.id.videoId] || 0,
  }));
}

// Basic channel facts (used by the Analytics menu too).
export async function getChannelStats() {
  const yt = youtubeClient();
  const res = await yt.channels.list({
    part: ['snippet', 'statistics'],
    id: [config.channelId],
  });
  const ch = res.data.items?.[0];
  if (!ch) throw new Error(`Channel ${config.channelId} was not found. Check CHANNEL_ID in your .env file.`);
  return {
    name: ch.snippet.title,
    subscribers: Number(ch.statistics.subscriberCount || 0),
    totalViews: Number(ch.statistics.viewCount || 0),
    videoCount: Number(ch.statistics.videoCount || 0),
  };
}

// Score one topic 0-100 on demand, channel fit and scientific validity.
export async function scoreTopic(topic, evidenceTitles = []) {
  let demand = 50;
  let alignment = 60;
  let validity = 70;
  let notes = [];
  const foodWords = ['food', 'nutrition', 'ferment', 'protein', 'vitamin', 'honey', 'milk', 'bread', 'salt', 'sugar', 'gut', 'diet', 'cook', 'preserv', 'spoil', 'fridge', 'microb', 'enzyme', 'fibre', 'fiber', 'aging', 'ageing'];
  if (foodWords.some((w) => topic.toLowerCase().includes(w))) {
    alignment = 90;
    notes.push('Strong fit with the food-science channel.');
  } else {
    notes.push('Topic is off the usual food-science theme — check the fit before making it.');
  }
  if (evidenceTitles.length > 0) {
    demand = 75;
    notes.push(`${evidenceTitles.length} similar videos found on YouTube — people are searching for this.`);
  } else {
    notes.push('No similar videos found in the search — could be a fresh angle, or low demand.');
  }
  if (llmAvailable()) {
    try {
      const answer = await askLLM(
        `Score this YouTube video topic for a food-science channel in one short paragraph, then give three numbers out of 100 on separate lines labelled Demand, Alignment, Validity: "${topic}". ` +
        `Evidence: similar videos found: ${evidenceTitles.slice(0, 5).join(' | ') || 'none'}. ` +
        `Validity means: can this be explained with solid WHO/FAO/PubMed-level science, or is it mostly myth?`,
      );
      const pick = (label) => {
        const m = answer.match(new RegExp(`${label}\\D{0,5}(\\d{1,3})`, 'i'));
        return m ? Math.max(0, Math.min(100, Number(m[1]))) : null;
      };
      demand = pick('Demand') ?? demand;
      alignment = pick('Alignment') ?? alignment;
      validity = pick('Validity') ?? validity;
      notes.push(answer.split('\n').find((l) => l.trim().length > 20) || '');
    } catch {
      notes.push('(AI scoring was not available, so the scores below are simple estimates.)');
    }
  } else {
    notes.push('(No AI key set, so the scores below are simple estimates.)');
  }
  const total = Math.round(demand * 0.4 + alignment * 0.35 + validity * 0.25);
  return { topic, demand, alignment, validity, total, notes: notes.filter(Boolean) };
}

// Research a seed keyword: search YouTube, build candidate topics, score them.
export async function researchTopics(seedKeyword) {
  console.log(`\nSearching YouTube for "${seedKeyword}" ...`);
  const found = await searchYouTube(seedKeyword, 8);
  const candidates = [...new Set(found.map((v) => v.title))].slice(0, 5);
  const scored = [];
  for (const title of candidates) {
    console.log(`  Scoring: ${title.slice(0, 70)}...`);
    scored.push(await scoreTopic(title, found.map((v) => v.title)));
  }
  scored.sort((a, b) => b.total - a.total);
  save('topics', { seedKeyword, searchedAt: new Date().toISOString(), found, scored });
  return { found, scored };
}
