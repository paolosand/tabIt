from engine.beats import track_beats


def test_track_beats_returns_bpm_and_sorted_times(tone_440_wav):
    bpm, beats = track_beats(tone_440_wav)
    assert bpm >= 0.0
    assert isinstance(beats, list)
    assert beats == sorted(beats)
    assert all(isinstance(b, float) for b in beats)
