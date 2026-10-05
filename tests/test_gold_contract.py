"""Contract between the annotator tool (web/) and the existing scorer.

tests/fixtures/gold_sample.lab is produced byte-for-byte by web/src/lib/gold/lab.ts
(asserted by web/tools/lab-contract.test.ts). Here the same file is loaded and scored
by engine.eval to prove the scorer needs no converter and ignores X spans.
"""
from pathlib import Path

import numpy as np
import pytest

from engine.eval import load_lab, score_chart

FIXTURE = Path(__file__).parent / "fixtures" / "gold_sample.lab"


def test_gold_lab_loads_and_covers_the_song_contiguously():
    intervals, labels = load_lab(FIXTURE)
    assert labels == ["X", "A:min", "F:maj", "C:maj", "X"]
    assert intervals[0][0] == 0.0 and intervals[-1][1] == 12.0
    assert np.all(intervals[1:, 0] == intervals[:-1, 1])


def test_scorer_ignores_x_spans_on_every_metric():
    ref_int, ref_lab = load_lab(FIXTURE)
    est_int = np.array([[0.0, 4.0], [4.0, 6.0], [6.0, 8.0], [8.0, 12.0]])
    est_lab = ["A:min", "F:maj", "G:maj", "N"]
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    # Of the three labeled 2-second spans, two match; the X gap and X tail do not count.
    for metric in ("root", "majmin", "sevenths"):
        assert scores[metric] == pytest.approx(4 / 6)
