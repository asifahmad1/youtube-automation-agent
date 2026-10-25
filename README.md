# Asif-YouTube-Agent

A simple, menu-driven YouTube automation agent for a food-science channel.
You do **not** need to know how to code. You double-click one file, follow a
numbered menu, and the agent does the work. **Nothing is uploaded to YouTube
until you type `yes` at the review screen.**

## What it does

1. **Research** — searches YouTube for a keyword and scores video ideas
   (demand, channel fit, scientific validity).
2. **Script** — writes a Shorts script (30–45 seconds) or a long-form script
   (6–12 minutes) with timestamps and a Sources list.
3. **Voiceover** — reads the script aloud with a free voice (no key needed).
4. **Video** — builds a real MP4 with subtitles and a thumbnail using ffmpeg.
5. **Review & upload** — shows you everything first; uploads only after you
   type `yes`.
6. **Analytics** — shows views, likes, watch time and subscribers for your videos.

## Quick start (5 minutes, after the one-time setup)

1. Do the one-time setup in **SETUP-GUIDE.md** (install Node.js + ffmpeg,
   get a free Gemini key, get your YouTube credentials).
2. Double-click **`Start-Agent.cmd`** (Windows) or run `bash start-agent.sh`.
3. Follow the menu: 1 → 2 → 3 → 4 → 5.

## Files

| File / folder | What it is |
|---|---|
| `index.js` | The menu you see when the agent starts. |
| `lib/` | The agent's parts: `config` (settings), `llm` (AI providers), `research`, `script`, `voice`, `video`, `seo`, `publish`, `analytics`, `store` (saves your work). |
| `prompts/asif_youtube_agent.md` | The agent's instructions (the system prompt). |
| `.env.example` | Copy to `.env` and fill in your keys. |
| `data/` | Your saved videos, topics and logs (plain JSON files). |
| `output/` | Finished videos, voiceovers, thumbnails and subtitles. |
| `SETUP-GUIDE.md` | Full step-by-step setup guide for beginners. |

## Which AI writes the scripts?

Pick one in `.env` (`LLM_PROVIDER=`): **gemini** (free, recommended),
openai, anthropic, openrouter, or **ollama** (runs on your own computer, no key).

## Safety

- Uploads are **private by default** (`UPLOAD_PRIVACY=private` in `.env`).
- Every script must list its sources, and the AI is told never to invent
  statistics. Always read the script at the review screen before you say yes.
- Your keys stay in `.env`, `credentials.json` and `token.json` on your own
  computer. They are never uploaded to GitHub (see `.gitignore`).

## Need help?

Open **SETUP-GUIDE.md** and look at the table "What to do when it says…".
