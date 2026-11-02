# tabIt privacy policy

Last updated: 2026-11-02

tabIt is a Chrome extension that shows guitar chords for the YouTube video you are watching. It works together with a small helper program that you install on your own Mac. This page says what each of them does with your data.

## The short version

- Chord analysis runs entirely on your Mac. Your audio is never sent to the developer.
- By default tabIt sends nothing to the developer. There is no account and no tracking.
- Two things can send data to the developer, and both are your choice: the "Report bad transcription" button, and the "Help improve tabIt" setting, which is off until you turn it on. The sections below say exactly what each one sends.
- The data is used only to find songs tabIt gets wrong and to improve it. It is not sold and not used for ads.

## What you can choose to send

### The "Report bad transcription" button

When you click it, tabIt sends the developer:

- the video's ID and title, and the tabIt engine version;
- the full chart: the chords and their timing, the key, the tempo and the meter;
- a random install ID (see below);
- the time of the report, and a random report ID;
- the reason and note, if you add them afterwards (the reason is one of chords, key, tempo or other; the note is optional text you write). The random report ID is what links them to the report.

A report is sent even if "Help improve tabIt" is off, because clicking the button is your consent for that one report.

### The "Help improve tabIt" setting

It is in the chord panel and is off by default. When it is on:

- each time a song finishes analyzing, tabIt uploads the full chart (chords, timing, key, tempo and meter) with the video's title, once per video and engine version, plus a short record of the analysis: the video ID, the engine version, your install ID and the time. The uploaded chart and title are stored once per video and engine version and are not linked to your install ID; the analysis, failure and report records are;
- when an analysis fails, tabIt records the video ID, the engine version if known, your install ID, the time, a category (download failed, video unavailable, engine error or timeout) and a short error message. Home-directory paths are removed from that message and it is cut to 300 characters. Failures are recorded only while the setting is on. A helper that is simply not running is not recorded.

### What is never sent

Audio, your YouTube account details or cookies, your browsing history, and anything about your other tabs.

### The video ID reveals which video you analyzed

The video ID identifies the YouTube video, so what you send does tell the developer which videos you analyzed. Your name and account are not attached.

### The install ID

The first time you send a report or turn sharing on, tabIt creates a random ID (a UUID) and keeps it in your browser. It is not tied to a name, an email or a YouTube account. It lets the developer count unique users and see which uploads came from the same install. The extension does not display it.

### Where it is stored, and who sees it

Uploaded data is stored in Supabase, a hosted database service, and is read only by the developer.

### Turning it off, and deletion

Turning "Help improve tabIt" off stops future uploads. It does not delete anything already sent. You can ask for your data to be removed, but deletion is best-effort: what you sent is not tied to anything you can cite (the install ID is not shown in the extension). To ask, open an issue at https://github.com/paolosand/tabIt/issues that says only that you want your data removed. Please do not post video lists, dates or other personal details in the public issue; the developer will arrange a private way to exchange details.

## What the extension does

- It adds a bar under the video on youtube.com.
- When you ask for chords, it sends the video's address to the helper on your own computer (`http://localhost:28224`). That request goes nowhere else. Anything sent to the developer is only what is described under "What you can choose to send".
- It stores these things in your browser through `chrome.storage`:
  - the chord charts you have asked for, for the length of your browser session (`chrome.storage.session`);
  - one flag saying the helper has been seen on your computer (`chrome.storage.local`, key `helperSeen`), so it can show the right message the next time;
  - your "Help improve tabIt" choice and, once created, your random install ID (`chrome.storage.local`).
- It does not read your browsing history, and it does not run on any site other than youtube.com.

## What the helper does (on your Mac)

- For a video you ask about, it downloads that video's audio from YouTube onto your Mac (using yt-dlp), works out the chords there, and keeps the finished chart in a folder on your Mac so the same song is instant next time. Charts are stored in `~/Library/Application Support/tabIt/charts`, and the log is in `~/Library/Logs/tabIt/helper.log`.
- The first time you set it up, it downloads the software it needs: the `uv` installer from astral.sh, Python and Python packages, a copy of ffmpeg and the chord model file (about 12 MB), from services such as GitHub, PyPI and astral.sh. These are ordinary downloads; they are not sent to the developer.
- It only accepts requests from your own computer.
- To remove the helper, run `~/.local/bin/tabit uninstall` in Terminal. It asks whether to delete your saved charts; run `~/.local/bin/tabit uninstall --purge` to delete them without asking. The installer also leaves the free `uv` tool in `~/.local/bin` and its download cache; delete those by hand if you want them gone.

## Who sees what

Your Mac contacts YouTube (to fetch the audio you asked for), and PyPI, GitHub (including raw.githubusercontent.com, where the chord model file is hosted) and astral.sh (during first-time setup). Those services see ordinary download requests from your computer, under their own privacy policies. The developer does not see those requests. The developer sees only what you choose to send, as described above.

## Platform

The helper works on macOS only for now.

## Contact

Questions: open an issue at https://github.com/paolosand/tabIt/issues
