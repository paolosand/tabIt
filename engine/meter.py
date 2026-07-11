"""Meter (beats-per-bar) detection from the prior that chord changes land on downbeats."""
from engine.schema import Meter

TOLERANCE = 0.12  # s


def _aligned_fraction(beats, changes, k, phase):
    marks = beats[phase::k]
    if not marks:
        return 0.0
    hits = 0
    for c in changes:
        # nearest mark within tolerance
        lo, hi = 0, len(marks) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if marks[mid] < c:
                lo = mid + 1
            else:
                hi = mid
        best = min(
            (abs(marks[j] - c) for j in (lo - 1, lo, lo + 1) if 0 <= j < len(marks)),
            default=1e9,
        )
        if best <= TOLERANCE:
            hits += 1
    return hits / len(changes)


def detect_meter(beats: list[float], change_times: list[float]) -> tuple[Meter, list[float]]:
    if len(beats) < 8 or len(change_times) < 4:
        return Meter(beatsPerBar=4, confidence=0.0), []
    scored = sorted(
        ((_aligned_fraction(beats, change_times, k, p) - 1.0 / k, k, p)
         for k in (2, 3, 4) for p in range(k)),
        reverse=True,
    )
    best, second = scored[0], scored[1]
    best_score, k, p = best
    second_score = second[0]
    confidence = round(max(0.0, min(1.0, best_score - second_score)), 4) if best_score > 0 else 0.0
    # Zero confidence (either because the best adjusted score is <= 0, or
    # because it ties the runner-up) means we have no real evidence for any
    # grid -- don't hand back an authoritative-looking downbeat list in that
    # case; let the caller fall back to %4.
    downbeats = list(beats[p::k]) if confidence > 0.0 else []
    return Meter(beatsPerBar=k, confidence=confidence), downbeats
