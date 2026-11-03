# Feedback loop for bad transcriptions — design

Date: 2026-11-02. Status: draft for review.

## Intent and why

tabIt is now on the Chrome Web Store and may have real users. Today it is fully
private: the extension talks only to a helper on the user's own Mac, and nothing
reaches the developer. That means we cannot know which songs the engine gets wrong,
what people are learning to play, or how the tool is landing.

We want a small, honest feedback loop:

1. A user who sees a clearly wrong transcription can tell us with one click.
2. Users who choose to help can let us see which songs are being analyzed and what
   the engine produced, so we can find failures before anyone reports them.

This is also the first step toward a later "approved transcription library" (check for
an approved chart for a track first, fall back to the local engine). That library is
**not** part of this work, but nothing here should make it harder.

## Goals

- One-click "report bad transcription" in the in-page panel.
- An opt-in "Help improve tabIt" setting, off by default.
- The developer can answer "which songs fail?" and "which songs are people playing?"
  from Supabase tables, and can inspect exactly what the engine produced for any song.
- Privacy documents (`PRIVACY.md`, README, Web Store data disclosure) updated to match
  what is actually sent.

## Non-goals

- The approved-transcription library, contributor/artist uploads, moderation.
- User accounts or sign-in.
- Server-side transcription. Compute stays on the user's machine (fast, free to us);
  the server only stores small records.
- A custom admin UI. The Supabase dashboard is the viewer.
- Letting users see or delete what they sent (possible later).
- Analytics on in-app behavior beyond the records below.

## Anti-goals (a failure even if it technically works)

- Anything leaving the machine without the user's click (report) or opt-in (usage).
- Sending audio, YouTube account data, or browsing history.
- Silent privacy drift: the shipped wording must match the shipped behavior.
- Slowing or blocking chord display. Network calls are fire-and-forget; failure to
  reach Supabase must never affect the chart the user sees.

## Behavior

### Report
- A "Report bad transcription" button in the panel. One click sends the report.
- After sending, a small optional follow-up appears: what was off (chords / key /
  tempo / other) and an optional free-text note. The report is already sent before
  the follow-up; the follow-up updates it.
- A report always includes the chart, even if the usage toggle is off. The click is
  the consent.

### Usage sharing (opt-in)
- A "Help improve tabIt" toggle in the panel, default off, with plain wording: shares
  the songs you analyze and the resulting charts; no account, no personal info.
- When on, each completed analysis records an event and uploads the chart, once per
  video ID + engine version.

### Data sent
- Report: video ID, engine version, install ID, reason, note, chart.
- Usage (opted in): video ID, engine version, install ID, timestamp, chart (deduped).
- Install ID: random UUID generated on first use, stored in `chrome.storage.local`.
  Lets us count unique users without knowing who they are. It is not sent unless the
  user reports or opts in.
- Never sent: audio, cookies, account info, history, the user's other tabs.

## Architecture

- **Supabase** (the developer already has an account). Tables: `charts`
  (unique on video ID + engine version, chart as jsonb, title, first seen),
  `analyses` (usage events), `reports` (flags, with status for triage).
- The extension's **background service worker** makes the calls (content scripts
  cannot, because of CORS). `manifest.json` gains **no** new host permission (a new
  one would make Chrome disable the extension for every existing user until they
  re-approve); Supabase's REST API allows cross-origin requests, so the service
  worker's fetch is expected to work as is (confirm in the manual end-to-end task).
- The extension holds only the public anon key. **Row Level Security** permits
  insert (and the report follow-up update) but no select. Column/size limits via
  check constraints bound what can be written: column lengths and formats, and the
  `charts` JSON must name the same video ID and engine version as its columns.
  Anon has no SELECT grant, so uploads are plain inserts with `Prefer: return=minimal`
  only (no `on_conflict`, no `resolution=ignore-duplicates`: PostgREST needs SELECT
  for those and answers 401). Duplicate charts are rejected by the database's primary
  key (HTTP 409, code 23505) and the client treats that 409 as success.
- Song identity is the YouTube video ID, matching the helper's cache key, so the
  same key serves the future library lookup.
- Settings state (`shareUsage`, `installId`) in `chrome.storage.local`.

## Constraints

- Chrome MV3 extension; React overlay in `extension/src/overlay`; background logic
  in `extension/src/background` (see `messages.ts` for the message pattern).
- `PRIVACY.md` currently promises "does not collect anything" and "runs no servers";
  this must be rewritten. Web Store review will flag the new data
  collection (there is no new host permission, see Architecture), so the listing's data-usage form must be updated.
- Branching: work branches from and PRs into `staging`. No version bump in feature
  work. Expected to ship as a minor release (0.7.0) when the developer decides.
- Supabase's anon key is public by design; safety rests on RLS, not secrecy.

## Decisions made with the developer

- Compute stays local; no transcription server.
- Backend is Supabase.
- Usage sharing is opt-in via a settings toggle; reports are consented per click.
- Upload the full chart (deduped) for opted-in users, so problems are visible without
  re-running the engine at that version.

## Calls made by the author (not yet confirmed)

- The Supabase dashboard is the v1 admin view.
- No Edge Function in v1; spam is bounded by RLS and size checks, and we add a
  function or rate limit if abuse appears.
- Report is one click with an optional follow-up, rather than a form up front.
- Toggle lives in the panel, since the extension has no settings page.

## Resolved after builder review

Facts from the code:
- "The chart" is the helper's full `Chart` JSON (`engine/schema.py`: source with
  videoId/title/duration, analysis with `engineVersion`, key, scales, tempo, beats,
  chords, meter, downbeats). Real cached charts are 12-38 KB. Upload it as the helper
  returned it; do not trim. Set the size check to about 256 KB.
- Engine version is already in the chart at `analysis.engineVersion`; no helper change
  is needed. The extension's transpose feature changes YouTube's audio only, not the
  chart (builder: confirm).

Author's calls:
- Chart dedupe: the primary key on (video ID, engine version) rejects duplicates
  (409, code 23505), which the client treats as success. That needs no select
  permission. The client may also remember what it has sent in
  `chrome.storage.local`, but the server constraint is the source of truth.
- Reports reference a chart by (video ID, engine version), not a foreign key. The
  client inserts the chart first, then the report.
- Report follow-up (reason, note) is a second append-only insert carrying the report's
  client-generated UUID. There is no update policy, so nobody can rewrite anyone's
  report.
- Usage events: one `analyses` row per completed analysis per browser session; charts
  once per video + engine version.
- Title and video ID are sent. The privacy copy says so plainly: no account or name,
  but the video ID shows which video was analyzed.
- Install ID is created lazily on first report or opt-in. Turning sharing off stops
  future uploads and deletes nothing already sent; the privacy page says this and
  how to ask for deletion.
- Migrations live in `supabase/migrations` in this repo. The project URL and anon key
  are public values and are injected at build time. RLS is tested against local
  Supabase.
- Ships as 0.7.0, after the 0.6.0 release currently in flight.

## Decided after builder review (developer's answers)

- **Failed analyses are logged for opted-in users.** When the helper reports an error
  (download failure, unavailable video, engine error), record video ID, engine
  version, install ID and timestamp, plus the reason: an error category (download
  failed / video unavailable / engine error / timeout) and a short message with
  home-directory paths scrubbed (e.g. `/Users/<name>` replaced) and capped at about
  300 characters, never a stack trace. No chart. Nothing is sent about
  failures unless the usage toggle is on. This answers "which songs is the app failing
  on" for outright failures; the report button covers wrong-but-completed charts.
  The privacy copy must mention failures.
- **Supabase project:** reuse the developer's existing dormant project, but only after
  checking in the dashboard that it holds nothing worth keeping, and then reset it
  rather than delete it. Schema is applied from `supabase/migrations`, so the project
  is reproducible.

## Known risks

- **CORS from the service worker.** With no Supabase host permission, the service
  worker's fetch depends on Supabase's REST API answering cross-origin requests. If
  CORS blocks it in the manual end-to-end task, the host permission must be re-added
  deliberately, accepting the re-approval prompt existing users will see.
- **Chart poisoning (Phase 2 requirement).** `charts` is world-insertable with the
  public anon key, and the first writer for a video ID and engine version wins, so a
  malicious client can plant a bogus chart. The database only checks that the chart
  JSON names the same video and engine version as its columns. Phase 2 must never
  serve `charts` directly to users: approved charts go in a separate table that only
  the developer writes.

- Free-tier Supabase projects pause after a period of inactivity (check the current
  rule). A paused project makes every send fail silently. Before launch, choose a
  keep-alive ping or a paid plan, and confirm the project is not paused.

## Left to the builder

- Exact schema, column types, indexes, and RLS policy wording.
- Panel layout and copy for the button, follow-up, and toggle (follow `DESIGN.md`).
- How to batch/queue failed sends (reasonable: drop silently, or small retry).
- Testing approach, including how to test RLS.
