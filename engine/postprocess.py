from engine.notes import NOTES, normalize_note
from engine.schema import ChordSegment, Key, format_label
from engine.scales import MAJOR, NAT_MINOR


def _nearest(value: float, points: list[float]) -> float:
    return min(points, key=lambda p: abs(p - value))


def snap_to_beats(segs: list[ChordSegment], beats: list[float]) -> list[ChordSegment]:
    if not beats:
        return segs
    out = []
    for s in segs:
        out.append(s.model_copy(update={
            "start": _nearest(s.start, beats),
            "end": _nearest(s.end, beats),
        }))
    return out


def merge_adjacent(segs: list[ChordSegment]) -> list[ChordSegment]:
    if not segs:
        return []
    out = [segs[0].model_copy()]
    for s in segs[1:]:
        prev = out[-1]
        if (s.root, s.quality, s.bass) == (prev.root, prev.quality, prev.bass):
            out[-1] = prev.model_copy(update={
                "end": s.end,
                "confidence": max(prev.confidence, s.confidence),
            })
        else:
            out.append(s.model_copy())
    return out


def apply_key_prior(segs: list[ChordSegment], key: Key) -> list[ChordSegment]:
    """Softly reduce confidence for chord roots outside the detected key's scale."""
    intervals = NAT_MINOR if key.mode == "minor" else MAJOR
    tonic_idx = NOTES.index(normalize_note(key.tonic))
    in_key = {NOTES[(tonic_idx + iv) % 12] for iv in intervals}
    out = []
    for s in segs:
        if s.root != "N" and s.root not in in_key:
            out.append(s.model_copy(update={"confidence": s.confidence * 0.7}))
        else:
            out.append(s.model_copy())
    return out


SIMPLIFY_CONF_MAX = 0.6
TRUSTED_QUALITIES = {"maj", "min", "dom7", "maj7", "min7", "N"}
SIMPLIFY_MAP = {
    "dim": "min", "dim7": "min", "hdim7": "min", "min6": "min",
    "min9": "min", "minmaj7": "min",
    "aug": "maj", "sus2": "maj", "sus4": "maj", "6": "maj", "9": "maj", "maj9": "maj",
}


def simplify_quality(segs: list[ChordSegment]) -> list[ChordSegment]:
    """Low-confidence exotic qualities collapse to the nearest plain triad (spec 2026-07-11)."""
    from engine.notes import chord_tone_classes
    out = []
    for s in segs:
        if s.quality in TRUSTED_QUALITIES or s.confidence >= SIMPLIFY_CONF_MAX:
            out.append(s.model_copy())
            continue
        q = SIMPLIFY_MAP.get(s.quality, "maj")
        bass = s.bass if s.bass in chord_tone_classes(s.root, q) else s.root
        out.append(s.model_copy(update={
            "quality": q, "bass": bass, "label": format_label(s.root, q, bass),
        }))
    return out
