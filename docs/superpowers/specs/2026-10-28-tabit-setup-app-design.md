# tabIt Setup app: design

**Status:** draft for owner approval · 2026-10-28 · builds on `2026-07-12-tabit-helper-packaging-design.md` (this is its "Phase 2", scoped down)

## Intent

tabIt's chord engine runs in a small helper on the user's own Mac. Today the helper is installed by pasting a `curl | sh` command into Terminal. tabIt's users are hobby guitar players, not programmers. A person who just added the extension from the Chrome Web Store must get from "no helper" to "chords on my video" without opening Terminal, typing anything, or making a decision other than pressing one button. The setup app is the only thing they install by hand.

## The flow (approved by the owner, with mockups)

1. **On YouTube, no helper found.** The extension's bar shows a one-line explanation and a **Download for Mac** button. "Free · about 1 GB of space". No jargon.
2. **The download** is one file, named **tabIt Setup**. The user opens it (double-click). Because it is a signed, notarized app that came through a browser, macOS shows its standard "downloaded from the Internet. Are you sure you want to open it?" prompt once; the user clicks **Open**. No other warning may appear.
3. **Setup window** (one window, plain white, one button): wordmark, "Let's get tabIt ready", "This sets everything up for you. Nothing to choose, nothing to type.", button **Install tabIt**, small print "About 2 minutes. Uses about 1 GB." (the time figure is a guess to be measured).
4. **While it works:** a progress bar and one plain sentence per stage ("Getting the chord listener ready (2 of 3)"). The window may be left open or closed; the user may go back to YouTube.
5. **Done:** "You're all set. Go back to YouTube. tabIt will find its helper on its own." Button **Back to YouTube**.
6. **Back on YouTube:** the extension keeps looking for the helper and, without a refresh, changes to "Helper connected" and **Get chords**. First chords arrive in about 2 seconds.

If anything fails, the window shows one plain sentence, a **Try again** button, and a small **Copy details** link that copies a log for bug reports. It never shows a stack trace or shell output by default.

## Goals

- Zero Terminal for the whole life of the product: install, update, restart, remove.
- At most these clicks for a first install: Download, Open (system prompt), Install tabIt, Back to YouTube.
- Works on a Mac that has never had developer tools (no git, no Xcode command line tools, no Homebrew, no Python).
- Re-running the app is always safe: it detects an existing install and offers **Update** (older version), **Start tabIt** (installed but not running), or **Remove tabIt**, and says "already set up" if there is nothing to do.
- One source of truth for what an install is: the existing installer logic, not a second implementation.
- Visual design is a thin skin: plain white background, colours/fonts/strings in one place so the in-progress redesign can swap them without touching logic.

## Non-goals

- Windows or Linux (the extension says "macOS only for now").
- A menubar icon, a background UI, or a settings screen.
- Automatic background updates (Sparkle or similar). Updating means downloading the new tabIt Setup.
- Replacing the `curl | sh` path for developers; it stays.
- A `.pkg` installer or Mac App Store distribution.

## Anti-goals (a failure even if it "works")

- Any step that needs Terminal, a password prompt of our own, an unexplained system dialog, or Apple's "can't be opened / damaged" warnings.
- A first install that triggers the macOS "install command line tools" dialog.
- A setup window that looks like a developer tool or shows raw logs by default.
- Leaving a half-installed state that blocks a retry.

## Decisions made by the owner

- Apple Developer membership exists; the app is signed with Developer ID and notarized. (Verified on the owner's Mac: Xcode 26.5, Swift 6.3, `notarytool`, and the identity "Developer ID Application: Paolo Sandejas (2XRYVXBTZX)" are present. Notarization credentials are not yet set up; that is an owner step.)
- Flow and screens as above. Download is called **Download for Mac**, the app **tabIt Setup**.
- Plain white background; no notebook motif in this app.
- The builder picks the tools, optimizing for easiest to install and to maintain.

## My calls (the owner has not decided these; they can overrule)

1. **Native Swift/SwiftUI app**, not Electron/Tauri: a few MB, no runtime, signs and notarizes cleanly, and Xcode is already on the owner's Mac.
2. **The app drives the existing installer, it does not re-implement it.** `packaging/install.sh` gains a machine-readable mode that prints progress lines (for example `TABIT_PROGRESS 2/3 chord-listener`) and stable error codes; the app bundles the script, runs it as a subprocess, and maps the lines to the friendly sentences. The `curl | sh` path keeps working unchanged for developers.
3. **No git.** Today's installer runs `uv pip install "tabit-engine[api] @ git+https://github.com/...@vX"`, which on a fresh Mac pops up Apple's command-line-tools installer. The release CI instead builds the engine wheel and attaches it to the GitHub release; the setup app bundles the wheel for its own version and the script installs from that file. This also fixes the same latent problem for the Terminal installer (add a wheel option; keep git as a fallback for developers).
4. **Versioning:** a setup app installs exactly the engine version it shipped with. App version = release version.
5. **Download URL:** the extension's button links to the stable `https://github.com/paolosand/tabIt/releases/latest/download/tabIt-Setup.zip` (a notarized, stapled `.app` inside a zip). A disk image is a fine substitute if testing shows a zip is awkward in Chrome.
6. **Build and sign locally** with a script (`packaging/mac/`: archive, hardened-runtime Developer ID signing, `notarytool submit --wait`, `stapler staple`, `ditto` zip) run on the owner's Mac, where the certificate lives. Moving this to CI is a later step.
7. **Extension changes:** a first-run state (never connected: the Download panel above; connected before but offline: "tabIt isn't running. Open tabIt Setup and press Start tabIt"), platform check (non-Mac shows "macOS only for now"), and the existing polling provides the automatic "connected" flip. First-ever connection is remembered in extension storage.
8. **Logs:** the app writes `~/Library/Logs/tabIt/setup.log`; **Copy details** copies the last run.

## Constraints

- Apple Silicon and Intel Macs (the installer already supports both; Intel is slower). Minimum macOS version: the builder sets the lowest version the bundled Python/torch wheels and Swift deployment target support, and the extension and app say it plainly.
- The app must work offline-after-download only as far as it can: the install still downloads the engine's Python dependencies (about 1 GB), the ffmpeg binary and the 12 MB model weights. Every download has a pinned checksum where the installer already does, and failures retry cleanly.
- No admin password: everything installs under the user's home (`~/Library/Application Support/tabIt`, a user launch agent). The app must never ask for one.
- Machine-readable installer output is a stable internal contract between the script and the app (versioned).
- The helper keeps its port (28224), launch agent label (`com.tabit.helper`), and `tabit` CLI, so existing installs upgrade in place.

## Success looks like

On a fresh macOS user account with no developer tools, a person with an ordinary home connection goes from the Web Store listing to chords on a YouTube video in under about five minutes, with no Terminal and no warning other than the one-time "downloaded from the Internet" prompt. A second run says "already set up". Uninstalling from the app leaves nothing behind. Killing the app mid-install and re-running recovers.

## Verification the plan must include

- A clean-Mac test (a fresh macOS user account, or a VM) with the quarantine flag set as a browser download would set it (confirm Gatekeeper shows the mild prompt, not "can't be opened"); `spctl --assess` and `stapler validate` pass on the built app.
- A Mac with no git/CLT: confirm no developer-tools dialog appears.
- Upgrade from a v0.3.x install and from a v0.4.0 install; interrupted install; offline failure; disk-full failure; each shows the plain-sentence error and recovers on **Try again**.
- Extension states: never installed, installed-and-running, installed-but-stopped, non-Mac.

## Left to the builder

Project layout of the Swift package; exact progress-line format; how the installer script is bundled and updated; whether `uv` and `ffmpeg` are bundled or fetched (prefer fewest network hosts; keep checksums); app icon and final copy (the redesign supplies assets; ship a plain placeholder); test harness for the subprocess protocol; CI later.

## Needs the owner (cannot be done by the builder)

- Create a notarization credential (App Store Connect API key or an app-specific password stored in the keychain as a `notarytool` profile).
- Approve publishing: the first notarized release is a public GitHub release asset.
- Supply the redesigned wordmark/icon when ready.
- Do the clean-Mac check by hand (see below): a fresh macOS user account or a VM, because hosted CI runners already have git installed.

## More calls, added after an independent read of this document (mine, not the owner's; overrule any)

These close the gaps a builder would otherwise have to guess at.

9. **Fetch, don't bundle, the big pieces.** The app bundles only its own installer script and the engine wheel. `uv`, the standalone Python 3.11 (which `uv` fetches from GitHub), the PyPI wheels, `ffmpeg` and the model weights are downloaded at install time, as the Terminal installer does today. Files a signed app downloads itself are not quarantined, so they trigger no Gatekeeper warning. Fetch `uv` as a pinned-checksum release tarball from GitHub rather than by piping astral.sh's installer script, so the install touches fewer hosts and verifies what it runs. Hosts the install needs: github.com (uv, Python, ffmpeg, weights via raw.githubusercontent.com) and pypi.org / files.pythonhosted.org. The offline failure message names "the internet" in plain words, not hosts.
10. **The wheel is in scope.** The builder adds whatever build configuration makes `engine`, `api`, `helper` and `engine/vendor/btc` (including its LICENSE/NOTICE) a self-contained wheel, installed as `<wheel>[api]`. The BTC weights are NOT in the wheel (licence reasons); `tabit warmup` downloads and verifies them as today. Release CI builds and attaches the wheel; a test installs it into a clean venv and runs `/health`.
11. **Release order, so the Download link never 404s.** Merge, tag, CI builds the wheel and the extension zip and creates the release as a draft. The owner builds and notarizes the app locally (the script fetches the wheel for the tag), uploads `tabIt-Setup.zip`, and only then publishes the release. A short release checklist in the repo says so. The extension also knows a minimum helper version; if the helper it finds is older, it shows the same Download panel worded "Update tabIt".
12. **Remove and logs.** The app's Remove button runs the installed CLI's `tabit uninstall --purge` (it already deletes its own environment safely while running) and also clears the chart cache, so nothing is left behind; charts take about two seconds to recreate. The setup log lives in its own folder, `~/Library/Logs/tabIt Setup/`, which Remove leaves in place (a few KB) so a failed removal can still be reported.
13. **"Installed" and "needs Update".** The installer writes a small version file next to the environment. The app compares, in order: the running helper's `/health` `engineVersion`, then that version file. A helper newer than the app, or an editable/development install, is never downgraded: the app says "a newer tabIt is already installed" and offers only Start and Remove. A half-built environment or a leftover `env.old` is handled by the installer's existing recovery, which the app just runs.
14. **Does the Web Store extension reach the helper?** Yes, and that does not change. The extension's background worker fetches `http://localhost:28224` under its `host_permissions`, so the API's CORS list (which only allows the dev web app) does not apply. The existing "offline" state and polling stay; the first-run and "needs update" states are additions to that state machine, not a rewrite.
15. **Minimum macOS.** The builder finds the lowest macOS version where the full install really works (torch, essentia, numba wheels), tests it, and sets the app's deployment target to that. On an older Mac the app says "tabIt needs macOS N or newer" instead of failing midway, and the extension's panel states the same. Intel stays supported but slower, unless wheels stop covering it, in which case the app says so.
16. **Testing split.** Automated on CI: the installer's machine-readable mode and its failure/recovery paths (the existing installer end-to-end job, extended), the wheel install, and the extension states. By hand on the owner's Mac, from a checklist the builder writes: the Gatekeeper prompt with a real quarantine flag, no command-line-tools dialog on an account with no developer tools, and upgrade from a v0.3.x install.
