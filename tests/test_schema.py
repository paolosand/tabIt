import json
from engine.schema import (
    Source, Analysis, Key, Scale, Tempo, ChordSegment, Chart, format_label,
)


def test_format_label_basic_qualities():
    assert format_label("C", "maj", "C") == "C"
    assert format_label("A", "min", "A") == "Am"
    assert format_label("G", "dom7", "G") == "G7"
    assert format_label("C", "maj7", "C") == "Cmaj7"
    assert format_label("D", "min7", "D") == "Dm7"
    assert format_label("B", "hdim7", "B") == "Bm7b5"


def test_format_label_slash_chord():
    assert format_label("C", "maj", "G") == "C/G"
    assert format_label("A", "min", "C") == "Am/C"


def test_format_label_no_chord():
    assert format_label("N", "N", "N") == "N"


def test_chart_roundtrips_json():
    chart = Chart(
        source=Source(kind="file", duration=6.3, title="t"),
        analysis=Analysis(engineVersion="0.1.0", createdAt="2026-07-09T00:00:00Z"),
        key=Key(tonic="A", mode="minor", confidence=0.71),
        scales=[Scale(name="A minor pentatonic", notes=["A", "C", "D", "E", "G"])],
        tempo=Tempo(bpm=120.5),
        beats=[0.42, 0.92],
        chords=[ChordSegment(start=0.42, end=2.40, label="Am", root="A",
                             quality="min", bass="A", confidence=0.83)],
    )
    dumped = chart.model_dump_json()
    reloaded = Chart.model_validate(json.loads(dumped))
    assert reloaded.schemaVersion == 1
    assert reloaded.sections == []
    assert reloaded.chords[0].label == "Am"
