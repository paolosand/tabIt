"""Shared mir_eval chord-scoring helpers.

Used by the synthetic regression test (tests/integration/test_accuracy.py)
and the real-song benchmark (benchmarks/chord_accuracy.py) so there is one
scoring code path. Scores are mir_eval weighted accuracy in [0, 1].
"""
import numpy as np
import mir_eval

# engine chord quality -> mir_eval chord quality shorthand (see engine.schema
# QUALITY_SUFFIX for the engine vocabulary; mir_eval.chord.QUALITIES for targets)
MIR_QUALITY = {
    "maj": "maj", "min": "min", "dom7": "7", "maj7": "maj7", "min7": "min7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4", "6": "maj6",
    "min6": "min6", "hdim7": "hdim7", "dim7": "dim7", "minmaj7": "minmaj7",
    "9": "9", "maj9": "maj9", "min9": "min9",
}

_COMPARATORS = {
    "root": mir_eval.chord.root,
    "majmin": mir_eval.chord.majmin,
    "sevenths": mir_eval.chord.sevenths,
}


def to_mir_label(root: str, quality: str) -> str:
    """Format an engine (root, quality) as a mir_eval/Harte chord label.

    Inversion (bass) is intentionally omitted: the reported metrics
    (majmin, sevenths, root) all ignore inversion.
    """
    if root == "N" or quality == "N":
        return "N"
    return f"{root}:{MIR_QUALITY.get(quality, 'maj')}"


def load_lab(path):
    """Parse a Harte `.lab` file: whitespace-separated `start end label` lines."""
    intervals, labels = [], []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            start, end, label = line.split(maxsplit=2)
            intervals.append([float(start), float(end)])
            labels.append(label.strip())
    return np.array(intervals, dtype=float), labels


def chords_to_mir(chords, offset_sec: float = 0.0):
    """Convert engine ChordSegments to (intervals, mir_eval labels).

    offset_sec shifts every interval later, compensating for a constant
    intro-padding difference between the annotated master and the fetched audio.
    """
    intervals = np.array(
        [[c.start + offset_sec, c.end + offset_sec] for c in chords], dtype=float)
    labels = [to_mir_label(c.root, c.quality) for c in chords]
    return intervals, labels


def score_chart(ref_int, ref_lab, est_int, est_lab,
                metrics=("majmin", "sevenths", "root")) -> dict:
    """Weighted-accuracy score of estimated chords vs reference, per metric."""
    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int[0][0], ref_int[-1][1],
        mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    ints, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(ints)
    scores = {}
    for m in metrics:
        comparisons = _COMPARATORS[m](ref_l, est_l)
        scores[m] = float(mir_eval.chord.weighted_accuracy(comparisons, durations))
    return scores
