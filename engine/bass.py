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
