from engine.schema import ChordSegment, Key
from engine.postprocess import (
    snap_to_beats, merge_adjacent, reconcile_bass, apply_key_prior,
)
from engine.schema import format_label


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
    out = reconcile_bass(segs, [("G", 0.8)])
    assert out[0].bass == "G"
    assert out[0].label == "C/G"


def test_reconcile_bass_keeps_root_when_same():
    segs = [_seg(0.0, 1.0, "C", "maj", "C")]
    out = reconcile_bass(segs, [("C", 0.8)])
    assert out[0].label == "C"


def test_chord_tone_classes_covers_all_qualities():
    from engine.notes import QUALITY_TONES, chord_tone_classes
    from engine.schema import QUALITY_SUFFIX
    assert set(QUALITY_SUFFIX) <= set(QUALITY_TONES)
    assert chord_tone_classes("C", "maj") == {"C", "E", "G"}
    assert chord_tone_classes("A", "min7") == {"A", "C", "E", "G"}
    assert chord_tone_classes("N", "N") == set()


def test_confident_chord_tone_bass_becomes_slash():
    segs = [_seg(0.0, 2.0, "C", "maj", "C")]
    out = reconcile_bass(segs, [("G", 0.8)])
    assert out[0].bass == "G" and out[0].label == "C/G"


def test_confident_non_chord_tone_bass_is_gated():
    segs = [_seg(0.0, 2.0, "C", "maj", "C")]
    out = reconcile_bass(segs, [("F#", 0.9)])  # confident but not a C-major tone
    assert out[0].bass == "C" and out[0].label == "C"


def test_low_confidence_crepe_bass_is_gated():
    segs = [_seg(0.0, 2.0, "C", "maj", "C")]
    out = reconcile_bass(segs, [("G", 0.3)])
    assert out[0].bass == "C" and out[0].label == "C"


def test_crema_slash_preserved_when_crepe_has_nothing():
    segs = [_seg(0.0, 2.0, "C", "maj", "E")]  # crema's own C/E
    out = reconcile_bass(segs, [("E", None)])  # None = fallback, not CREPE
    assert out[0].bass == "E" and out[0].label == "C/E"


def test_apply_key_prior_lowers_out_of_key_confidence():
    # C# is out of key in C major; its confidence should drop.
    # Note: brief had E (which IS in C major); corrected to C# (which is NOT in C major).
    segs = [_seg(0.0, 1.0, "C#", "maj", "C#", conf=0.8)]
    out = apply_key_prior(segs, Key(tonic="C", mode="major", confidence=0.9))
    assert out[0].confidence < 0.8
