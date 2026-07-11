# Step-Based Loading Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the extension bar's indeterminate loading sweep with a four-item step checklist driven by real, server-reported pipeline step transitions.

**Architecture:** One new field flows end to end: `engine.pipeline.analyze()` gains an `on_step` callback that fires at stage entry with ids `ingest → separate → chords → finalize`; the API's `JobStore` records the latest step on pending jobs (exposed for free by `GET /analyze/{job_id}`); the extension background passes `step` through its pending responses; the overlay `Bar` renders the checklist, deriving done/active/pending from the step id's position in a fixed order.

**Tech Stack:** Python (FastAPI, pytest), TypeScript (React 19, vitest, testing-library), Chrome extension (shadow-DOM overlay, esbuild).

**Spec:** `docs/superpowers/specs/2026-07-11-tabit-step-progress-design.md`

## Global Constraints

- Step ids are exactly `"ingest"`, `"separate"`, `"chords"`, `"finalize"`; client labels are exactly "Fetch audio", "Separate instruments", "Find chords", "Build chart".
- A missing or unknown step id must render as step 1 active — the UI never breaks on the field being absent.
- `on_step=None` (the default) must leave engine behavior byte-identical to today; callback exceptions must never break an analysis run.
- Web app (`web/`) stays untouched except the shared `JobState` type in `web/src/lib/types.ts`.
- Python commands run from the repo root with the project venv: `source .venv/bin/activate` (or prefix `.venv/bin/python -m ...`). Extension commands run from `extension/`.
- Work happens on a branch off `main` in a git worktree (created at execution time via superpowers:using-git-worktrees).

---

### Task 1: Engine — `on_step` callback in `analyze()`

**Files:**
- Modify: `engine/pipeline.py`
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Produces: `analyze(src, *, created_at, workdir=None, chord_model=None, keep_audio=False, on_step=None)` — `on_step: Callable[[str], None] | None`, invoked with `"ingest"`, `"separate"`, `"chords"`, `"finalize"` in that order, at stage entry. Exceptions raised by the callback are swallowed.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_pipeline.py` (uses the existing `_stub_common` helper and `FakeChordModel` already in that file):

```python
def test_analyze_reports_steps_in_order(tone_440_wav, tmp_path, monkeypatch):
    import engine.pipeline as p
    _stub_common(p, monkeypatch, tone_440_wav)

    steps = []
    analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
            workdir=str(tmp_path), chord_model=FakeChordModel(),
            on_step=steps.append)

    assert steps == ["ingest", "separate", "chords", "finalize"]


def test_analyze_survives_broken_step_callback(tone_440_wav, tmp_path, monkeypatch):
    """A UI-side bug in the progress callback must never break an analysis."""
    import engine.pipeline as p
    _stub_common(p, monkeypatch, tone_440_wav)

    def bad_callback(step):
        raise RuntimeError("ui bug")

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=FakeChordModel(),
                    on_step=bad_callback)

    assert [c.label for c in chart.chords] == ["Am", "F"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_pipeline.py -v`
Expected: the two new tests FAIL with `TypeError: analyze() got an unexpected keyword argument 'on_step'`; the three existing tests PASS.

- [ ] **Step 3: Implement the callback**

In `engine/pipeline.py`, add a module-level helper above `analyze` and thread the callback through. The four call sites are placed at stage entry; `"ingest"` fires first thing so the UI shows step 1 even during the TF import.

```python
def _report(on_step, step):
    """Invoke the progress callback defensively: a bug in the listener must
    never break an analysis run."""
    if on_step is None:
        return
    try:
        on_step(step)
    except Exception:
        pass
```

Change the signature:

```python
def analyze(src, *, created_at, workdir=None, chord_model=None, keep_audio=False,
            on_step=None) -> Chart:
```

Inside the `try:` block, add the four `_report` calls (context lines shown; only the `_report` lines are new):

```python
        _report(on_step, "ingest")
        # crepe (worker thread) and crema (main thread) both resolve
        ...
        import tensorflow.keras  # noqa: F401

        ingested = ingest(src, workdir)
        ...
        with ThreadPoolExecutor(max_workers=3) as pool:
            key_fut = pool.submit(detect_key, ingested.wav_path)
            _report(on_step, "separate")
            stems = separate(ingested.wav_path, workdir)
            harm = harmonic_mix(stems, workdir)

            _report(on_step, "chords")
            bass_src = stems.get("bass", ingested.wav_path)
            ...
            segs = reconcile_bass(segs, window_bass_notes(bass_fut.result(), segs))
        _report(on_step, "finalize")
        segs = apply_key_prior(segs, key)
```

(`"chords"` names the whole concurrent chords/bass/beats block per the spec; `"finalize"` covers key prior, simplification, meter, and chart assembly.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_pipeline.py -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/pipeline.py tests/test_pipeline.py
git commit -m "feat(engine): on_step progress callback in analyze()"
```

---

### Task 2: JobStore + API — `set_step` progress, wired from the endpoint's work closures

One task on purpose: changing `submit()` to call `fn(job_id)` breaks `api/main.py`'s
zero-arg `work()` closures the moment it lands, so `api/jobs.py` and `api/main.py`
(and both test files) must change in the same commit to keep the suite green.

**Files:**
- Modify: `api/jobs.py`
- Modify: `api/main.py`
- Test: `tests/api/test_jobs.py`
- Test: `tests/api/test_main.py`

**Interfaces:**
- Consumes: `analyze(..., on_step=...)` from Task 1.
- Produces: `JobStore.submit(fn: Callable[[str], dict]) -> str` — **breaking change**: `fn` is now called as `fn(job_id)`. `JobStore.set_step(job_id: str, step: str) -> None` — records `{"status": "pending", "step": step}`; no-op if the job is missing or no longer pending. Done/error dicts never carry a `step` key. `_run_analysis(src: str, on_step=None) -> dict`. `GET /analyze/{job_id}` returns `{"status": "pending", "step": "<id>"}` while a step is known.

- [ ] **Step 1: Update existing JobStore tests for the new signature and write the failing tests**

In `tests/api/test_jobs.py`, the two existing `submit()` work fns gain a job-id parameter:

```python
def test_job_lifecycle_success():
    store = JobStore()
    release = threading.Event()

    def work(job_id):
        release.wait(timeout=5)
        return {"ok": True}

    job_id = store.submit(work)
    ...


def test_job_error_is_reported():
    store = JobStore()
    job_id = store.submit(lambda _job_id: (_ for _ in ()).throw(RuntimeError("boom")))
    ...
```

Append the new tests:

```python
def test_set_step_surfaces_on_pending_job_and_clears_when_done():
    store = JobStore()
    release = threading.Event()
    stepped = threading.Event()

    def work(job_id):
        store.set_step(job_id, "separate")
        stepped.set()
        release.wait(timeout=5)
        return {"ok": True}

    job_id = store.submit(work)
    assert stepped.wait(5)
    assert store.get(job_id) == {"status": "pending", "step": "separate"}

    release.set()
    deadline = time.time() + 5
    while store.get(job_id)["status"] == "pending" and time.time() < deadline:
        time.sleep(0.01)
    result = store.get(job_id)
    assert result["status"] == "done"
    assert "step" not in result


def test_set_step_on_resolved_or_unknown_job_is_noop():
    store = JobStore()
    job_id = store.submit_done({"cached": True})
    store.set_step(job_id, "separate")
    assert store.get(job_id) == {"status": "done", "chart": {"cached": True}}
    store.set_step("nope", "separate")  # must not raise or create a job
    assert store.get("nope") is None
```

- [ ] **Step 2: Run the JobStore tests to verify the new ones fail**

Run: `.venv/bin/python -m pytest tests/api/test_jobs.py -v`
Expected: the two new tests FAIL with `AttributeError: 'JobStore' object has no attribute 'set_step'`. The two updated existing tests also FAIL for now (`fn()` is called with no args → `TypeError` → surfaces as a job error) — that's the signature change driving the implementation.

- [ ] **Step 3: Update `test_main.py` fixtures for the new signatures and write the failing API test**

In `tests/api/test_main.py`, the monkeypatched `_run_analysis` fakes must accept the new parameter (the work closures will call `_run_analysis(src, on_step=...)`):

```python
@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "cache", m.ChartCache(str(tmp_path)))
    monkeypatch.setattr(m, "jobs", m.JobStore())
    monkeypatch.setattr(m, "_run_analysis", lambda src, on_step=None: FAKE_CHART)
    return TestClient(app)
```

```python
def test_analysis_error_surfaces(client, monkeypatch):
    def boom(src, on_step=None):
        raise RuntimeError("yt-dlp exploded")
    monkeypatch.setattr(m, "_run_analysis", boom)
    ...
```

(`test_run_analysis_uses_shared_chord_model`'s fake already takes `**kwargs` — no change, but verify it still passes in Step 6.)

Append the new test:

```python
def test_pending_job_exposes_pipeline_step(client, monkeypatch):
    release = threading.Event()

    def fake_run(src, on_step=None):
        on_step("separate")
        release.wait(timeout=5)
        return FAKE_CHART

    monkeypatch.setattr(m, "_run_analysis", fake_run)
    r = client.post("/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    job_id = r.json()["jobId"]

    deadline = time.time() + 5
    body = client.get(f"/analyze/{job_id}").json()
    while body.get("step") != "separate" and time.time() < deadline:
        time.sleep(0.01)
        body = client.get(f"/analyze/{job_id}").json()
    assert body == {"status": "pending", "step": "separate"}

    release.set()
    assert _poll_done(client, job_id)["status"] == "done"
```

- [ ] **Step 4: Implement the JobStore**

In `api/jobs.py`:

```python
    def submit(self, fn: Callable[[str], dict]) -> str:
        """Run fn on the worker; fn receives the job id so it can report
        progress via set_step before submit() has even returned."""
        job_id = uuid.uuid4().hex
        self._set(job_id, {"status": "pending"})

        def run():
            try:
                chart = fn(job_id)
                self._set(job_id, {"status": "done", "chart": chart})
            except Exception as exc:  # surfaced to the client, not swallowed
                self._set(job_id, {"status": "error", "error": str(exc)})

        self._executor.submit(run)
        return job_id

    def set_step(self, job_id: str, step: str) -> None:
        """Record pipeline progress on a pending job; no-op once resolved."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and job["status"] == "pending":
                self._jobs[job_id] = {"status": "pending", "step": step}
```

- [ ] **Step 5: Implement the API wiring**

In `api/main.py`, thread `on_step` through `_run_analysis`:

```python
def _run_analysis(src: str, on_step=None) -> dict:
    """Run the engine on a URL or file path; returns chart as a plain dict.
    Module-level so tests can monkeypatch it."""
    import engine.pipeline

    created_at = datetime.now(timezone.utc).isoformat()
    return engine.pipeline.analyze(
        src, created_at=created_at, chord_model=_get_chord_model(),
        on_step=on_step,
    ).model_dump()
```

Update the upload-path closure:

```python
        def work(job_id: str):
            try:
                chart = _run_analysis(tmp, on_step=lambda s: jobs.set_step(job_id, s))
                cache.put(chart)
                return chart
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)  # never persist uploaded audio
```

And the URL-path closure:

```python
    def work(job_id: str):
        chart = _run_analysis(url, on_step=lambda s: jobs.set_step(job_id, s))
        cache.put(chart)
        return chart
```

- [ ] **Step 6: Run the API tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/ -v`
Expected: all tests PASS (including all pre-existing `test_main.py` flows — the closures now match `submit`'s `fn(job_id)` contract).

- [ ] **Step 7: Commit**

```bash
git add api/jobs.py api/main.py tests/api/test_jobs.py tests/api/test_main.py
git commit -m "feat(api): pending analyze jobs report the current pipeline step"
```

---

### Task 3: Extension background — pass `step` through pending responses

**Files:**
- Modify: `web/src/lib/types.ts` (shared `JobState` type)
- Modify: `extension/src/messages.ts`
- Modify: `extension/src/background/handler.ts`
- Test: `extension/src/background/handler.test.ts`

**Interfaces:**
- Consumes: the API's pending shape `{"status": "pending", "step": "<id>"}` from Task 2.
- Produces: `GetChartResponse` pending variant `{ status: 'pending'; step?: string }`; `JobState` pending variant `{ status: 'pending'; step?: string }`. Task 5's `App.tsx` reads `response.step`.

- [ ] **Step 1: Write the failing test**

Append to `extension/src/background/handler.test.ts`:

```ts
test('pending job passes the pipeline step through', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'pending', step: 'separate' });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'pending', step: 'separate' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/background/handler.test.ts`
Expected: the new test FAILS — received `{ status: 'pending' }` lacks `step`.

- [ ] **Step 3: Implement the type + passthrough**

`web/src/lib/types.ts` — the pending variant gains the optional step:

```ts
export type JobState =
  | { status: 'pending'; step?: string }
  | { status: 'done'; chart: Chart }
  | { status: 'error'; error: string };
```

`extension/src/messages.ts` — same shape on the message response:

```ts
export type GetChartResponse =
  | { status: 'done'; chart: Chart }
  | { status: 'pending'; step?: string }
  | { status: 'error'; error: string };
```

`extension/src/background/handler.ts` — the poll branch returns the step (the freshly-submitted path at the bottom keeps returning `{ status: 'pending' }` with no step; the UI defaults that to step 1):

```ts
      return { status: 'pending', step: state.step };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npx vitest run src/background/handler.test.ts && npm run typecheck`
Expected: all handler tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts extension/src/messages.ts extension/src/background/handler.ts extension/src/background/handler.test.ts
git commit -m "feat(ext): pending GET_CHART responses carry the pipeline step"
```

---

### Task 4: Bar — step checklist replaces the loading sweep

**Files:**
- Modify: `extension/src/overlay/Bar.tsx`
- Modify: `extension/src/overlay/styles.ts`
- Create: `extension/src/overlay/Bar.test.tsx`

**Interfaces:**
- Consumes: nothing new (pure UI).
- Produces: `BarProps` loading variant becomes `{ variant: 'loading'; step?: string }`. Task 5 passes `step` from App state.

- [ ] **Step 1: Write the failing tests**

Create `extension/src/overlay/Bar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Bar } from './Bar';

test('loading checklist marks earlier steps done, current active, later pending', () => {
  render(<Bar variant="loading" step="chords" />);
  const items = screen.getAllByRole('listitem');
  expect(items.map((el) => el.textContent)).toEqual([
    expect.stringContaining('Fetch audio'),
    expect.stringContaining('Separate instruments'),
    expect.stringContaining('Find chords'),
    expect.stringContaining('Build chart'),
  ]);
  expect(items[0]).toHaveClass('tabit-check-done');
  expect(items[1]).toHaveClass('tabit-check-done');
  expect(items[2]).toHaveClass('tabit-check-active');
  expect(items[2]).toHaveAttribute('aria-current', 'step');
  expect(items[3]).toHaveClass('tabit-check-pending');
  expect(items[3]).not.toHaveAttribute('aria-current');
});

test('missing step defaults to the first step active', () => {
  render(<Bar variant="loading" />);
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveClass('tabit-check-active');
  expect(items[1]).toHaveClass('tabit-check-pending');
});

test('unknown step id defaults to the first step active', () => {
  render(<Bar variant="loading" step="warp-drive" />);
  expect(screen.getAllByRole('listitem')[0]).toHaveClass('tabit-check-active');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && npx vitest run src/overlay/Bar.test.tsx`
Expected: FAIL — TypeScript/props error (`step` not in loading variant) and no `listitem` roles rendered.

- [ ] **Step 3: Implement the checklist**

`extension/src/overlay/Bar.tsx` — new props, step table, and loading branch (collapsed and error branches unchanged):

```tsx
export type BarProps =
  | { variant: 'collapsed'; onGetChords: () => void }
  | { variant: 'loading'; step?: string }
  | { variant: 'error'; message: string; onRetry: () => void };

/** Server-reported pipeline step ids in run order, with user-facing labels.
 *  An unknown/missing id renders as step 1 active (spec: the UI never breaks
 *  on the field being absent). */
const PIPELINE_STEPS = [
  { id: 'ingest', label: 'Fetch audio' },
  { id: 'separate', label: 'Separate instruments' },
  { id: 'chords', label: 'Find chords' },
  { id: 'finalize', label: 'Build chart' },
] as const;
```

The loading branch:

```tsx
  if (props.variant === 'loading') {
    const active = Math.max(0, PIPELINE_STEPS.findIndex((s) => s.id === props.step));
    return (
      <div className="tabit-bar tabit-bar-loading" data-state="loading">
        <Wordmark />
        <div className="tabit-checklist" role="list" aria-label="analysis progress">
          {PIPELINE_STEPS.map((s, i) => {
            const state = i < active ? 'done' : i === active ? 'active' : 'pending';
            return (
              <span
                key={s.id}
                role="listitem"
                className={`tabit-check-item tabit-check-${state}`}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span className="tabit-check-icon" aria-hidden="true">✓</span>
                {s.label}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
```

`extension/src/overlay/styles.ts` — replace the now-unused loading styles (`.tabit-loading-body`, `.tabit-sweep-track`, `.tabit-sweep-fill`, the `tabit-sweep` keyframes, and `.tabit-hint`) with the checklist styles. Add a spin keyframe next to the other keyframes:

```css
@keyframes tabit-spin {
  to { transform: rotate(360deg); }
}
```

And the checklist classes where the sweep styles were:

```css
.tabit-checklist {
  display: flex;
  align-items: center;
  gap: 16px;
}
.tabit-check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tabit-muted);
  white-space: nowrap;
  transition: color 0.3s;
}
.tabit-check-done { color: oklch(0.45 0.02 70); }
.tabit-check-active { color: var(--tabit-ink); font-weight: 600; }
.tabit-check-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  flex: none;
  border: 1.5px solid oklch(0.85 0.015 85);
  color: transparent;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}
.tabit-check-done .tabit-check-icon {
  background: var(--tabit-accent);
  border-color: var(--tabit-accent);
  color: var(--tabit-paper);
}
.tabit-check-active .tabit-check-icon {
  border-color: var(--tabit-accent);
  border-top-color: transparent;
  animation: tabit-spin 0.9s linear infinite;
}
```

(No `.tabit-check-pending` rule needed — the base `.tabit-check-item` styles are the pending look. The existing `prefers-reduced-motion` rule already freezes the spinner; the active step stays distinguishable by its bold ink label.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npx vitest run src/overlay/Bar.test.tsx && npm run typecheck`
Expected: 3 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add extension/src/overlay/Bar.tsx extension/src/overlay/styles.ts extension/src/overlay/Bar.test.tsx
git commit -m "feat(ext): step checklist replaces the loading sweep in the bar"
```

---

### Task 5: App — thread the step from poll responses into the Bar

**Files:**
- Modify: `extension/src/overlay/App.tsx`
- Test: `extension/src/overlay/App.test.tsx`

**Interfaces:**
- Consumes: `GetChartResponse` pending `step?` (Task 3); `BarProps` loading `step?` (Task 4).
- Produces: nothing further — this closes the chain.

- [ ] **Step 1: Write the failing test**

Append to `extension/src/overlay/App.test.tsx`:

```tsx
test('pending step from the background reaches the checklist', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'pending', step: 'separate' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() =>
    expect(screen.getByText('Separate instruments')).toHaveAttribute('aria-current', 'step'),
  );
  expect(screen.getByText('Fetch audio')).toHaveClass('tabit-check-done');

  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/overlay/App.test.tsx`
Expected: the new test FAILS — `aria-current` is missing because App drops the step (it renders `<Bar variant="loading" />` and never re-renders on pending).

- [ ] **Step 3: Implement**

In `extension/src/overlay/App.tsx`, the loading state carries the step:

```tsx
type State =
  | { kind: 'collapsed' }
  | { kind: 'loading'; step?: string }
  | { kind: 'sheet'; chart: Chart }
  | { kind: 'error'; message: string };
```

The pending branch of `poll` updates the state before re-arming the timer (a fresh submit has no step yet — `response.step` is `undefined` and Bar defaults to step 1):

```tsx
        } else {
          setState({ kind: 'loading', step: response.step });
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
```

And the loading render passes it through:

```tsx
    case 'loading':
      return <Bar variant="loading" step={state.step} />;
```

- [ ] **Step 4: Run the full extension suite**

Run: `cd extension && npm test && npm run typecheck`
Expected: all suites PASS (App, Bar, Panel, Ribbon, handler, messages, content, smoke); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add extension/src/overlay/App.tsx extension/src/overlay/App.test.tsx
git commit -m "feat(ext): thread the pipeline step from poll responses into the bar"
```

---

### Task 6: Full verification

**Files:** none new.

- [ ] **Step 1: Run the Python suites**

Run: `.venv/bin/python -m pytest tests/ --ignore=tests/integration -v`
Expected: all PASS (integration tests are excluded — they run real audio and models).

- [ ] **Step 2: Run the extension suite and build**

Run: `cd extension && npm test && npm run typecheck && npm run build`
Expected: all PASS; `dist/` builds clean.

- [ ] **Step 3: Live smoke test (manual, optional but recommended)**

Start the API (`.venv/bin/uvicorn api.main:app --port 8000`), load `extension/dist` unpacked in Chrome, open an unanalyzed YouTube song, click "Get chords", and watch the checklist walk `Fetch audio → Separate instruments → Find chords → Build chart` before the sheet appears. Note the memory quirk: Chrome ≥137 ignores `--load-extension`; load it via chrome://extensions instead.

- [ ] **Step 4: Commit anything outstanding, then merge per superpowers:finishing-a-development-branch**
