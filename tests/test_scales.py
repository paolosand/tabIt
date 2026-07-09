from engine.scales import suggest_scales


def test_minor_key_suggestions():
    scales = suggest_scales("A", "minor")
    names = [s.name for s in scales]
    assert "A minor pentatonic" in names
    assert "A natural minor" in names
    pent = next(s for s in scales if s.name == "A minor pentatonic")
    assert pent.notes == ["A", "C", "D", "E", "G"]


def test_major_key_suggestions():
    scales = suggest_scales("C", "major")
    names = [s.name for s in scales]
    assert "C major pentatonic" in names
    assert "C major" in names
    major = next(s for s in scales if s.name == "C major")
    assert major.notes == ["C", "D", "E", "F", "G", "A", "B"]


def test_wraps_around_octave():
    pent = next(s for s in suggest_scales("G", "major") if "pentatonic" in s.name)
    assert pent.notes == ["G", "A", "B", "D", "E"]
