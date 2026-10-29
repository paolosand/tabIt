<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img src="docs/assets/logo-light.svg" alt="tabIt" width="340">
</picture>

**paste a song, follow the chords, play along**

Turn any song on YouTube into synced, play-along guitar chords, embedded right under the
video you're watching: the chords, the key, and scales that fit, followed karaoke-style as
the music plays.

**v0.5.1** · submitted to the Chrome Web Store, awaiting review

[![CI](https://github.com/paolosand/tabIt/actions/workflows/ci.yml/badge.svg)](https://github.com/paolosand/tabIt/actions/workflows/ci.yml) ![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?logo=googlechrome&logoColor=white) ![License: MIT](https://img.shields.io/badge/License-MIT-fadc7d)

</div>

<p align="center"><img src="docs/assets/extension-demo.gif" alt="Live demo of the tabIt Chrome extension on youtube.com: clicking the Get chords bar under the video walks through fetch audio, find chords and build chart, then a beat ribbon sweeps chord to chord in time with the song, showing the current chord, the next chord, and key, tempo, and scale chips" width="60%"></p>

## Get started

You need a Mac (Apple Silicon or Intel), Chrome, and about 3 GB of free disk space.

**1. Install the helper.** It runs the analysis on your own Mac. Open Terminal, paste this,
and press Return (a few minutes, no admin password):

```bash
curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh
```

**2. Add the extension.** The Chrome Web Store listing is in review. Until it's live,
download `tabit-extension-v0.5.1.zip` from the
[latest release](https://github.com/paolosand/tabIt/releases/latest) and unzip it. Open
`chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the
unzipped folder.

**3. Play.** Open any YouTube video and click **♪ Get chords** under the player. A new song
takes about a minute to analyze; a repeat is instant.

The extension also walks you through step 1 itself, and notices the helper as soon as it
is running. The helper starts at login. To check on it or remove it, run
`~/.local/bin/tabit status`, `~/.local/bin/tabit logs` or `~/.local/bin/tabit uninstall`.

## Honest about accuracy

tabIt is a portfolio and learning project, and it doesn't pretend otherwise. Chord
recognition is imperfect, so where tabIt is unsure it shows the chord softer instead of
guessing with false confidence. On 11 hand-labeled Beatles songs, the current engine
scores **0.79 majmin** (0.74 with sevenths), measured with `mir_eval` against the live
YouTube pipeline. That is one artist and era, so treat it as a directional signal, not a
promise. The per-song results and method are in
[How it works](docs/HOW-IT-WORKS.md#honest-about-accuracy).

## Credit

tabIt recognizes chords with **BTC**, the Bi-directional Transformer for Chord Recognition
by Park, Choi, Jeon, Kim and Park (ISMIR 2019),
[jayg996/BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19). Its code (MIT) is vendored
in [`engine/vendor/btc`](engine/vendor/btc) with its licence. The pretrained weights are
downloaded from the authors' repository at first use and are not redistributed here. The
authors state no licence for them, so tabIt is **non-commercial**. Beat tracking uses
[librosa](https://librosa.org), key detection [Essentia](https://essentia.upf.edu), and
audio comes from [yt-dlp](https://github.com/yt-dlp/yt-dlp) and
[FFmpeg](https://ffmpeg.org). Full credits, citation and licence notes are in
[How it works](docs/HOW-IT-WORKS.md#chord-recognition-and-credits).

tabIt has no accounts, no tracking and sends nothing to the developer. See
[`PRIVACY.md`](PRIVACY.md).

## Learn more

- [How it works](docs/HOW-IT-WORKS.md): the architecture, the engine, accuracy and privacy
- [Development](docs/DEVELOPMENT.md): run it from source, tests, project layout
- [Releasing](docs/RELEASING.md)

[MIT](LICENSE) © Paolo Sandejas
