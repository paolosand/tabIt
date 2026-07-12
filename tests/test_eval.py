import numpy as np
import pytest

from engine.eval import to_mir_label, chords_to_mir, score_chart, load_lab
from engine.schema import ChordSegment


def _seg(start, end, root, quality):
    return ChordSegment(start=start, end=end, label="x",
                        root=root, quality=quality, bass=root, confidence=1.0)


def test_to_mir_label_maps_engine_qualities():
    assert to_mir_label("C", "maj") == "C:maj"
    assert to_mir_label("A", "min") == "A:min"
    assert to_mir_label("G", "dom7") == "G:7"
    assert to_mir_label("C", "6") == "C:maj6"
    assert to_mir_label("N", "N") == "N"
    # unknown quality falls back to maj
    assert to_mir_label("D", "weird") == "D:maj"


def test_chords_to_mir_applies_offset():
    chords = [_seg(0.0, 2.0, "C", "maj"), _seg(2.0, 4.0, "A", "min")]
    intervals, labels = chords_to_mir(chords, offset_sec=1.5)
    assert labels == ["C:maj", "A:min"]
    np.testing.assert_allclose(intervals, [[1.5, 3.5], [3.5, 5.5]])


def test_score_chart_perfect_match_is_one():
    ref_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    ref_lab = ["C:maj", "A:min"]
    est_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    est_lab = ["C:maj", "A:min"]
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    assert scores["majmin"] == pytest.approx(1.0)
    assert scores["root"] == pytest.approx(1.0)
    assert scores["sevenths"] == pytest.approx(1.0)


def test_score_chart_half_wrong_is_half():
    ref_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    ref_lab = ["C:maj", "A:min"]
    est_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    est_lab = ["C:maj", "C:maj"]  # second chord wrong
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    assert scores["majmin"] == pytest.approx(0.5)


def test_load_lab_round_trips(tmp_path):
    lab = tmp_path / "x.lab"
    lab.write_text("0.000 2.000 C:maj\n2.000 4.000 A:min\n")
    intervals, labels = load_lab(str(lab))
    assert labels == ["C:maj", "A:min"]
    np.testing.assert_allclose(intervals, [[0.0, 2.0], [2.0, 4.0]])
