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
