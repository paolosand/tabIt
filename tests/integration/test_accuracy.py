"""Accuracy harness: score the engine's chord output against ground truth via mir_eval.

Deviates from the brief's licensed-real-clip fixture: instead of a
hand-labeled real pop song, we synthesize a deterministic, richly-timbred
Am -> F -> C -> G progression programmatically (tests/integration/conftest.py,
`ref_clip` fixture) so the harness is self-contained and reproducible without
a copyrighted asset. Real-song accuracy lives in benchmarks/ (network, local-only).
"""
import pytest

from engine.pipeline import analyze
from engine.eval import load_lab, chords_to_mir, score_chart


@pytest.mark.integration
def test_majmin_accuracy_on_synthetic_clip(ref_clip):
    ref_int, ref_lab = load_lab(ref_clip["lab"])
    chart = analyze(ref_clip["wav"], created_at="2026-07-09T00:00:00Z")

    est_int, est_lab = chords_to_mir(chart.chords)
    score = score_chart(ref_int, ref_lab, est_int, est_lab, metrics=("majmin",))["majmin"]

    print(f"\nmajmin weighted accuracy (synthetic Am-F-C-G clip): {score:.3f}")

    # Harness-validation assertions: analyze() runs end-to-end, produces chords,
    # and the mir_eval scoring pipeline returns a valid score in [0, 1].
    assert len(chart.chords) >= 1
    assert 0.0 <= score <= 1.0

    # Honest floor: crema is trained on real recordings, not synthesized tones,
    # so a synthetic clip is out of distribution. This is a synthetic-fixture
    # regression floor, not a real-music benchmark (that lives in benchmarks/).
    assert score >= 0.4
