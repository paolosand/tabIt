import numpy as np
import pytest
from engine.bass import _hz_to_pitch_class
from engine.notes import NOTES


def test_predict_bass_pitch_requests_small_capacity(monkeypatch):
    """CREPE 'small' is 8x faster than 'full' with ~92% pitch-class agreement
    on confident frames; the confidence gate downstream absorbs the rest."""
    import crepe
    import librosa
    from engine.bass import predict_bass_pitch

    seen = {}

    def fake_load(path, sr=16000, mono=True):
        return np.zeros(1600, dtype=np.float32), sr

    def fake_predict(y, sr, viterbi=True, step_size=50, model_capacity="full", **kwargs):
        seen["capacity"] = model_capacity
        return np.array([0.0]), np.array([110.0]), np.array([0.9]), None

    monkeypatch.setattr(librosa, "load", fake_load)
    monkeypatch.setattr(crepe, "predict", fake_predict)

    times, freqs, conf = predict_bass_pitch("unused.wav")
    assert seen["capacity"] == "small"
    assert len(times) == len(freqs) == len(conf) == 1


def test_window_bass_notes_is_pure_windowing():
    """Windowing a precomputed pitch track must not touch CREPE, so the bulk
    prediction can run concurrently with the chord model in the pipeline."""
    from engine.bass import window_bass_notes
    from engine.schema import ChordSegment

    times = np.array([0.0, 0.25, 0.5, 0.75])
    freqs = np.array([110.0, 110.0, 110.0, 220.0])  # A2 x3, A3 (median 110 = A)
    conf = np.array([0.9, 0.9, 0.9, 0.9])
    segs = [ChordSegment(start=0.0, end=1.0, label="A", root="A",
                         quality="maj", bass="A", confidence=0.9)]

    out = window_bass_notes((times, freqs, conf), segs)
    assert out == [("A", 0.9)]


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
    pc, conf = out[0]
    assert pc in NOTES
    assert conf is None or isinstance(conf, float)


def test_detect_bass_notes_low_confidence_falls_back_to_crema_bass(monkeypatch):
    """Regression test: when CREPE can't confirm a bass pitch (silent/low-confidence
    stem), detect_bass_notes must fall back to crema's own parsed bass note (e.g. the
    "G" in a C/G slash chord), NOT the chord root. Falling back to root would silently
    erase crema's native slash-chord detection whenever CREPE is unsure -- this is
    exactly what reconcile_bass() then bakes into the final label. CREPE is monkeypatched
    here so this stays a fast, non-integration unit test.
    """
    import crepe
    import librosa
    from engine.bass import detect_bass_notes
    from engine.schema import ChordSegment

    def fake_load(path, sr=16000, mono=True):
        return np.zeros(1600, dtype=np.float32), sr

    def fake_predict(y, sr, viterbi=True, step_size=50, **kwargs):
        # Confidence always below the 0.5 threshold used by detect_bass_notes,
        # regardless of what pitch CREPE thinks it hears.
        times = np.array([0.0, 0.5])
        freqs = np.array([98.0, 98.0])  # G2 -- doesn't matter, confidence too low
        conf = np.array([0.1, 0.1])
        return times, freqs, conf, None

    monkeypatch.setattr(librosa, "load", fake_load)
    monkeypatch.setattr(crepe, "predict", fake_predict)

    # crema already detected this as a C/G slash chord (root="C", bass="G").
    segs = [ChordSegment(start=0.0, end=1.0, label="C/G", root="C",
                         quality="maj", bass="G", confidence=0.8)]
    out = detect_bass_notes("unused.wav", segs)
    assert out == [("G", None)]


def test_detect_bass_notes_sparse_confident_frames_read_low_confidence(monkeypatch):
    """Regression test for the vacuous confidence gate: detect_bass_notes must not
    mask frames to conf > 0.5 and then report the median of that already-filtered
    set (a median of values all > 0.5 is always > 0.5, so BASS_CONF_MIN = 0.5 in
    reconcile_bass could never fail on real output). A segment with only a couple
    of high-confidence CREPE frames amid many low-confidence ones must still read
    as low confidence overall -- the pitch estimate comes from the confident-frame
    subset, but the reported confidence is the median over the WHOLE segment
    window, so sparse confident frames don't launder a mostly-unconfident read.
    """
    import crepe
    import librosa
    from engine.bass import detect_bass_notes
    from engine.schema import ChordSegment

    def fake_load(path, sr=16000, mono=True):
        return np.zeros(1600, dtype=np.float32), sr

    def fake_predict(y, sr, viterbi=True, step_size=50, **kwargs):
        times = np.array([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
        # Only the first two frames are confident (>0.5); the other eight aren't.
        freqs = np.array([440.0, 440.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0])
        conf = np.array([0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])
        return times, freqs, conf, None

    monkeypatch.setattr(librosa, "load", fake_load)
    monkeypatch.setattr(crepe, "predict", fake_predict)

    segs = [ChordSegment(start=0.0, end=1.0, label="A", root="A",
                         quality="maj", bass="A", confidence=0.9)]
    out = detect_bass_notes("unused.wav", segs)
    pc, conf = out[0]
    assert pc == "A"          # pitch still comes from the confident-frame subset
    assert conf < 0.5         # but reported confidence is over the whole window
