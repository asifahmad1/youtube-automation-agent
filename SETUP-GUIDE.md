# SETUP-GUIDE.md — Asif-YouTube-Agent, step by step

**Who this is for:** someone with no programming background. Every step tells
you exactly what to click. If a step asks you to type something, the exact
text is shown in a grey box. Take your time — you only do this setup once.

**What you need:** a Windows laptop, an internet connection, a Google account
(the one that owns your YouTube channel), and about 30–45 minutes.

---

## Step 1 — Install Node.js (the engine that runs the agent)

1. Open your browser and go to **https://nodejs.org**
2. Click the big button that says **LTS** (it means "long-term support" — the
   stable version). Download the `.msi` file for Windows.
3. Double-click the downloaded file. Click **Next, Next, Next, Install**.
   Leave every tick-box as it is. Click **Finish**.
4. **Check it worked:** press `Windows key + R`, type `cmd`, press Enter.
   In the black window type exactly this and press Enter:

   ```
   node --version
   ```

   You should see something like `v22.14.0`. If you see "not recognized",
   close the black window, restart your computer once, and try again.

## Step 2 — Install ffmpeg (the tool that builds the videos)

ffmpeg turns the script, voice and pictures into a real MP4 video.

**Easiest way (Windows 10/11):**

1. In the same black window (`cmd`), type exactly this and press Enter:

   ```
   winget install Gyan.FFmpeg
   ```

2. When it finishes, **close the black window and open a new one**, then type:

   ```
   ffmpeg -version
   ```

   You should see a few lines starting with `ffmpeg version`. That means it worked.

**If `winget` says it cannot find the package**, use the manual way:

1. Go to **https://www.gyan.dev/ffmpeg/builds/** and download
   `ffmpeg-release-essentials.zip`.
2. Right-click the zip → **Extract All** → extract to `C:\ffmpeg`.
3. Add it to PATH: press `Windows key`, type `environment variables`, open
   **"Edit the system environment variables"** → **Environment Variables** →
   under "System variables" double-click **Path** → **New** → type
   `C:\ffmpeg\bin` → **OK** on every window.
4. Close and reopen the black window, then check with `ffmpeg -version`.

## Step 3 — Connect the agent to YouTube (Google Cloud, free)

This gives the agent permission to search YouTube, upload videos and read
analytics. You do it once in your browser.

1. Go to **https://console.cloud.google.com** and sign in with the Google
   account that owns your YouTube channel.
2. At the top, click the project dropdown → **New Project**. Name it
   `Asif YouTube Agent`. Click **Create**. Wait a few seconds, then make sure
   this project is selected at the top.
3. On the left menu, open **APIs & Services → Library**. Search for and enable
   these three, one at a time (click the name, then the blue **Enable** button):
   - **YouTube Data API v3**
   - **YouTube Analytics API**
4. Still in **APIs & Services**, open **Credentials** (left menu).
5. Click **+ CREATE CREDENTIALS → API key**. A key appears — copy it.
   (You will paste it into `.env` in step 5 as `YOUTUBE_API_KEY`.)
   Optional but recommended: click **Restrict key** and tick only
   "YouTube Data API v3", then Save.
6. Click **+ CREATE CREDENTIALS → OAuth client ID**.
   - If Google asks you to "Configure consent screen" first: choose
     **External**, fill in App name `Asif YouTube Agent`, your email, and
     click Save on each screen. On the **Scopes** screen you may add the
     scopes `.../auth/youtube.upload` and `.../auth/yt-analytics.readonly`
     (or skip — the agent will still ask for them at sign-in).
   - On the **Test users** screen, add your own Google email address and Save.
     (Until the app is "published", only test users can sign in — you are one.)
   - Application type: choose **Desktop app**. Name it `Asif YouTube Agent`.
     Click **Create**.
7. Click **Download JSON** on the client you just created. Save the file as
   **`credentials.json`** inside the `youtube-automation-agent` folder
   (the same folder as `Start-Agent.cmd`).

> **Important:** `credentials.json` is like a password for your channel.
> Never email it to anyone and never upload it to GitHub. The agent keeps it
> only on your computer.

## Step 4 — Get a free Gemini key (the AI that writes scripts)

1. Go to **https://aistudio.google.com** and sign in with your Google account.
2. Click **Get API key** (left menu or the button at the top).
3. Click **Create API key**. Copy the key (it starts with `AIza`).
4. You will paste it into `.env` in the next step as `GEMINI_API_KEY`.

(If you prefer a different AI, see `.env.example` — OpenAI, Anthropic,
OpenRouter and Ollama are all supported. Gemini is free and is the default.)

## Step 5 — Fill in your settings (`.env`)

1. In the `youtube-automation-agent` folder, find the file **`.env.example`**.
2. Copy it (right-click → Copy, then Paste in the same folder) and rename the
   copy to exactly **`.env`** (just `.env` — nothing before the dot).
3. Open `.env` in Notepad. Fill in at least these two lines:

   ```
   GEMINI_API_KEY=AIza...your key from step 4...
   YOUTUBE_API_KEY=AIza...your key from step 3...
   ```

   Leave the other lines as they are. Save the file (Ctrl+S).

**To use the Everyday Food Science channel instead of Asif Ahmad Food Tech:**
change these three lines in `.env`:

```
CHANNEL_ID=UCYR1I8umpYZ4-Xg7t0BEItw
CHANNEL_NAME=Everyday Food Science
CHANNEL_URL=https://www.youtube.com/channel/UCYR1I8umpYZ4-Xg7t0BEItw
```

## Step 6 — First run

1. Double-click **`Start-Agent.cmd`**. The first run installs the needed
   packages (about a minute — you need internet).
2. The agent opens and shows a **Settings check**. Every line should say
   `[OK]`. If a line says `[ !! ]`, read the line under it — it tells you
   exactly what to fix.
3. Choose **7 — Settings check** any time to see this list again.

## Step 7 — Your first video (the normal workflow)

1. **1 — Research topics** → type a keyword, for example `fermentation` →
   pick the best-scored idea → choose `short` or `long`.
2. **2 — Write script** → read the script on screen. Fix anything wrong by
   editing `output/<video-folder>/script.txt` in Notepad, then continue.
   (The agent uses the saved script from the project file.)
3. **3 — Generate voiceover** → the agent reads the script aloud. Free, no key.
4. **4 — Build video** → the agent builds the MP4, subtitles and thumbnail.
   Tip: before this step, you can drop your own JPG/PNG pictures into the
   video's `output/<video-folder>/` folder and they will be used as scenes.
5. **5 — Review & upload** → **read everything on the review screen.**
   Check the facts and the sources. Open the video file and watch it.
   Only when you are happy, type exactly `yes` and press Enter.
   The video uploads as **private** by default, so only you can see it until
   you change it to Public in YouTube Studio.
6. **6 — Analytics** → after a day or two, check views and watch time.

## Step 8 — Putting the agent on GitHub (optional)

1. Create a new empty repository on GitHub (for example
   `youtube-automation-agent`). Do **not** add a README there — the agent
   already has one.
2. In the black window (`cmd`), go to the agent folder and run:

   ```
   cd C:\path\to\youtube-automation-agent
   git init
   git add .
   git commit -m "Asif-YouTube-Agent v1.0"
   git branch -M main
   git remote add origin https://github.com/asifahmad1/youtube-automation-agent.git
   git push -u origin main
   ```

   The `.gitignore` file already keeps your keys and videos out of GitHub.

## Step 9 — Linking it on your website (optional)

On your Wix site, add a button or a text link to the GitHub repository, for
example with the text **"YouTube Automation Agent (GitHub)"** pointing to
`https://github.com/asifahmad1/youtube-automation-agent`.

---

## What to do when it says…

| Message / problem | What it means | What to do |
|---|---|---|
| `Node.js is not installed` | Node.js is missing or the computer was not restarted after installing it. | Install Node.js LTS (step 1), restart the computer, try again. |
| `ffmpeg was not found` / `ffmpeg is not recognized` | ffmpeg is not installed or not in PATH. | Do step 2 again. Close and reopen the black window after installing. |
| `No Gemini key found` / `No ... key found` | The `.env` file has no key for the chosen AI provider. | Open `.env` in Notepad and paste the key (step 4). Check there are no spaces around the `=`. |
| `LLM_PROVIDER is not recognised` | The provider name in `.env` is misspelled. | Use exactly one of: `gemini`, `openai`, `anthropic`, `openrouter`, `ollama` (all lower-case). |
| `No YouTube API key` | `YOUTUBE_API_KEY` is empty in `.env`. | Add the API key from step 3. Research will not work without it, but you can still type topics by hand in menu 2. |
| `credentials.json was not found` | The Google file is missing or named differently. | Download it again (step 3, point 7) and save it as exactly `credentials.json` in the agent folder. |
| `redirect_uri_mismatch` when signing in | The OAuth client type is wrong. | In Google Cloud, the OAuth client must be **Desktop app**, not Web. Create a new one and download its JSON. |
| `access_blocked` / "This app isn't verified" | Google shows a warning for unverified apps. | Click **Advanced → Go to Asif YouTube Agent (unsafe)**. It is your own app. Make sure your email is added as a Test user (step 3, point 6). |
| `quota exceeded` / `403` from YouTube | YouTube's daily free limit (10,000 units) is used up. | Wait until tomorrow. Uploads cost about 1,600 units each, searches cost 100. Do not run Research many times in a row. |
| `The free voice service could not be reached` | No internet, or Microsoft's voice service is temporarily down. | The video is still built with silent audio and subtitles. Check your internet and run menu 3 again later. |
| `The video could not be built` (other error) | ffmpeg hit a problem — the message above it says which. | Check that ffmpeg works (`ffmpeg -version`), and that the video folder has no strange file names. |
| `The upload did not finish` | Sign-in problem or a network break. | Nothing was published. Run menu 5 again. If it asks you to sign in again, delete `token.json` and sign in fresh. |
| The black window closes immediately | The agent crashed before it could print anything. | Open `cmd`, go to the folder (`cd C:\path\to\youtube-automation-agent`), type `node index.js` and read the error. |
| `Error: listen EADDRINUSE` or port errors | Not used by this agent — ignore unless you see it. | Close other copies of the agent and try again. |

## Daily use — the short version

Double-click `Start-Agent.cmd` → `1` research → `2` script → `3` voice →
`4` build → `5` review and type `yes` → `6` check analytics tomorrow.
Your finished videos live in `output/`, your records in `data/`.
