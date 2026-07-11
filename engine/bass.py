import numpy as np

from engine.notes import NOTES
from engine.schema import ChordSegment

# (times, frequencies, confidences) for the whole bass stem, all same length.
BassPitchTrack = tuple[np.ndarray, np.ndarray, np.ndarray]


def _hz_to_pitch_class(hz: float) -> str | None:
    if hz <= 0:
        return None
    midi = 69 + 12 * np.log2(hz / 440.0)
    return NOTES[int(round(midi)) % 12]


def predict_bass_pitch(bass_wav: str) -> BassPitchTrack:
    """Bulk CREPE pitch track over the whole bass stem.

    Segment-independent so the pipeline can run it concurrently with the chord
    model. model_capacity='small' is ~8x faster than 'full' with ~92%
    pitch-class agreement on confident frames; downstream confidence gating
    (BASS_CONF_MIN in reconcile_bass) absorbs the difference.
    """
    import crepe
    import librosa

    y, sr = librosa.load(bass_wav, sr=16000, mono=True)
    times, freqs, conf, _ = crepe.predict(
        y, sr, viterbi=True, step_size=50, model_capacity="small", verbose=0)
    return times, freqs, conf


def window_bass_notes(
    track: BassPitchTrack, segments: list[ChordSegment]
) -> list[tuple[str, float | None]]:
    """Per-segment bass pitch class from a precomputed CREPE track.

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
    times, freqs, conf = track

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


def detect_bass_notes(bass_wav: str, segments: list[ChordSegment]) -> list[tuple[str, float | None]]:
    return window_bass_notes(predict_bass_pitch(bass_wav), segments)
