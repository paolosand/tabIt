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


BASS_CONF_MIN = 0.5


def reconcile_bass(segs: list[ChordSegment], bass_reads: list[tuple[str, float | None]]) -> list[ChordSegment]:
    """Attach CREPE bass as a slash ONLY when confident AND a chord tone.

    conf None means the read is the segment's own (crema) bass -- kept untouched, so
    crema's slash chords survive low-confidence CREPE (invariant from cd9772f).
    A failed gate is likewise a no-op on the segment's existing (crema) bass:
    gating only ever refuses CREPE's annotation, it never rewrites crema's.
    """
    from engine.notes import chord_tone_classes

    out = []
    for s, (pc, conf) in zip(segs, bass_reads):
        if conf is None:
            out.append(s.model_copy())
            continue
        b = normalize_note(pc)
        if conf >= BASS_CONF_MIN and b in chord_tone_classes(s.root, s.quality):
            new_bass = b
        else:
            new_bass = s.bass
        out.append(s.model_copy(update={
            "bass": new_bass,
            "label": format_label(s.root, s.quality, new_bass),
        }))
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


def _local_beat_interval(beats: list[float], t: float) -> float:
    if len(beats) < 2:
        return 0.5
    import bisect
    i = min(max(bisect.bisect_left(beats, t), 1), len(beats) - 1)
    return beats[i] - beats[i - 1]


def merge_short(segs: list[ChordSegment], beats: list[float]) -> list[ChordSegment]:
    """Absorb non-N segments shorter than 2 local beats into the more tone-similar
    non-N neighbor (tie -> earlier). N segments are never created, absorbed or crossed."""
    from engine.notes import chord_tone_classes
    out = [s.model_copy() for s in segs]
    changed = True
    while changed:
        changed = False
        for i, s in enumerate(out):
            if s.quality == "N":
                continue
            if s.end - s.start >= 2 * _local_beat_interval(beats, s.start):
                continue
            prev = out[i - 1] if i > 0 and out[i - 1].quality != "N" else None
            nxt = out[i + 1] if i < len(out) - 1 and out[i + 1].quality != "N" else None
            if prev is None and nxt is None:
                continue
            tones = chord_tone_classes(s.root, s.quality)
            p_score = len(tones & chord_tone_classes(prev.root, prev.quality)) if prev else -1
            n_score = len(tones & chord_tone_classes(nxt.root, nxt.quality)) if nxt else -1
            if p_score >= n_score:
                out[i - 1] = prev.model_copy(update={"end": s.end})
            else:
                out[i + 1] = nxt.model_copy(update={"start": s.start})
            del out[i]
            changed = True
            break
    return out
