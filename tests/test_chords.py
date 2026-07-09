import pytest
from engine.chords import parse_harte, RawChord, raw_to_segments


def test_parse_harte_major_minor():
    assert parse_harte("C:maj") == ("C", "maj", "C")
    assert parse_harte("A:min") == ("A", "min", "A")


def test_parse_harte_sevenths():
    assert parse_harte("G:7") == ("G", "dom7", "G")
    assert parse_harte("D:min7") == ("D", "min7", "D")
    assert parse_harte("F:maj7") == ("F", "maj7", "F")
    assert parse_harte("B:hdim7") == ("B", "hdim7", "B")


def test_parse_harte_slash_bass_interval():
    # C major with the 5th (G) in the bass
    assert parse_harte("C:maj/5") == ("C", "maj", "G")
    # A minor with the b3 (C) in the bass
    assert parse_harte("A:min/b3") == ("A", "min", "C")


def test_parse_harte_no_chord():
    assert parse_harte("N") == ("N", "N", "N")


def test_parse_harte_flat_root_normalized():
    assert parse_harte("Bb:maj") == ("A#", "maj", "A#")


def test_raw_to_segments_builds_labels():
    raws = [RawChord(0.0, 2.0, "A", "min", "A", 0.8),
            RawChord(2.0, 4.0, "C", "maj", "G", 0.6)]
    segs = raw_to_segments(raws)
    assert segs[0].label == "Am"
    assert segs[1].label == "C/G"
    assert segs[1].confidence == 0.6


@pytest.mark.integration
def test_crema_model_predicts(tone_440_wav):
    from engine.chords import CremaChordModel
    raws = CremaChordModel().predict(tone_440_wav)
    assert isinstance(raws, list)
    for r in raws:
        assert r.end >= r.start
