from dataclasses import dataclass

from engine.notes import NOTES, normalize_note
from engine.schema import ChordSegment, format_label

# Harte quality shorthand -> our canonical quality names
_QUALITY_MAP = {
    "maj": "maj", "min": "min", "7": "dom7", "maj7": "maj7", "min7": "min7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4",
    "maj6": "6", "6": "6", "min6": "min6", "hdim7": "hdim7", "dim7": "dim7",
    "minmaj7": "minmaj7", "9": "9", "maj9": "maj9", "min9": "min9",
}

# Harte interval token -> semitones above the root
_INTERVAL_SEMITONES = {
    "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6,
    "5": 7, "#5": 8, "b6": 8, "6": 9, "b7": 10, "7": 11,
}


@dataclass
class RawChord:
    start: float
    end: float
    root: str
    quality: str
    bass: str
    confidence: float


def parse_harte(label: str) -> tuple[str, str, str]:
    """Parse a Harte chord label into (root, quality, bass) with canonical names."""
    if not label or label in ("N", "X"):
        return ("N", "N", "N")

    bass_token = None
    body = label
    if "/" in label:
        body, bass_token = label.split("/", 1)

    if ":" in body:
        root_str, qual_str = body.split(":", 1)
    else:
        root_str, qual_str = body, "maj"

    root = normalize_note(root_str)
    quality = _QUALITY_MAP.get(qual_str, "maj")

    if bass_token is None:
        bass = root
    elif bass_token in _INTERVAL_SEMITONES:
        semis = _INTERVAL_SEMITONES[bass_token]
        bass = NOTES[(NOTES.index(root) + semis) % 12]
    else:
        # absolute note bass (rare)
        bass = normalize_note(bass_token)
    return (root, quality, bass)


def raw_to_segments(raws: list[RawChord]) -> list[ChordSegment]:
    return [
        ChordSegment(
            start=r.start, end=r.end,
            label=format_label(r.root, r.quality, r.bass),
            root=r.root, quality=r.quality, bass=r.bass, confidence=r.confidence,
        )
        for r in raws
    ]


class CremaChordModel:
    """Chord estimator backed by crema (large-vocabulary, structured, slash-capable)."""

    def predict(self, wav_path: str) -> list[RawChord]:
        from crema.analyze import analyze

        jam = analyze(filename=wav_path)
        ann = jam.annotations.search(namespace="chord")[0]
        raws: list[RawChord] = []
        for obs in ann.data:
            root, quality, bass = parse_harte(obs.value)
            raws.append(RawChord(
                start=float(obs.time), end=float(obs.time + obs.duration),
                root=root, quality=quality, bass=bass,
                confidence=float(obs.confidence) if obs.confidence is not None else 0.5,
            ))
        return raws
