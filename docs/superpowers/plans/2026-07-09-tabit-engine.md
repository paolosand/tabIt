# tabIt MIR Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python MIR engine (Layer 1) that turns a song (YouTube URL or audio file) into a validated "chord chart" JSON containing chords, key, suggested scales, tempo, and a beat grid.

**Architecture:** A pipeline of small, independently-testable stages. Pure-logic stages (schema, scales, post-processing) are unit-tested directly. MIR stages (chords, key, beats, separation, bass) are wrapped behind narrow interfaces so unit tests use fakes and real models run only in `@pytest.mark.integration` tests. `pipeline.py` orchestrates the stages; `cli.py` is the entry point. Audio is deleted after analysis — only the JSON persists.

**Tech Stack:** Python 3.11, Pydantic v2, pytest, librosa, Essentia, crema, Demucs (`htdemucs_6s`), CREPE, yt-dlp, ffmpeg, mir_eval.

## Global Constraints

- **Python 3.11.x** — pin this; it matches Essentia/crema/CREPE wheels and keeps the future `allin1` option (which needs ≤3.11) viable. Do NOT use 3.12+.
- **Never persist source audio** beyond analysis. All audio lives in a per-run temp working directory that is deleted in a `finally` block. Only chart JSON is a durable output.
- **Chords are represented structurally**: `root` (e.g. `"C"`), `quality` (e.g. `"maj"`, `"min"`, `"min7"`, `"maj7"`, `"dom7"`, `"dim"`, `"aug"`, `"sus2"`, `"sus4"`, `"6"`, `"hdim7"`, `"dim7"`, `"N"` for no-chord), `bass` (e.g. `"G"`). The display `label` is always derived from these three via `format_label`.
- **Pitch classes use sharps, canonical order**: `["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`. Any flat (`Bb`) or enharmonic input is normalized to this set.
- **All timings are floats in seconds.**
- **Package name is `engine`** (import as `from engine import ...`). Tests live in `tests/` mirroring the module path.
- **Every MIR wrapper degrades gracefully**: if its heavy dependency is missing or errors, it falls back (documented per task) rather than crashing the pipeline.

---

## File Structure

```
tabit/
├── pyproject.toml            # deps, pytest config, python 3.11 pin
├── engine/
│   ├── __init__.py
│   ├── notes.py              # pitch-class constants + normalize_note (shared, pure)
│   ├── schema.py             # Pydantic Chart models + format_label
│   ├── scales.py             # key+mode → suggested scales (pure theory)
│   ├── ingest.py             # yt-dlp / file → mono WAV + metadata
│   ├── beats.py              # librosa beat grid
│   ├── key.py                # Essentia KeyExtractor
│   ├── chords.py             # crema behind ChordModel interface + Harte parser
│   ├── separate.py           # Demucs htdemucs_6s (+ HPSS fallback) + harmonic_mix
│   ├── bass.py               # bass stem → CREPE → per-segment bass note
│   ├── postprocess.py        # snap-to-beats, merge, reconcile bass, key prior
│   ├── pipeline.py           # orchestrate stages → Chart
│   └── cli.py                # argparse entry point
└── tests/
    ├── test_notes.py
    ├── test_schema.py
    ├── test_scales.py
    ├── test_ingest.py
    ├── test_beats.py
    ├── test_key.py
    ├── test_chords.py
    ├── test_separate.py
    ├── test_bass.py
    ├── test_postprocess.py
    ├── test_pipeline.py
    ├── integration/
    │   └── test_accuracy.py
    └── fixtures/
        ├── tone_440.wav       # generated 2s A4 sine (Task 0)
        └── ref_clip/          # short labeled clip for accuracy harness (Task 11)
```

---

### Task 0: Project scaffolding + dependency smoke test

Sets up the environment and proves the heavy, conflict-prone dependencies (crema, CREPE, Essentia, Demucs — all have native/TF deps) actually install and import on this machine BEFORE building around them. This de-risks the single biggest integration threat.

**Files:**
- Create: `pyproject.toml`
- Create: `engine/__init__.py`
- Create: `tests/__init__.py`, `tests/integration/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/fixtures/` (via the fixture generator below)
- Test: `tests/test_smoke.py`

**Interfaces:**
- Produces: a working `.venv`, an importable `engine` package, a `tone_440_wav` pytest fixture returning the path to a generated 2-second A4 (440 Hz) mono WAV at 44100 Hz.

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[project]
name = "tabit-engine"
version = "0.1.0"
requires-python = ">=3.11,<3.12"
dependencies = [
    "pydantic>=2,<3",
    "numpy>=1.24,<2",
    "soundfile>=0.12",
    "librosa>=0.10",
    "yt-dlp>=2024.1",
    "mir_eval>=0.7",
    # Heavy / native — validated in this task's smoke test:
    "essentia>=2.1b6.dev1110 ; sys_platform != 'win32'",
    "demucs>=4.0",
    "crepe>=0.0.15",
    "crema>=0.2",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-mock>=3"]

[tool.pytest.ini_options]
markers = [
    "integration: tests that load real ML models / audio (slow; opt-in with -m integration)",
]
addopts = "-m 'not integration'"
```

- [ ] **Step 2: Create the virtualenv and install**

Run:
```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```
Expected: install completes. If `crema` or `crepe` fail to resolve TensorFlow on Python 3.11, pin a compatible `tensorflow`/`keras` in `dependencies` and retry — record whatever pin works in `pyproject.toml`. Do not proceed until all four heavy deps import (Step 4).

- [ ] **Step 3: Create package files and the fixture generator in `tests/conftest.py`**

`engine/__init__.py`:
```python
__version__ = "0.1.0"
```

`tests/conftest.py`:
```python
import numpy as np
import soundfile as sf
import pytest


@pytest.fixture(scope="session")
def tone_440_wav(tmp_path_factory):
    """A 2-second 440 Hz (A4) mono sine at 44100 Hz. Deterministic test audio."""
    sr = 44100
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
    y = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    path = tmp_path_factory.mktemp("audio") / "tone_440.wav"
    sf.write(str(path), y, sr)
    return str(path)
```
Create empty `tests/__init__.py` and `tests/integration/__init__.py`.

- [ ] **Step 4: Write the smoke test `tests/test_smoke.py`**

```python
import importlib
import pytest


@pytest.mark.integration
@pytest.mark.parametrize("mod", ["essentia.standard", "demucs.api", "crepe", "crema.analyze"])
def test_heavy_deps_import(mod):
    importlib.import_module(mod)


def test_engine_imports():
    import engine
    assert engine.__version__ == "0.1.0"
```

- [ ] **Step 5: Run the smoke tests**

Run:
```bash
pytest tests/test_smoke.py -v                 # fast: engine import only
pytest tests/test_smoke.py -v -m integration  # heavy deps import check
```
Expected: `test_engine_imports` PASSES; all four `test_heavy_deps_import` params PASS. Any import failure here must be fixed now (adjust pins) — everything downstream depends on it.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml engine/__init__.py tests/
git commit -m "chore: scaffold engine package and validate heavy deps"
```

---

### Task 1: Notes + Chart schema

The data contract everything else produces/consumes.

**Files:**
- Create: `engine/notes.py`
- Create: `engine/schema.py`
- Test: `tests/test_notes.py`, `tests/test_schema.py`

**Interfaces:**
- Produces:
  - `engine.notes.NOTES: list[str]` (12 sharps, C-first) and `normalize_note(name: str) -> str`.
  - `engine.schema` Pydantic models: `Source`, `Analysis`, `Key`, `Scale`, `Tempo`, `ChordSegment`, `Chart`.
  - `engine.schema.format_label(root: str, quality: str, bass: str) -> str`.
- Consumes: nothing.

- [ ] **Step 1: Write failing tests `tests/test_notes.py`**

```python
from engine.notes import NOTES, normalize_note


def test_notes_canonical_order():
    assert NOTES == ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def test_normalize_flats_to_sharps():
    assert normalize_note("Bb") == "A#"
    assert normalize_note("Db") == "C#"


def test_normalize_passthrough_and_strip():
    assert normalize_note("C") == "C"
    assert normalize_note("A#") == "A#"
    assert normalize_note(" g ") == "G"
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_notes.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.notes`).

- [ ] **Step 3: Implement `engine/notes.py`**

```python
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_FLAT_TO_SHARP = {
    "Cb": "B", "Db": "C#", "Eb": "D#", "Fb": "E",
    "Gb": "F#", "Ab": "G#", "Bb": "A#",
}


def normalize_note(name: str) -> str:
    """Normalize a note name to canonical sharp spelling (title-cased, trimmed)."""
    n = name.strip()
    n = n[0].upper() + n[1:] if n else n
    if n in _FLAT_TO_SHARP:
        return _FLAT_TO_SHARP[n]
    return n
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_notes.py -v`
Expected: PASS.

- [ ] **Step 5: Write failing tests `tests/test_schema.py`**

```python
import json
from engine.schema import (
    Source, Analysis, Key, Scale, Tempo, ChordSegment, Chart, format_label,
)


def test_format_label_basic_qualities():
    assert format_label("C", "maj", "C") == "C"
    assert format_label("A", "min", "A") == "Am"
    assert format_label("G", "dom7", "G") == "G7"
    assert format_label("C", "maj7", "C") == "Cmaj7"
    assert format_label("D", "min7", "D") == "Dm7"
    assert format_label("B", "hdim7", "B") == "Bm7b5"


def test_format_label_slash_chord():
    assert format_label("C", "maj", "G") == "C/G"
    assert format_label("A", "min", "C") == "Am/C"


def test_format_label_no_chord():
    assert format_label("N", "N", "N") == "N"


def test_chart_roundtrips_json():
    chart = Chart(
        source=Source(kind="file", duration=6.3, title="t"),
        analysis=Analysis(engineVersion="0.1.0", createdAt="2026-07-09T00:00:00Z"),
        key=Key(tonic="A", mode="minor", confidence=0.71),
        scales=[Scale(name="A minor pentatonic", notes=["A", "C", "D", "E", "G"])],
        tempo=Tempo(bpm=120.5),
        beats=[0.42, 0.92],
        chords=[ChordSegment(start=0.42, end=2.40, label="Am", root="A",
                             quality="min", bass="A", confidence=0.83)],
    )
    dumped = chart.model_dump_json()
    reloaded = Chart.model_validate(json.loads(dumped))
    assert reloaded.schemaVersion == 1
    assert reloaded.sections == []
    assert reloaded.chords[0].label == "Am"
```

- [ ] **Step 6: Run to verify failure**

Run: `pytest tests/test_schema.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.schema`).

- [ ] **Step 7: Implement `engine/schema.py`**

```python
from pydantic import BaseModel, Field

# quality -> display suffix appended to the root
QUALITY_SUFFIX = {
    "maj": "", "min": "m", "dom7": "7", "maj7": "maj7", "min7": "m7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4", "6": "6",
    "min6": "m6", "hdim7": "m7b5", "dim7": "dim7", "minmaj7": "mMaj7",
    "9": "9", "maj9": "maj9", "min9": "m9",
}


def format_label(root: str, quality: str, bass: str) -> str:
    """Build a display label from structured chord parts."""
    if quality == "N" or root == "N":
        return "N"
    base = root + QUALITY_SUFFIX.get(quality, quality)
    if bass and bass != root:
        return f"{base}/{bass}"
    return base


class Source(BaseModel):
    kind: str                       # "youtube" | "file"
    videoId: str | None = None
    title: str | None = None
    duration: float


class Analysis(BaseModel):
    engineVersion: str
    createdAt: str                  # ISO-8601, supplied by caller


class Key(BaseModel):
    tonic: str
    mode: str                       # "major" | "minor"
    confidence: float


class Scale(BaseModel):
    name: str
    notes: list[str]


class Tempo(BaseModel):
    bpm: float


class ChordSegment(BaseModel):
    start: float
    end: float
    label: str
    root: str
    quality: str
    bass: str
    confidence: float


class Chart(BaseModel):
    schemaVersion: int = 1
    source: Source
    analysis: Analysis
    key: Key
    scales: list[Scale]
    tempo: Tempo
    beats: list[float]
    sections: list = Field(default_factory=list)
    chords: list[ChordSegment]
```

- [ ] **Step 8: Run to verify pass**

Run: `pytest tests/test_schema.py -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add engine/notes.py engine/schema.py tests/test_notes.py tests/test_schema.py
git commit -m "feat: chart schema, structured chord labels, note normalization"
```

---

### Task 2: Scale suggestions

Pure music theory: key → scales. No audio.

**Files:**
- Create: `engine/scales.py`
- Test: `tests/test_scales.py`

**Interfaces:**
- Consumes: `engine.notes.NOTES`, `engine.schema.Scale`.
- Produces: `engine.scales.suggest_scales(tonic: str, mode: str) -> list[Scale]`.

- [ ] **Step 1: Write failing tests `tests/test_scales.py`**

```python
from engine.scales import suggest_scales


def test_minor_key_suggestions():
    scales = suggest_scales("A", "minor")
    names = [s.name for s in scales]
    assert "A minor pentatonic" in names
    assert "A natural minor" in names
    pent = next(s for s in scales if s.name == "A minor pentatonic")
    assert pent.notes == ["A", "C", "D", "E", "G"]


def test_major_key_suggestions():
    scales = suggest_scales("C", "major")
    names = [s.name for s in scales]
    assert "C major pentatonic" in names
    assert "C major" in names
    major = next(s for s in scales if s.name == "C major")
    assert major.notes == ["C", "D", "E", "F", "G", "A", "B"]


def test_wraps_around_octave():
    pent = next(s for s in suggest_scales("G", "major") if "pentatonic" in s.name)
    assert pent.notes == ["G", "A", "B", "D", "E"]
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_scales.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.scales`).

- [ ] **Step 3: Implement `engine/scales.py`**

```python
from engine.notes import NOTES, normalize_note
from engine.schema import Scale

MAJOR = [0, 2, 4, 5, 7, 9, 11]
NAT_MINOR = [0, 2, 3, 5, 7, 8, 10]
MAJ_PENT = [0, 2, 4, 7, 9]
MIN_PENT = [0, 3, 5, 7, 10]
DORIAN = [0, 2, 3, 5, 7, 9, 10]


def _build(tonic: str, intervals: list[int]) -> list[str]:
    i = NOTES.index(normalize_note(tonic))
    return [NOTES[(i + iv) % 12] for iv in intervals]


def suggest_scales(tonic: str, mode: str) -> list[Scale]:
    tonic = normalize_note(tonic)
    if mode == "minor":
        specs = [
            (f"{tonic} minor pentatonic", MIN_PENT),
            (f"{tonic} natural minor", NAT_MINOR),
            (f"{tonic} Dorian", DORIAN),
        ]
    else:
        specs = [
            (f"{tonic} major pentatonic", MAJ_PENT),
            (f"{tonic} major", MAJOR),
        ]
    return [Scale(name=name, notes=_build(tonic, iv)) for name, iv in specs]
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_scales.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/scales.py tests/test_scales.py
git commit -m "feat: scale suggestions from key + mode"
```

---

### Task 3: Audio ingest

Turn a URL or file into a mono WAV in a temp workdir, plus metadata. Uses `yt-dlp` (URL) and `ffmpeg` (convert). Never leaves audio behind outside the caller-provided workdir.

**Files:**
- Create: `engine/ingest.py`
- Test: `tests/test_ingest.py`

**Interfaces:**
- Consumes: nothing internal.
- Produces:
  - `engine.ingest.IngestResult` dataclass: `wav_path: str`, `source: engine.schema.Source`.
  - `engine.ingest.ingest(src: str, workdir: str, sample_rate: int = 44100) -> IngestResult`.
  - `src` is a local path (kind `"file"`) or an `http(s)://` URL (kind `"youtube"`).
  - Helper `engine.ingest._is_url(src: str) -> bool`.

- [ ] **Step 1: Write failing tests `tests/test_ingest.py`**

```python
import os
import soundfile as sf
from engine.ingest import ingest, _is_url


def test_is_url():
    assert _is_url("https://youtu.be/abc")
    assert _is_url("http://x.com/y")
    assert not _is_url("/tmp/song.wav")
    assert not _is_url("song.mp3")


def test_ingest_local_file_produces_mono_wav(tone_440_wav, tmp_path):
    result = ingest(tone_440_wav, str(tmp_path))
    assert os.path.exists(result.wav_path)
    data, sr = sf.read(result.wav_path)
    assert sr == 44100
    assert data.ndim == 1  # mono
    assert result.source.kind == "file"
    assert result.source.duration > 1.9
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_ingest.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.ingest`).

- [ ] **Step 3: Implement `engine/ingest.py`**

```python
import json
import os
import subprocess
from dataclasses import dataclass

import soundfile as sf

from engine.schema import Source


@dataclass
class IngestResult:
    wav_path: str
    source: Source


def _is_url(src: str) -> bool:
    return src.startswith("http://") or src.startswith("https://")


def _to_mono_wav(in_path: str, out_path: str, sample_rate: int) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", in_path, "-ac", "1", "-ar", str(sample_rate), out_path],
        check=True, capture_output=True,
    )


def _download_audio(url: str, workdir: str) -> tuple[str, dict]:
    """Download bestaudio via yt-dlp; return (downloaded_path, info_dict)."""
    out_tmpl = os.path.join(workdir, "src.%(ext)s")
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio", "--no-playlist", "-o", out_tmpl, url],
        check=True, capture_output=True,
    )
    info = json.loads(subprocess.run(
        ["yt-dlp", "-J", "--no-playlist", url],
        check=True, capture_output=True, text=True,
    ).stdout)
    downloaded = next(
        os.path.join(workdir, f) for f in os.listdir(workdir) if f.startswith("src.")
    )
    return downloaded, info


def ingest(src: str, workdir: str, sample_rate: int = 44100) -> IngestResult:
    os.makedirs(workdir, exist_ok=True)
    wav_path = os.path.join(workdir, "audio.wav")
    if _is_url(src):
        downloaded, info = _download_audio(src, workdir)
        _to_mono_wav(downloaded, wav_path, sample_rate)
        os.remove(downloaded)
        source = Source(kind="youtube", videoId=info.get("id"),
                        title=info.get("title"), duration=float(info.get("duration", 0.0)))
    else:
        _to_mono_wav(src, wav_path, sample_rate)
        info_sf = sf.info(wav_path)
        source = Source(kind="file", title=os.path.basename(src), duration=info_sf.duration)
    return IngestResult(wav_path=wav_path, source=source)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_ingest.py -v`
Expected: PASS. (Requires `ffmpeg` on PATH — already installed on this machine.)

- [ ] **Step 5: Commit**

```bash
git add engine/ingest.py tests/test_ingest.py
git commit -m "feat: audio ingest (yt-dlp + ffmpeg -> mono wav)"
```

---

### Task 4: Beat / tempo tracking

**Files:**
- Create: `engine/beats.py`
- Test: `tests/test_beats.py`

**Interfaces:**
- Consumes: a WAV path.
- Produces: `engine.beats.track_beats(wav_path: str) -> tuple[float, list[float]]` returning `(bpm, beat_times_seconds)`.

- [ ] **Step 1: Write failing test `tests/test_beats.py`**

```python
from engine.beats import track_beats


def test_track_beats_returns_bpm_and_sorted_times(tone_440_wav):
    bpm, beats = track_beats(tone_440_wav)
    assert bpm >= 0.0
    assert isinstance(beats, list)
    assert beats == sorted(beats)
    assert all(isinstance(b, float) for b in beats)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_beats.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.beats`).

- [ ] **Step 3: Implement `engine/beats.py`**

```python
import librosa


def track_beats(wav_path: str) -> tuple[float, list[float]]:
    """Return (bpm, beat_times_in_seconds) using librosa's beat tracker."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    tempo, beat_times = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(tempo) if hasattr(tempo, "__float__") else float(tempo[0])
    return bpm, [float(t) for t in beat_times]
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_beats.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/beats.py tests/test_beats.py
git commit -m "feat: librosa beat/tempo tracking"
```

---

### Task 5: Key detection

Essentia `KeyExtractor` behind a small function; normalized output.

**Files:**
- Create: `engine/key.py`
- Test: `tests/test_key.py`

**Interfaces:**
- Consumes: a WAV path, `engine.notes.normalize_note`, `engine.schema.Key`.
- Produces: `engine.key.detect_key(wav_path: str) -> engine.schema.Key`.

- [ ] **Step 1: Write failing test `tests/test_key.py`**

```python
import pytest
from engine.key import detect_key
from engine.notes import NOTES


@pytest.mark.integration
def test_detect_key_returns_valid_key(tone_440_wav):
    key = detect_key(tone_440_wav)
    assert key.tonic in NOTES
    assert key.mode in ("major", "minor")
    assert 0.0 <= key.confidence <= 1.0
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_key.py -v -m integration`
Expected: FAIL (`ModuleNotFoundError: engine.key`).

- [ ] **Step 3: Implement `engine/key.py`**

```python
from engine.notes import normalize_note
from engine.schema import Key


def detect_key(wav_path: str) -> Key:
    """Detect musical key with Essentia's KeyExtractor (shaath profile for pop/rock)."""
    import essentia.standard as es

    audio = es.MonoLoader(filename=wav_path, sampleRate=44100)()
    tonic, scale, strength = es.KeyExtractor(profileType="shaath")(audio)
    return Key(tonic=normalize_note(tonic), mode=scale, confidence=float(strength))
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_key.py -v -m integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/key.py tests/test_key.py
git commit -m "feat: Essentia key detection"
```

---

### Task 6: Chord recognition

crema behind a `ChordModel` interface, plus a Harte-notation parser (crema emits labels like `C:maj`, `A:min7`, `C:maj/5`). The parser is pure and unit-tested with a fake model; the real crema run is an integration test.

**Files:**
- Create: `engine/chords.py`
- Test: `tests/test_chords.py`

**Interfaces:**
- Consumes: `engine.notes.NOTES`/`normalize_note`, `engine.schema.ChordSegment`/`format_label`.
- Produces:
  - `engine.chords.RawChord` dataclass: `start: float`, `end: float`, `root: str`, `quality: str`, `bass: str`, `confidence: float`.
  - `engine.chords.parse_harte(label: str) -> tuple[str, str, str]` returning `(root, quality, bass)` (`("N","N","N")` for no-chord).
  - `engine.chords.CremaChordModel` with `.predict(wav_path: str) -> list[RawChord]`.
  - `engine.chords.raw_to_segments(raws: list[RawChord]) -> list[ChordSegment]`.

- [ ] **Step 1: Write failing tests `tests/test_chords.py`**

```python
import pytest
from engine.chords import parse_harte, RawChord, raw_to_segments


def test_parse_harte_major_minor():
    assert parse_harte("C:maj") == ("C", "maj", "C")
    assert parse_harte("A:min") == ("A", "min", "A")


def test_parse_harte_sevenths():
    assert parse_harte("G:7") == ("G", "dom7", "G")
    assert parse_harte("D:min7") == ("D", "min7", "D")
    assert parse_harte("F:maj7") == ("F", "maj7", "F")
    assert parse_harte("B:hdim7") == ("B", "hdim7", "B")


def test_parse_harte_slash_bass_interval():
    # C major with the 5th (G) in the bass
    assert parse_harte("C:maj/5") == ("C", "maj", "G")
    # A minor with the b3 (C) in the bass
    assert parse_harte("A:min/b3") == ("A", "min", "C")


def test_parse_harte_no_chord():
    assert parse_harte("N") == ("N", "N", "N")


def test_parse_harte_flat_root_normalized():
    assert parse_harte("Bb:maj") == ("A#", "maj", "A#")


def test_raw_to_segments_builds_labels():
    raws = [RawChord(0.0, 2.0, "A", "min", "A", 0.8),
            RawChord(2.0, 4.0, "C", "maj", "G", 0.6)]
    segs = raw_to_segments(raws)
    assert segs[0].label == "Am"
    assert segs[1].label == "C/G"
    assert segs[1].confidence == 0.6
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_chords.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.chords`).

- [ ] **Step 3: Implement `engine/chords.py`**

```python
from dataclasses import dataclass

from engine.notes import NOTES, normalize_note
from engine.schema import ChordSegment, format_label

# Harte quality shorthand -> our canonical quality names
_QUALITY_MAP = {
    "maj": "maj", "min": "min", "7": "dom7", "maj7": "maj7", "min7": "min7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4",
    "maj6": "6", "6": "6", "min6": "min6", "hdim7": "hdim7", "dim7": "dim7",
    "minmaj7": "minmaj7", "9": "9", "maj9": "maj9", "min9": "min9",
}

# Harte interval token -> semitones above the root
_INTERVAL_SEMITONES = {
    "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6,
    "5": 7, "#5": 8, "b6": 8, "6": 9, "b7": 10, "7": 11,
}


@dataclass
class RawChord:
    start: float
    end: float
    root: str
    quality: str
    bass: str
    confidence: float


def parse_harte(label: str) -> tuple[str, str, str]:
    """Parse a Harte chord label into (root, quality, bass) with canonical names."""
    if not label or label in ("N", "X"):
        return ("N", "N", "N")

    bass_token = None
    body = label
    if "/" in label:
        body, bass_token = label.split("/", 1)

    if ":" in body:
        root_str, qual_str = body.split(":", 1)
    else:
        root_str, qual_str = body, "maj"

    root = normalize_note(root_str)
    quality = _QUALITY_MAP.get(qual_str, "maj")

    if bass_token is None:
        bass = root
    elif bass_token in _INTERVAL_SEMITONES:
        semis = _INTERVAL_SEMITONES[bass_token]
        bass = NOTES[(NOTES.index(root) + semis) % 12]
    else:
        # absolute note bass (rare)
        bass = normalize_note(bass_token)
    return (root, quality, bass)


def raw_to_segments(raws: list[RawChord]) -> list[ChordSegment]:
    return [
        ChordSegment(
            start=r.start, end=r.end,
            label=format_label(r.root, r.quality, r.bass),
            root=r.root, quality=r.quality, bass=r.bass, confidence=r.confidence,
        )
        for r in raws
    ]


class CremaChordModel:
    """Chord estimator backed by crema (large-vocabulary, structured, slash-capable)."""

    def predict(self, wav_path: str) -> list[RawChord]:
        from crema.analyze import analyze

        jam = analyze(filename=wav_path)
        ann = jam.annotations.search(namespace="chord")[0]
        raws: list[RawChord] = []
        for obs in ann.data:
            root, quality, bass = parse_harte(obs.value)
            raws.append(RawChord(
                start=float(obs.time), end=float(obs.time + obs.duration),
                root=root, quality=quality, bass=bass,
                confidence=float(obs.confidence) if obs.confidence is not None else 0.5,
            ))
        return raws
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_chords.py -v`
Expected: PASS (pure parser + `raw_to_segments`; `CremaChordModel` is exercised in the pipeline integration test).

- [ ] **Step 5: Add an integration test for the real model in `tests/test_chords.py`**

```python
@pytest.mark.integration
def test_crema_model_predicts(tone_440_wav):
    from engine.chords import CremaChordModel
    raws = CremaChordModel().predict(tone_440_wav)
    assert isinstance(raws, list)
    for r in raws:
        assert r.end >= r.start
```

- [ ] **Step 6: Run the integration test**

Run: `pytest tests/test_chords.py -v -m integration`
Expected: PASS (crema returns a possibly-empty list of well-formed chords for the tone).

- [ ] **Step 7: Commit**

```bash
git add engine/chords.py tests/test_chords.py
git commit -m "feat: crema chord recognition + Harte parser + slash-bass intervals"
```

---

### Task 7: Source separation

Demucs `htdemucs_6s`, with an HPSS fallback, plus a `harmonic_mix` helper that sums the non-drum stems into a single WAV for the chord model.

**Files:**
- Create: `engine/separate.py`
- Test: `tests/test_separate.py`

**Interfaces:**
- Consumes: a WAV path.
- Produces:
  - `engine.separate.separate(wav_path: str, out_dir: str, model: str = "htdemucs_6s") -> dict[str, str]` mapping stem name → WAV path. On any failure it returns `{"harmonic": <hpss_harmonic.wav>}` (HPSS fallback, no bass stem).
  - `engine.separate.harmonic_mix(stems: dict[str, str], out_dir: str) -> str` — path to a WAV summing every stem except `"drums"` (if only `"harmonic"` exists, returns it directly).

- [ ] **Step 1: Write failing tests `tests/test_separate.py`**

```python
import os
import soundfile as sf
from engine.separate import harmonic_mix, _hpss_fallback


def test_hpss_fallback_produces_wav(tone_440_wav, tmp_path):
    stems = _hpss_fallback(tone_440_wav, str(tmp_path))
    assert "harmonic" in stems
    assert os.path.exists(stems["harmonic"])


def test_harmonic_mix_excludes_drums(tone_440_wav, tmp_path):
    # Fake stems: reuse the tone as both a "drums" and "other" stem.
    stems = {"drums": tone_440_wav, "other": tone_440_wav, "bass": tone_440_wav}
    out = harmonic_mix(stems, str(tmp_path))
    assert os.path.exists(out)
    data, sr = sf.read(out)
    assert data.ndim == 1


def test_harmonic_mix_passthrough_when_only_harmonic(tone_440_wav, tmp_path):
    out = harmonic_mix({"harmonic": tone_440_wav}, str(tmp_path))
    assert out == tone_440_wav
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_separate.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.separate`).

- [ ] **Step 3: Implement `engine/separate.py`**

```python
import os

import librosa
import numpy as np
import soundfile as sf


def _hpss_fallback(wav_path: str, out_dir: str) -> dict[str, str]:
    """Percussion-removed harmonic component via librosa HPSS. No bass stem."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    harmonic = librosa.effects.harmonic(y)
    out = os.path.join(out_dir, "harmonic.wav")
    sf.write(out, harmonic, sr)
    return {"harmonic": out}


def separate(wav_path: str, out_dir: str, model: str = "htdemucs_6s") -> dict[str, str]:
    """Separate stems with Demucs; fall back to HPSS on any failure."""
    os.makedirs(out_dir, exist_ok=True)
    try:
        from demucs.api import Separator, save_audio

        sep = Separator(model=model)
        _, stems = sep.separate_audio_file(wav_path)
        paths: dict[str, str] = {}
        for name, source in stems.items():
            p = os.path.join(out_dir, f"{name}.wav")
            save_audio(source, p, samplerate=sep.samplerate)
            paths[name] = p
        return paths
    except Exception:
        return _hpss_fallback(wav_path, out_dir)


def harmonic_mix(stems: dict[str, str], out_dir: str) -> str:
    """Sum all non-drum stems into one mono WAV (chord-model input)."""
    if set(stems) == {"harmonic"}:
        return stems["harmonic"]

    os.makedirs(out_dir, exist_ok=True)
    mix = None
    sr = None
    for name, path in stems.items():
        if name == "drums":
            continue
        y, this_sr = librosa.load(path, sr=None, mono=True)
        sr = this_sr if sr is None else sr
        mix = y if mix is None else mix[: len(y)] + y[: len(mix)]
    out = os.path.join(out_dir, "harmonic_mix.wav")
    sf.write(out, mix / np.max(np.abs(mix) + 1e-9), sr)
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_separate.py -v`
Expected: PASS.

- [ ] **Step 5: Add a Demucs integration test in `tests/test_separate.py`**

```python
import pytest


@pytest.mark.integration
def test_demucs_separates_into_stems(tone_440_wav, tmp_path):
    from engine.separate import separate
    stems = separate(tone_440_wav, str(tmp_path))
    assert "bass" in stems  # htdemucs_6s yields a bass stem
    assert all(os.path.exists(p) for p in stems.values())
```

- [ ] **Step 6: Run the integration test**

Run: `pytest tests/test_separate.py -v -m integration`
Expected: PASS (first run downloads model weights; may take a minute).

- [ ] **Step 7: Commit**

```bash
git add engine/separate.py tests/test_separate.py
git commit -m "feat: Demucs source separation + HPSS fallback + harmonic mix"
```

---

### Task 8: Bass-note / slash-chord detection

Run the isolated bass stem through CREPE and take the median pitch class over each chord segment window.

**Files:**
- Create: `engine/bass.py`
- Test: `tests/test_bass.py`

**Interfaces:**
- Consumes: a bass-stem WAV path, `list[ChordSegment]`, `engine.notes.NOTES`.
- Produces: `engine.bass.detect_bass_notes(bass_wav: str, segments: list[ChordSegment]) -> list[str]` — one bass pitch-class per segment (falls back to the segment's own `root` when the stem is silent/low-confidence there).

- [ ] **Step 1: Write failing test `tests/test_bass.py`**

```python
import pytest
from engine.bass import _hz_to_pitch_class
from engine.notes import NOTES


def test_hz_to_pitch_class_a440():
    assert _hz_to_pitch_class(440.0) == "A"
    assert _hz_to_pitch_class(261.63) == "C"      # middle C
    assert _hz_to_pitch_class(82.41) == "E"       # low E string
    assert _hz_to_pitch_class(0.0) is None        # unvoiced


@pytest.mark.integration
def test_detect_bass_notes_length_matches_segments(tone_440_wav):
    from engine.bass import detect_bass_notes
    from engine.schema import ChordSegment
    segs = [ChordSegment(start=0.0, end=1.0, label="A", root="A",
                         quality="maj", bass="A", confidence=0.9)]
    out = detect_bass_notes(tone_440_wav, segs)
    assert len(out) == 1
    assert out[0] in NOTES
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_bass.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.bass`).

- [ ] **Step 3: Implement `engine/bass.py`**

```python
import numpy as np

from engine.notes import NOTES
from engine.schema import ChordSegment


def _hz_to_pitch_class(hz: float) -> str | None:
    if hz <= 0:
        return None
    midi = 69 + 12 * np.log2(hz / 440.0)
    return NOTES[int(round(midi)) % 12]


def detect_bass_notes(bass_wav: str, segments: list[ChordSegment]) -> list[str]:
    """Per-segment bass pitch class from the isolated bass stem via CREPE."""
    import crepe
    import librosa

    y, sr = librosa.load(bass_wav, sr=16000, mono=True)
    times, freqs, conf, _ = crepe.predict(y, sr, viterbi=True, step_size=50)

    result: list[str] = []
    for seg in segments:
        mask = (times >= seg.start) & (times < seg.end) & (conf > 0.5)
        if not mask.any():
            result.append(seg.root)
            continue
        pc = _hz_to_pitch_class(float(np.median(freqs[mask])))
        result.append(pc or seg.root)
    return result
```

- [ ] **Step 4: Run to verify pass (unit)**

Run: `pytest tests/test_bass.py -v`
Expected: `test_hz_to_pitch_class_a440` PASSES.

- [ ] **Step 5: Run the integration test**

Run: `pytest tests/test_bass.py -v -m integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/bass.py tests/test_bass.py
git commit -m "feat: bass-note detection via CREPE for slash chords"
```

---

### Task 9: Post-processing

Snap chord boundaries to beats, merge adjacent identical chords, reconcile detected bass notes into slash chords, and apply a light key-based confidence prior. All pure functions — fully unit-testable.

**Files:**
- Create: `engine/postprocess.py`
- Test: `tests/test_postprocess.py`

**Interfaces:**
- Consumes: `list[ChordSegment]`, `list[float]` beats, `engine.schema.Key`, `engine.schema.format_label`, `engine.scales` intervals.
- Produces:
  - `engine.postprocess.snap_to_beats(segs, beats) -> list[ChordSegment]`
  - `engine.postprocess.merge_adjacent(segs) -> list[ChordSegment]`
  - `engine.postprocess.reconcile_bass(segs, bass_notes) -> list[ChordSegment]`
  - `engine.postprocess.apply_key_prior(segs, key) -> list[ChordSegment]`

- [ ] **Step 1: Write failing tests `tests/test_postprocess.py`**

```python
from engine.schema import ChordSegment, Key
from engine.postprocess import (
    snap_to_beats, merge_adjacent, reconcile_bass, apply_key_prior,
)


def _seg(start, end, root="C", quality="maj", bass="C", conf=0.8):
    from engine.schema import format_label
    return ChordSegment(start=start, end=end, label=format_label(root, quality, bass),
                        root=root, quality=quality, bass=bass, confidence=conf)


def test_snap_to_beats_moves_boundaries_to_nearest_beat():
    segs = [_seg(0.05, 1.03)]
    beats = [0.0, 1.0, 2.0]
    out = snap_to_beats(segs, beats)
    assert out[0].start == 0.0
    assert out[0].end == 1.0


def test_snap_to_beats_noop_without_beats():
    segs = [_seg(0.05, 1.03)]
    assert snap_to_beats(segs, []) == segs


def test_merge_adjacent_collapses_identical():
    segs = [_seg(0.0, 1.0, "A", "min"), _seg(1.0, 2.0, "A", "min"),
            _seg(2.0, 3.0, "F", "maj")]
    out = merge_adjacent(segs)
    assert len(out) == 2
    assert out[0].start == 0.0 and out[0].end == 2.0
    assert out[1].root == "F"


def test_reconcile_bass_emits_slash_chord():
    segs = [_seg(0.0, 1.0, "C", "maj", "C")]
    out = reconcile_bass(segs, ["G"])
    assert out[0].bass == "G"
    assert out[0].label == "C/G"


def test_reconcile_bass_keeps_root_when_same():
    segs = [_seg(0.0, 1.0, "C", "maj", "C")]
    out = reconcile_bass(segs, ["C"])
    assert out[0].label == "C"


def test_apply_key_prior_lowers_out_of_key_confidence():
    # E major is out of key in C major; its confidence should drop.
    segs = [_seg(0.0, 1.0, "E", "maj", "E", conf=0.8)]
    out = apply_key_prior(segs, Key(tonic="C", mode="major", confidence=0.9))
    assert out[0].confidence < 0.8
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_postprocess.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.postprocess`).

- [ ] **Step 3: Implement `engine/postprocess.py`**

```python
from engine.notes import NOTES, normalize_note
from engine.schema import ChordSegment, Key, format_label
from engine.scales import MAJOR, NAT_MINOR


def _nearest(value: float, points: list[float]) -> float:
    return min(points, key=lambda p: abs(p - value))


def snap_to_beats(segs: list[ChordSegment], beats: list[float]) -> list[ChordSegment]:
    if not beats:
        return segs
    out = []
    for s in segs:
        out.append(s.model_copy(update={
            "start": _nearest(s.start, beats),
            "end": _nearest(s.end, beats),
        }))
    return out


def merge_adjacent(segs: list[ChordSegment]) -> list[ChordSegment]:
    if not segs:
        return []
    out = [segs[0].model_copy()]
    for s in segs[1:]:
        prev = out[-1]
        if (s.root, s.quality, s.bass) == (prev.root, prev.quality, prev.bass):
            out[-1] = prev.model_copy(update={
                "end": s.end,
                "confidence": max(prev.confidence, s.confidence),
            })
        else:
            out.append(s.model_copy())
    return out


def reconcile_bass(segs: list[ChordSegment], bass_notes: list[str]) -> list[ChordSegment]:
    out = []
    for s, bass in zip(segs, bass_notes):
        b = normalize_note(bass)
        out.append(s.model_copy(update={
            "bass": b,
            "label": format_label(s.root, s.quality, b),
        }))
    return out


def apply_key_prior(segs: list[ChordSegment], key: Key) -> list[ChordSegment]:
    """Softly reduce confidence for chord roots outside the detected key's scale."""
    intervals = NAT_MINOR if key.mode == "minor" else MAJOR
    tonic_idx = NOTES.index(normalize_note(key.tonic))
    in_key = {NOTES[(tonic_idx + iv) % 12] for iv in intervals}
    out = []
    for s in segs:
        if s.root != "N" and s.root not in in_key:
            out.append(s.model_copy(update={"confidence": s.confidence * 0.7}))
        else:
            out.append(s.model_copy())
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_postprocess.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/postprocess.py tests/test_postprocess.py
git commit -m "feat: post-processing (beat-snap, merge, slash reconcile, key prior)"
```

---

### Task 10: Pipeline + CLI

Wire every stage into one `analyze()` that returns a `Chart`, deleting audio afterward. `cli.py` provides `python -m engine.cli <url|file> -o chart.json`.

**Files:**
- Create: `engine/pipeline.py`
- Create: `engine/cli.py`
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Consumes: all stage modules.
- Produces:
  - `engine.pipeline.analyze(src: str, *, created_at: str, workdir: str | None = None, chord_model=None, keep_audio: bool = False) -> Chart`.
  - `created_at` is caller-supplied (ISO-8601) so the pipeline stays deterministic/testable. `chord_model` defaults to `CremaChordModel()`; tests inject a fake.

- [ ] **Step 1: Write failing test `tests/test_pipeline.py`**

```python
from engine.pipeline import analyze
from engine.chords import RawChord
from engine import __version__


class FakeChordModel:
    def predict(self, wav_path):
        return [RawChord(0.0, 1.0, "A", "min", "A", 0.8),
                RawChord(1.0, 2.0, "F", "maj", "F", 0.7)]


def test_analyze_local_file_end_to_end(tone_440_wav, tmp_path, monkeypatch):
    # Stub the heavy stages so this stays a fast unit test of the wiring.
    import engine.pipeline as p
    monkeypatch.setattr(p, "separate", lambda w, o: {"harmonic": w, "bass": w})
    monkeypatch.setattr(p, "harmonic_mix", lambda stems, o: tone_440_wav)
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 1.0, 2.0]))
    monkeypatch.setattr(p, "detect_key", lambda w: __import__(
        "engine.schema", fromlist=["Key"]).Key(tonic="A", mode="minor", confidence=0.7))
    monkeypatch.setattr(p, "detect_bass_notes", lambda w, segs: [s.root for s in segs])

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=FakeChordModel())

    assert chart.schemaVersion == 1
    assert chart.analysis.engineVersion == __version__
    assert chart.key.tonic == "A"
    assert chart.tempo.bpm == 120.0
    assert [c.label for c in chart.chords] == ["Am", "F"]
    assert any("pentatonic" in s.name for s in chart.scales)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_pipeline.py -v`
Expected: FAIL (`ModuleNotFoundError: engine.pipeline`).

- [ ] **Step 3: Implement `engine/pipeline.py`**

```python
import shutil
import tempfile

from engine import __version__
from engine.ingest import ingest
from engine.separate import separate, harmonic_mix
from engine.beats import track_beats
from engine.key import detect_key
from engine.bass import detect_bass_notes
from engine.chords import CremaChordModel, raw_to_segments
from engine.scales import suggest_scales
from engine.postprocess import (
    snap_to_beats, merge_adjacent, reconcile_bass, apply_key_prior,
)
from engine.schema import Analysis, Chart, Tempo


def analyze(src, *, created_at, workdir=None, chord_model=None, keep_audio=False) -> Chart:
    own_workdir = workdir is None
    workdir = workdir or tempfile.mkdtemp(prefix="tabit_")
    chord_model = chord_model or CremaChordModel()
    try:
        ingested = ingest(src, workdir)
        stems = separate(ingested.wav_path, workdir)
        harm = harmonic_mix(stems, workdir)

        bpm, beats = track_beats(harm)
        key = detect_key(ingested.wav_path)
        raws = chord_model.predict(harm)

        segs = raw_to_segments(raws)
        segs = snap_to_beats(segs, beats)
        segs = merge_adjacent(segs)

        bass_src = stems.get("bass", ingested.wav_path)
        segs = reconcile_bass(segs, detect_bass_notes(bass_src, segs))
        segs = apply_key_prior(segs, key)

        return Chart(
            source=ingested.source,
            analysis=Analysis(engineVersion=__version__, createdAt=created_at),
            key=key,
            scales=suggest_scales(key.tonic, key.mode),
            tempo=Tempo(bpm=bpm),
            beats=beats,
            chords=segs,
        )
    finally:
        if not keep_audio and own_workdir:
            shutil.rmtree(workdir, ignore_errors=True)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_pipeline.py -v`
Expected: PASS.

- [ ] **Step 5: Implement `engine/cli.py`**

```python
import argparse
from datetime import datetime, timezone

from engine.pipeline import analyze


def main() -> None:
    parser = argparse.ArgumentParser(description="tabIt MIR engine: audio -> chord chart JSON")
    parser.add_argument("source", help="YouTube URL or path to an audio file")
    parser.add_argument("-o", "--out", default="chart.json", help="output JSON path")
    args = parser.parse_args()

    created_at = datetime.now(timezone.utc).isoformat()
    chart = analyze(args.source, created_at=created_at)
    with open(args.out, "w") as f:
        f.write(chart.model_dump_json(indent=2))
    print(f"Wrote {args.out}: key={chart.key.tonic} {chart.key.mode}, "
          f"{len(chart.chords)} chords, {chart.tempo.bpm:.0f} BPM")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Manual end-to-end smoke with real models**

Run:
```bash
python -m engine.cli tests/fixtures/tone_440.wav -o /tmp/chart.json && cat /tmp/chart.json
```
Expected: writes a valid chart JSON (chords list may be short/empty for a pure tone) and prints the summary line. Confirms all real stages wire together.

- [ ] **Step 7: Commit**

```bash
git add engine/pipeline.py engine/cli.py tests/test_pipeline.py
git commit -m "feat: end-to-end pipeline + CLI"
```

---

### Task 11: Accuracy harness

Score the engine against a short, hand-labeled reference clip using `mir_eval`, so accuracy is a measured number (portfolio-worthy) rather than a vibe. This is an integration test.

**Files:**
- Create: `tests/integration/test_accuracy.py`
- Create: `tests/fixtures/ref_clip/` — a ~20–30s royalty-free/self-recorded simple pop clip (`clip.wav`) and a ground-truth `clip.lab` in Harte `.lab` format (`start end label` per line).

**Interfaces:**
- Consumes: `engine.pipeline.analyze`, `mir_eval.chord`.
- Produces: a measured majmin chord score printed and asserted above a floor.

- [ ] **Step 1: Add the reference clip + label file**

Place a short simple-pop clip at `tests/fixtures/ref_clip/clip.wav` and hand-label it at `tests/fixtures/ref_clip/clip.lab`, e.g.:
```
0.000 2.000 A:min
2.000 4.000 F:maj
4.000 6.000 C:maj
6.000 8.000 G:maj
```

- [ ] **Step 2: Write the accuracy test `tests/integration/test_accuracy.py`**

```python
import pytest
import mir_eval

from engine.pipeline import analyze


def _load_lab(path):
    intervals, labels = [], []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            start, end, label = line.split(maxsplit=2)
            intervals.append([float(start), float(end)])
            labels.append(label.strip())
    return intervals, labels


@pytest.mark.integration
def test_majmin_accuracy_above_floor():
    ref_int, ref_lab = _load_lab("tests/fixtures/ref_clip/clip.lab")
    chart = analyze("tests/fixtures/ref_clip/clip.wav",
                    created_at="2026-07-09T00:00:00Z")
    est_int = [[c.start, c.end] for c in chart.chords]
    est_lab = [f"{c.root}:{'min' if c.quality == 'min' else 'maj'}" for c in chart.chords]

    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int[0][0], ref_int[-1][1],
        mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    (ints, ref_l, est_l) = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(ints)
    comparisons = mir_eval.chord.majmin(ref_l, est_l)
    score = mir_eval.chord.weighted_accuracy(comparisons, durations)

    print(f"\nmajmin weighted accuracy: {score:.3f}")
    assert score >= 0.4  # honest floor for a simple clip; ratchet up as the engine improves
```

- [ ] **Step 3: Run the accuracy harness**

Run: `pytest tests/integration/test_accuracy.py -v -m integration -s`
Expected: prints a majmin accuracy figure and PASSES (≥ 0.4). Record the number in the README progress section.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/test_accuracy.py tests/fixtures/ref_clip/
git commit -m "test: mir_eval accuracy harness on reference clip"
```

---

## Self-Review

**Spec coverage:**
- v1 chords + timeline → Tasks 6, 9, 10. ✅
- Key detection → Task 5. ✅
- Scale suggestions → Task 2. ✅
- Demucs separation + slash chords ("push the bounds") → Tasks 7, 8, 9 (`reconcile_bass`). ✅
- Chart JSON contract → Task 1. ✅
- Audio discarded after analysis → Task 10 (`finally: shutil.rmtree`). ✅
- Confidence per chord → Task 1 (`ChordSegment.confidence`), populated Tasks 6/9. ✅
- Swappable chord model (BTC upgrade path) → Task 6 (`ChordModel`/`chord_model` injection) + Task 10. ✅
- Accuracy measured with mir_eval → Task 11. ✅
- Deferred (allin1 sections, web app, extension, MERT) → correctly NOT in this plan. ✅

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The one human-supplied asset (the reference clip in Task 11) is explicitly described with format and example. ✅

**Type consistency:** `RawChord`, `ChordSegment`, `Key`, `Scale`, `Chart`, `format_label`, `suggest_scales`, `parse_harte`, `raw_to_segments`, `separate`/`harmonic_mix`, `detect_bass_notes`, and the post-process functions have identical signatures where produced and consumed across Tasks 1–11. `analyze()`'s injected `chord_model` matches the `ChordModel.predict(wav_path) -> list[RawChord]` shape used by both `CremaChordModel` and `FakeChordModel`. ✅

**Known risk to watch during execution:** Task 0's heavy-dependency install (crema/CREPE both pull TensorFlow; Essentia is native). If wheels conflict on Python 3.11, resolve pins in Task 0 before continuing — everything downstream assumes those imports work.
