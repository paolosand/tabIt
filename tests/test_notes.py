from engine.notes import NOTES, normalize_note


def test_notes_canonical_order():
    assert NOTES == ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def test_normalize_flats_to_sharps():
    assert normalize_note("Bb") == "A#"
    assert normalize_note("Db") == "C#"


def test_normalize_passthrough_and_strip():
    assert normalize_note("C") == "C"
    assert normalize_note("A#") == "A#"
    assert normalize_note(" g ") == "G"
