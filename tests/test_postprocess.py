from engine.schema import ChordSegment, Key
from engine.postprocess import (
    snap_to_beats, merge_adjacent, apply_key_prior, simplify_quality,
)


def _seg(start=0.0, end=1.0, root="C", quality="maj", bass="C", conf=0.8):
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


def test_chord_tone_classes_covers_all_qualities():
    from engine.notes import QUALITY_TONES, chord_tone_classes
    from engine.schema import QUALITY_SUFFIX
    assert set(QUALITY_SUFFIX) <= set(QUALITY_TONES)
    assert chord_tone_classes("C", "maj") == {"C", "E", "G"}
    assert chord_tone_classes("A", "min7") == {"A", "C", "E", "G"}
    assert chord_tone_classes("N", "N") == set()


def test_apply_key_prior_lowers_out_of_key_confidence():
    # C# is out of key in C major; its confidence should drop.
    # Note: brief had E (which IS in C major); corrected to C# (which is NOT in C major).
    segs = [_seg(0.0, 1.0, "C#", "maj", "C#", conf=0.8)]
    out = apply_key_prior(segs, Key(tonic="C", mode="major", confidence=0.9))
    assert out[0].confidence < 0.8


def test_low_confidence_exotic_simplifies_high_survives():
    lo = _seg(root="A#", quality="dim7", conf=0.4)
    hi = _seg(root="A#", quality="dim7", conf=0.9, start=2.0, end=4.0)
    out = simplify_quality([lo, hi])
    assert (out[0].quality, out[0].label) == ("min", "A#m")
    assert out[1].quality == "dim7"


def test_trusted_quality_never_simplifies():
    out = simplify_quality([_seg(root="D", quality="maj7", conf=0.1)])
    assert out[0].quality == "maj7"


def test_simplify_recomputes_label_and_keeps_valid_bass():
    seg = _seg(root="A", quality="sus4", bass="E", conf=0.4)  # E is a sus4 tone AND a maj tone
    out = simplify_quality([seg])
    assert (out[0].quality, out[0].label) == ("maj", "A/E")


def test_simplify_drops_bass_that_left_the_chord():
    seg = _seg(root="A", quality="sus2", bass="B", conf=0.4)  # B is a sus2 tone, not a maj tone
    out = simplify_quality([seg])
    assert (out[0].quality, out[0].bass, out[0].label) == ("maj", "A", "A")
