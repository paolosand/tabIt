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
