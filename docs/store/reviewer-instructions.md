# Test instructions for reviewers

Paste the block below into the "Test instructions" tab. No account or credentials are needed.

```
tabIt needs a small helper program running on the reviewer's Mac. No account or login is required.

Requirements: a Mac (macOS), Chrome, about 2 GB of disk (a 1 GB environment plus the download cache; the installer checks for 3 GB free) and a few minutes. No admin password is needed. The helper is macOS only; on other systems the extension shows a message saying so.

1. Open Terminal (Applications > Utilities > Terminal), paste this and press Return:

   curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh

   It installs under the home folder (about 2 GB of disk: a 1 GB environment plus the download cache; a few minutes) and starts a background service on http://localhost:28224. The source of the installer is in the public repository: https://github.com/paolosand/tabIt
2. Open this video in Chrome: https://www.youtube.com/watch?v=2RicaUqd9Hg
3. Under the video, click the tabIt bar ("Get chords"). If the helper is not found yet, the bar shows the three setup steps with a Copy command button and notices the helper on its own once it is running.
4. Pass: the bar shows progress (download, chords, chart) and then the chord chart. The current chord moves along as the video plays. A repeat of the same video appears almost instantly.

The extension talks only to http://localhost:28224 and youtube.com. To remove the helper afterwards, run: ~/.local/bin/tabit uninstall
```

Notes for the owner:
- The video is an official upload used in the benchmark (`benchmarks/manifest.yaml`). Confirm it is still available before submitting.
- The installer URL is on `main`; it installs the latest tagged release. Make sure the release (wheel and assets) is published before submitting, or the reviewer's install will fail.
