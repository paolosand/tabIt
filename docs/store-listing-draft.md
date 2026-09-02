# Chrome Web Store listing — draft

Sprint 0 deliverable (`docs/BETA_ROADMAP.md`). Ready to paste in once the
developer account is registered and a draft listing is open (Sprint 2 does
the actual submission). Voice follows `PRODUCT.md`: analog, honest,
musician-facing — no SaaS/dev-tool language.

## Listing name

tabIt

## Short description (≤ 132 characters)

Paste a song, follow the chords, play along — live guitar chord sheets synced
to any YouTube video, right under the player.

(131 characters)

## Detailed description

tabIt turns any YouTube video into a play-along guitar chord sheet — chords,
key, and suggested scales, synced beat by beat to what's playing, right
under the video you're already watching.

Click "♪ Get chords" under any YouTube video. tabIt listens to the audio
itself and builds a chord sheet from scratch — no dependence on someone
having already transcribed the song. That means it works on the stuff chord
sites can't cover: unreleased songs, live versions, a friend's demo, your
own recordings.

While it plays:
- The current chord is always obvious at a glance, and the next one is
  flagged before it arrives, so your hands are ready — karaoke-style,
  not a static page you have to scroll ahead on.
- Slash chords (like D/F#) are detected from the actual bass line, not
  guessed from the chord alone.
- The full chord sheet is one click away if you'd rather read ahead than
  follow the sweep.

Chord detection is honest about what it doesn't know. Where the model is
unsure, the chord is shown softer rather than guessed at with false
confidence — and you can correct anything that's wrong.

tabIt is local-first: analysis runs through a small helper on your own
Mac, not a cloud service. No account, no sign-up, nothing to configure.

## Category

Music & Audio (or closest Web Store equivalent — confirm against the
current category list when the draft listing is opened)

## Privacy practices tab / policy line

*(Written for today's build — no data leaves the machine. Sprint 2 adds an
opt-in correction-sharing pipeline; this line gets revised then, not now.)*

tabIt does not collect, transmit, or store any personal data, browsing
history, or account information. Chord analysis runs entirely through a
local helper on your own machine. tabIt does not use analytics, tracking,
or third-party services of any kind.

## Assets still needed before submission

- Store icon (128×128) — confirm against `docs/assets/` or produce a Store-
  spec export of the existing wordmark
- At least one promotional screenshot/tile at Web Store's required sizes
  (1280×800 or 640×400) — the README's `docs/assets/extension-demo.gif` is
  the right source material but needs a static frame or a purpose-built
  screenshot, not the animated GIF itself
- Decide whether the untracked demo video at repo root (`tabIt - demo
  video - just a song - NO LOADER STEP.mp4`) is usable listing/promo
  material, per the Launch checklist in BETA_ROADMAP.md
