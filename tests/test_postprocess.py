from engine.schema import ChordSegment, Key
from engine.postprocess import (
    snap_to_beats, merge_adjacent, reconcile_bass, apply_key_prior,
)


def _seg(start, end, root="C", quality="maj", bass="C", conf=0.8):
    from engine.schema import format_label
    return ChordSegment(start=start, end=end, label=format_label(root, quality, bass),
                        root=root, quality=quality, bass=bass, confidence=conf)


def test_snap_to_beats_moves_boundaries_to_nearest_beat():
    segs = [_seg(0.05, 1.03)]
    beats = [0.0, 1.0, 2.0]
    out = snap_to_beats(segs, beats)
    assert out[0].start == 0.0
    assert out[0].end == 1.0


def test_snap_to_beats_noop_without_beats():
    segs = [_seg(0.05, 1.03)]
    assert snap_to_beats(segs, []) == segs


def test_merge_adjacent_collapses_identical():
    segs = [_seg(0.0, 1.0, "A", "min"), _seg(1.0, 2.0, "A", "min"),
            _seg(2.0, 3.0, "F", "maj")]
    out = merge_adjacent(segs)
    assert len(out) == 2
    assert out[0].start == 0.0 and out[0].end == 2.0
    assert out[1].root == "F"


def test_reconcile_bass_emits_slash_chord():
    segs = [_seg(0.0, 1.0, "C", "maj", "C")]
    out = reconcile_bass(segs, ["G"])
    assert out[0].bass == "G"
    assert out[0].label == "C/G"


def test_reconcile_bass_keeps_root_when_same():
    segs = [_seg(0.0, 1.0, "C", "maj", "C")]
    out = reconcile_bass(segs, ["C"])
    assert out[0].label == "C"


def test_apply_key_prior_lowers_out_of_key_confidence():
    # C# is out of key in C major; its confidence should drop.
    # Note: brief had E (which IS in C major); corrected to C# (which is NOT in C major).
    segs = [_seg(0.0, 1.0, "C#", "maj", "C#", conf=0.8)]
    out = apply_key_prior(segs, Key(tonic="C", mode="major", confidence=0.9))
    assert out[0].confidence < 0.8
