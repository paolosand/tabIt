NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_FLAT_TO_SHARP = {
    "Cb": "B", "Db": "C#", "Eb": "D#", "Fb": "E",
    "Gb": "F#", "Ab": "G#", "Bb": "A#",
}


def normalize_note(name: str) -> str:
    """Normalize a note name to canonical sharp spelling (title-cased, trimmed)."""
    n = name.strip()
    n = n[0].upper() + n[1:] if n else n
    if n in _FLAT_TO_SHARP:
        return _FLAT_TO_SHARP[n]
    return n
