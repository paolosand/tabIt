import random
from engine.meter import detect_meter


def _grid(n, interval=0.5, start=0.0):
    return [start + i * interval for i in range(n)]


def test_recovers_4_4_with_jitter():
    beats = _grid(64)
    rng = random.Random(7)
    changes = [beats[i] + rng.uniform(-0.05, 0.05) for i in range(0, 64, 8)]  # every 2 bars of 4
    meter, downbeats = detect_meter(beats, changes)
    assert meter.beatsPerBar == 4
    assert meter.confidence > 0
    assert downbeats[0] == beats[0] and downbeats[1] == beats[4]


def test_recovers_3_4_with_phase():
    beats = _grid(60)
    changes = [beats[i] for i in range(2, 60, 3)]   # bars of 3, phase 2
    meter, downbeats = detect_meter(beats, changes)
    assert meter.beatsPerBar == 3
    assert downbeats[0] == beats[2]


def test_degenerate_input_reports_unknown():
    meter, downbeats = detect_meter(_grid(5), [0.0])
    assert (meter.beatsPerBar, meter.confidence) == (4, 0.0)
    assert downbeats == []


def test_misaligned_changes_report_zero_confidence_and_no_downbeats():
    # Every change lands exactly halfway between beats (0.25s off a 0.5s grid),
    # which is beyond TOLERANCE (0.12s) from any mark of any candidate grid
    # (marks are always a subsequence of the 0.5s-spaced beats). No hypothesis
    # aligns with anything, so the best adjusted score is <= 0 and confidence
    # must be 0.0 -- and at zero confidence there must be no authoritative
    # downbeats (the ribbon should fall back to %4), not a leftover best-guess.
    beats = _grid(64)
    changes = [beats[i] + 0.25 for i in range(0, 64, 8)]
    meter, downbeats = detect_meter(beats, changes)
    assert meter.confidence == 0.0
    assert downbeats == []
