import numpy as np
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

    def fake_predict(y, sr, viterbi=True, step_size=50):
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
