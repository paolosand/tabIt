# tabIt privacy policy

Last updated: 2026-10-28

tabIt is a Chrome extension that shows guitar chords for the YouTube video you are watching. It works together with a small helper program that you install on your own Mac. This page says what each of them does with your data.

## The short version

- tabIt does not collect anything and does not send anything to the developer. There is no account, no analytics and no tracking.
- All of the work happens on your Mac.
- tabIt runs no servers of its own and uses no third-party services run by the developer.

## What the extension does

- It adds a bar under the video on youtube.com.
- When you ask for chords, it sends the video's address to the helper on your own computer (`http://localhost:28224`). It does not send it anywhere else.
- It stores two things in your browser through `chrome.storage`:
  - the chord charts you have asked for, for the length of your browser session (`chrome.storage.session`);
  - one flag saying the helper has been seen on your computer (`chrome.storage.local`, key `helperSeen`), so it can show the right message the next time.
- It does not read your browsing history, and it does not run on any site other than youtube.com.

## What the helper does (on your Mac)

- For a video you ask about, it downloads that video's audio from YouTube onto your Mac (using yt-dlp), works out the chords there, and keeps the finished chart in a folder on your Mac so the same song is instant next time. Charts are stored in `~/Library/Application Support/tabIt/charts`, and the log is in `~/Library/Logs/tabIt/helper.log`.
- The first time you set it up, it downloads the software it needs: the `uv` installer from astral.sh, Python and Python packages, a copy of ffmpeg and the chord model file (about 12 MB), from services such as GitHub, PyPI and astral.sh. These are ordinary downloads; they are not sent to the developer.
- It only accepts requests from your own computer.
- To remove the helper, run `~/.local/bin/tabit uninstall` in Terminal. It asks whether to delete your saved charts; run `~/.local/bin/tabit uninstall --purge` to delete them without asking. The installer also leaves the free `uv` tool in `~/.local/bin` and its download cache; delete those by hand if you want them gone.

## Who sees what

Your Mac contacts YouTube (to fetch the audio you asked for), and PyPI, GitHub (including raw.githubusercontent.com, where the chord model file is hosted) and astral.sh (during first-time setup). Those services see ordinary download requests from your computer, under their own privacy policies. The developer sees none of it.

## Platform

The helper works on macOS only for now.

## Contact

Questions: open an issue at https://github.com/paolosand/tabIt/issues
