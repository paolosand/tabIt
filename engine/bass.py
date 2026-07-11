import numpy as np

from engine.notes import NOTES
from engine.schema import ChordSegment


def _hz_to_pitch_class(hz: float) -> str | None:
    if hz <= 0:
        return None
    midi = 69 + 12 * np.log2(hz / 440.0)
    return NOTES[int(round(midi)) % 12]


def detect_bass_notes(bass_wav: str, segments: list[ChordSegment]) -> list[tuple[str, float | None]]:
    """Per-segment bass pitch class from the isolated bass stem via CREPE.

    Returns (pitch_class, median_confidence); confidence None means CREPE had no
    confident frames and the value is the segment's existing (crema) bass.
    """
    import crepe
    import librosa

    y, sr = librosa.load(bass_wav, sr=16000, mono=True)
    times, freqs, conf, _ = crepe.predict(y, sr, viterbi=True, step_size=50)

    result: list[tuple[str, float | None]] = []
    for seg in segments:
        mask = (times >= seg.start) & (times < seg.end) & (conf > 0.5)
        if not mask.any():
            result.append((seg.bass, None))
            continue
        pc = _hz_to_pitch_class(float(np.median(freqs[mask])))
        if pc is None:
            result.append((seg.bass, None))
        else:
            result.append((pc, float(np.median(conf[mask]))))
    return result
