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

    Two different windows are used over the same segment: the pitch estimate is
    the median frequency of the confident frames only (window_mask & conf > 0.5),
    but the reported confidence is the median CREPE confidence over the WHOLE
    segment window (window_mask alone, unfiltered by conf). Reporting the median
    of an already conf > 0.5 -filtered set would always be > 0.5 by construction,
    making BASS_CONF_MIN in reconcile_bass unfalsifiable on real data; taking the
    median over all frames lets a few confident frames amid a mostly-unconfident
    segment read as low confidence, as it should.

    Returns (pitch_class, median_confidence); confidence None means CREPE had no
    confident frames and the value is the segment's existing (crema) bass.
    """
    import crepe
    import librosa

    y, sr = librosa.load(bass_wav, sr=16000, mono=True)
    times, freqs, conf, _ = crepe.predict(y, sr, viterbi=True, step_size=50)

    result: list[tuple[str, float | None]] = []
    for seg in segments:
        window_mask = (times >= seg.start) & (times < seg.end)
        conf_mask = window_mask & (conf > 0.5)
        if not conf_mask.any():
            result.append((seg.bass, None))
            continue
        pc = _hz_to_pitch_class(float(np.median(freqs[conf_mask])))
        if pc is None:
            result.append((seg.bass, None))
        else:
            result.append((pc, float(np.median(conf[window_mask]))))
    return result
