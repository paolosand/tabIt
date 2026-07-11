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


# quality -> semitone intervals from the root, used to gate slash-chord bass
# reads to actual chord tones. Covers every key in schema.QUALITY_SUFFIX plus
# "N" (no chord).
QUALITY_TONES: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7), "min": (0, 3, 7), "dom7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11), "min7": (0, 3, 7, 10), "dim": (0, 3, 6),
    "aug": (0, 4, 8), "sus2": (0, 2, 7), "sus4": (0, 5, 7),
    "6": (0, 4, 7, 9), "min6": (0, 3, 7, 9), "hdim7": (0, 3, 6, 10),
    "dim7": (0, 3, 6, 9), "minmaj7": (0, 3, 7, 11),
    "9": (0, 2, 4, 7, 10), "maj9": (0, 2, 4, 7, 11), "min9": (0, 2, 3, 7, 10),
    "N": (),
}


def chord_tone_classes(root: str, quality: str) -> set[str]:
    """Pitch-class names belonging to the given root/quality chord."""
    if root == "N" or quality == "N":
        return set()
    root_idx = NOTES.index(normalize_note(root))
    return {NOTES[(root_idx + iv) % 12] for iv in QUALITY_TONES.get(quality, (0, 4, 7))}
