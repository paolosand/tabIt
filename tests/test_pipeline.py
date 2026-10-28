import threading

from engine.pipeline import analyze
from engine.chords import RawChord
from engine.schema import Key
from engine import engine_version


class FakeBtcModel:
    def __init__(self):
        self.seen = []

    def predict(self, wav_path):
        self.seen.append(wav_path)
        return [RawChord(0.0, 1.0, "A", "min", "A", 0.8),
                RawChord(1.0, 2.0, "F", "maj", "F", 0.7)]


def _stub_common(p, monkeypatch):
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0]))
    monkeypatch.setattr(p, "detect_key", lambda w: Key(tonic="A", mode="minor", confidence=0.7))


def test_analyze_local_file_end_to_end(tone_440_wav, tmp_path, monkeypatch):
    # Stub the heavy stages so this stays a fast unit test of the wiring.
    import engine.pipeline as p
    _stub_common(p, monkeypatch)
    model = FakeBtcModel()

    steps = []
    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=model, on_step=steps.append)

    assert model.seen == [str(tmp_path / "audio.wav")]   # the original mix
    assert steps == ["ingest", "chords", "finalize"]
    assert chart.schemaVersion == 1
    assert chart.analysis.engineVersion == engine_version()
    assert chart.key.tonic == "A"
    assert chart.tempo.bpm == 120.0
    assert [c.label for c in chart.chords] == ["Am", "F"]
    assert any("pentatonic" in s.name for s in chart.scales)
    # no slash/bass data: every segment's bass is explicitly its own root
    assert all(c.bass == c.root for c in chart.chords)
    # Meter is always wired up; the stub's degenerate 2-chord/5-beat input has
    # too few beats and changes for detect_meter to report anything, so the
    # ribbon should fall back to %4 rather than carry a leftover downbeat list.
    assert chart.meter is not None
    assert chart.downbeats == []


def test_analyze_overlaps_key_and_beats_with_the_chord_model(tone_440_wav, tmp_path, monkeypatch):
    """Key detection and beat tracking need only the original wav, so they run
    while the chord model is in flight."""
    import engine.pipeline as p
    started = threading.Event()
    overlap = {}

    def fake_key(w):
        started.set()
        return Key(tonic="A", mode="minor", confidence=0.7)

    class Slow(FakeBtcModel):
        def predict(self, wav_path):
            overlap["key_during_chords"] = started.wait(5.0)
            return super().predict(wav_path)

    monkeypatch.setattr(p, "detect_key", fake_key)
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0]))

    analyze(tone_440_wav, created_at="x", workdir=str(tmp_path), chord_model=Slow())

    assert overlap["key_during_chords"] is True


def test_chords_are_snapped_to_the_beat_grid(tone_440_wav, tmp_path, monkeypatch):
    import engine.pipeline as p
    _stub_common(p, monkeypatch)

    class OffGrid(FakeBtcModel):
        def predict(self, wav_path):
            return [RawChord(0.04, 1.02, "A", "min", "A", 0.8),
                    RawChord(1.02, 1.97, "F", "maj", "F", 0.7)]

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=OffGrid())

    assert [(c.start, c.end) for c in chart.chords] == [(0.0, 1.0), (1.0, 2.0)]


def test_analyze_survives_broken_step_callback(tone_440_wav, tmp_path, monkeypatch):
    """A UI-side bug in the progress callback must never break an analysis."""
    import engine.pipeline as p
    _stub_common(p, monkeypatch)

    def bad_callback(step):
        raise RuntimeError("ui bug")

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=FakeBtcModel(),
                    on_step=bad_callback)

    assert [c.label for c in chart.chords] == ["Am", "F"]


def test_default_chord_model_comes_from_selection(tone_440_wav, tmp_path, monkeypatch):
    import engine.pipeline as p
    _stub_common(p, monkeypatch)
    monkeypatch.setattr(p, "select_chord_model", FakeBtcModel)

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z", workdir=str(tmp_path))

    assert chart.analysis.engineVersion == engine_version()


def test_keeps_a_one_beat_passing_chord_and_drops_zero_length_segments(
        tone_440_wav, tmp_path, monkeypatch):
    """MIN_SEGMENT_SEC already removed flicker inside the model, so a genuine
    1-beat passing chord must survive the pipeline."""
    import engine.pipeline as p
    _stub_common(p, monkeypatch)
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]))

    class Passing(FakeBtcModel):
        def predict(self, wav_path):
            return [RawChord(0.0, 1.5, "A", "min", "A", 0.8),
                    RawChord(1.5, 2.0, "G", "maj", "G", 0.8),      # 1 beat at 120 BPM
                    RawChord(2.0, 3.0, "F", "maj", "F", 0.8),
                    RawChord(3.0, 3.1, "C", "maj", "C", 0.8)]      # snaps to zero length

    chart = analyze(tone_440_wav, created_at="x", workdir=str(tmp_path), chord_model=Passing())

    assert [c.label for c in chart.chords] == ["Am", "G", "F"]
    assert all(c.end > c.start for c in chart.chords)
