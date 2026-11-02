# Chrome Web Store listing

Paste each block into the matching Developer Dashboard field. Voice follows `PRODUCT.md`. Do not describe visual design here (the brand is being redrawn).

## Name

Taken from `extension/manifest.json`: **tabIt — chords for YouTube**

## Short description (limit 132 characters)

```
Chords for the song you're watching on YouTube, synced as it plays. Needs the free tabIt helper for Mac.
```

(104 characters; the Web Store limit is 132, unconfirmed against the current dashboard.)

## Detailed description

```
Requires the free tabIt helper for macOS (installed with one command).

tabIt shows the chords of the song you're watching on YouTube, right under the video, moving along with the music so you can play along on guitar.

Click "Get chords" under any YouTube video. tabIt listens to the audio itself and builds the chart, so it doesn't depend on somebody having already transcribed the song. Live versions, a friend's demo and your own recordings work too.

While the song plays:
- The current chord is easy to spot, and the next one is flagged before it arrives so your hands are ready.
- You also get the song's key and scales that fit it.
- The whole chart is one click away if you'd rather read ahead.

Honest about what it doesn't know: chord recognition is not perfect, and some songs will come out wrong. Where tabIt is unsure, the chord is shown softer instead of guessed at with false confidence. Treat it as a good starting point and trust your ears.

How setup works: the first time, the extension shows three steps. Open Terminal, paste one command, press Return. That installs the helper on your Mac (about 2 GB of disk: a 1 GB environment plus the download cache; a few minutes, no admin password). The analysis happens on your own computer, not in the cloud. After that it starts by itself when you log in.

Private by default: tabIt has no accounts and no tracking, and the analysis runs on your Mac. The helper downloads the audio of videos you ask about from YouTube onto your Mac, and keeps the finished charts there. Two optional things send data to the developer: the "Report bad transcription" button (that video's ID, title and chart) and "Help improve tabIt", which is off until you turn it on (the video ID and chart of each song you analyze, and which songs fail). Audio, account details and browsing history are never sent. See the privacy policy for details.

Works on macOS only for now.

The chord model is BTC (Park et al., ISMIR 2019). tabIt is open source: https://github.com/paolosand/tabIt
```

## Single purpose

```
Show guitar chords, synced to playback, for the YouTube video the user is watching.
```

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Keeps the chord charts the user asked for during the browser session (`chrome.storage.session`) and one flag that the tabIt helper has been seen on this computer (`chrome.storage.local`, key `helperSeen`), so the first-run message is shown correctly. |
| `http://localhost:28224/*` | The extension talks to the tabIt helper that the user installs on their own Mac, which listens only on this local address. It sends the video address and receives the chord chart. This request stays on the computer; the helper's own download of the requested video's audio is the only other traffic it causes. |
| Content script on `*://www.youtube.com/*` | Adds the chord bar under the video player and reads the current playback time to move along with the song. It runs only on YouTube. |

Remote code: **No, I am not using remote code.**

## Privacy policy URL

https://github.com/paolosand/tabIt/blob/main/PRIVACY.md

## Data usage disclosure (dashboard checkboxes)

The extension collects limited data, and only through two optional actions. The disclosures must match `PRIVACY.md`. The OWNER decides the exact checkboxes in the dashboard.

- What is collected: the video ID and title, the chord chart (chords, timing, key, tempo, meter), the engine version, a random install ID that is not tied to a name or account, a timestamp, and for failed analyses an error category and a short message with home-directory paths removed.
- When: when the user clicks "Report bad transcription" (that one report), or while the user has turned on "Help improve tabIt", which is off by default (opt-in).
- Never collected: audio, YouTube account details or cookies, browsing history, other tabs.
- Not sold, not used for ads, not used for creditworthiness or lending, not transferred except to the hosting provider that stores it (Supabase).
- Used only to find songs tabIt gets wrong and to improve tabIt.
- Likely dashboard categories: "Website content" (video ID and title) and "User activity" (which videos were analyzed), both optional. The owner confirms the mapping.

## Category

Music & Audio is not confirmed against the current dashboard list; choose the closest music or entertainment category when the draft is open.

## Assets

- Store icon 128x128: `extension/icons/icon-128.png`
- Screenshots: see `docs/store/screenshots.md`
- Promo video (YouTube, unlisted; the dashboard field takes a YouTube link, not a file): `https://www.youtube.com/watch?v=IlwDmLb8KxE` (uploaded as a Short, so the `/shorts/` form also works). If the dashboard rejects an unlisted video, make it public.
- Reviewer notes: `docs/store/reviewer-instructions.md`
