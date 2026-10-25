// seo.js — titles, description, hashtags and tags for a video.
// Uses the AI when a key is set, otherwise builds a solid template from
// the script itself. Nothing here invents facts: references come from the script.
import { askLLM, llmAvailable } from './llm.js';
import { config } from './config.js';
import { saveProject } from './store.js';

const FIXED_TAGS = ['Everyday Food Science', 'Food Science', 'Dr Asif Ahmad'];

function templateSeo(project) {
  const topic = project.topic;
  const titles = [
    `${topic} — Explained Simply`,
    `What Is ${topic}? The Food Science Behind It`,
    `${topic}: What Every Kitchen Should Know`,
  ];
  const chapters = (project.scenes || []).map((s, i) => {
    const min = Math.floor((i * (project.audioDurationSec || 60)) / Math.max(1, project.scenes.length) / 60);
    const sec = Math.round(((i * (project.audioDurationSec || 60)) / Math.max(1, project.scenes.length)) % 60);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${s.heading || `Part ${i + 1}`}`;
  });
  const sources = (project.script?.sources || []).filter(Boolean);
  const description =
    `${topic} — explained in simple words by ${config.channelName}.\n\n` +
    `In this video: ${(project.scenes || []).map((s) => s.heading).filter(Boolean).join(' | ') || topic}\n\n` +
    `TIMESTAMPS\n${chapters.join('\n') || '00:00 Introduction'}\n\n` +
    `SOURCES\n${sources.length ? sources.map((s) => `- ${s}`).join('\n') : '- (Add your sources here before uploading.)'}\n\n` +
    `${config.channelName} — Understand the science behind the food you eat.\n` +
    `Contact: asifahmad1@gmail.com\n${config.channelUrl}\n\n` +
    `#FoodScience #Nutrition #EverydayFoodScience`;
  const tags = [...new Set([topic, ...topic.split(/[\s,]+/).filter((w) => w.length > 3).slice(0, 6), ...FIXED_TAGS, 'Food Science Explained'])].slice(0, 15);
  return {
    titles,
    description,
    hashtags: ['#FoodScience', '#Nutrition', '#EverydayFoodScience'],
    tags,
    pinnedComment: 'Which part surprised you most? Tell me in the comments! 👇',
    note: 'TEMPLATE SEO — no AI key is set. Please read the titles and description and fix them before uploading.',
  };
}

export async function generateSeo(project) {
  if (!llmAvailable()) {
    const seo = templateSeo(project);
    project.seo = seo;
    project.status = project.status === 'video' ? 'video' : project.status;
    saveProject(project);
    return { seo, usedAi: false };
  }
  const isShort = project.type === 'short';
  const prompt =
    `You are the SEO expert for the YouTube channel "${config.channelName}".\n` +
    `Video topic: "${project.topic}" (${isShort ? 'a 30-45 second Short' : 'a 6-12 minute long video'}).\n` +
    `Script summary: ${(project.narrationText || '').slice(0, 800)}\n` +
    `Sources used: ${(project.script?.sources || []).join('; ') || 'none listed'}\n\n` +
    `Return exactly these sections, in plain text:\n` +
    `TITLES — 3 search-friendly title options, each under 70 characters, main keyword first, one emoji at the end of each.\n` +
    `DESCRIPTION — a full YouTube description: first 2 lines must contain the main keyword, then a short summary, then TIMESTAMPS (use the script sections), then a SOURCES list (only the real sources above — never invent one), then a subscribe line and the channel link ${config.channelUrl}.\n` +
    `HASHTAGS — 5 hashtags.\n` +
    `TAGS — exactly 15 tags, comma separated.\n` +
    `PINNED COMMENT — one short question to pin as the first comment, to start a conversation.`;
  const answer = await askLLM(prompt);
  const pick = (heading, fallback = '') => {
    const re = new RegExp(`${heading}\\s*[:\\n]+([\\s\\S]*?)(?=\\n[A-Z][A-Z ]{3,30}[:\\n]|$)`, 'i');
    const m = answer.match(re);
    return m ? m[1].trim() : fallback;
  };
  const titles = pick('TITLES').split('\n').map((t) => t.replace(/^[-•*\d.)\s"]+/, '').replace(/"$/g, '').trim()).filter((t) => t.length > 3).slice(0, 3);
  const description = pick('DESCRIPTION', '') || answer;
  const hashtags = pick('HASHTAGS').split(/[\s,]+/).filter((t) => t.startsWith('#')).slice(0, 5);
  const tags = pick('TAGS').split(',').map((t) => t.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 15);
  const pinnedComment = pick('PINNED COMMENT', 'Which part surprised you most? Tell me in the comments! 👇').split('\n')[0].trim();
  const seo = {
    titles: titles.length ? titles : templateSeo(project).titles,
    description,
    hashtags: hashtags.length ? hashtags : ['#FoodScience', '#Nutrition', '#EverydayFoodScience'],
    tags: tags.length ? tags : templateSeo(project).tags,
    pinnedComment,
    note: '',
  };
  project.seo = seo;
  saveProject(project);
  return { seo, usedAi: true, raw: answer };
}
