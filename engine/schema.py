from pydantic import BaseModel, Field

# quality -> display suffix appended to the root
QUALITY_SUFFIX = {
    "maj": "", "min": "m", "dom7": "7", "maj7": "maj7", "min7": "m7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4", "6": "6",
    "min6": "m6", "hdim7": "m7b5", "dim7": "dim7", "minmaj7": "mMaj7",
    "9": "9", "maj9": "maj9", "min9": "m9",
}


def format_label(root: str, quality: str, bass: str) -> str:
    """Build a display label from structured chord parts."""
    if quality == "N" or root == "N":
        return "N"
    base = root + QUALITY_SUFFIX.get(quality, quality)
    if bass and bass != root:
        return f"{base}/{bass}"
    return base


class Source(BaseModel):
    kind: str                       # "youtube" | "file"
    videoId: str | None = None
    title: str | None = None
    duration: float


class Analysis(BaseModel):
    engineVersion: str
    createdAt: str                  # ISO-8601, supplied by caller


class Key(BaseModel):
    tonic: str
    mode: str                       # "major" | "minor"
    confidence: float


class Scale(BaseModel):
    name: str
    notes: list[str]


class Tempo(BaseModel):
    bpm: float


class ChordSegment(BaseModel):
    start: float
    end: float
    label: str
    root: str
    quality: str
    bass: str
    confidence: float


class Chart(BaseModel):
    schemaVersion: int = 1
    source: Source
    analysis: Analysis
    key: Key
    scales: list[Scale]
    tempo: Tempo
    beats: list[float]
    sections: list = Field(default_factory=list)
    chords: list[ChordSegment]
