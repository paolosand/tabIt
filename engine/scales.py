from engine.notes import NOTES, normalize_note
from engine.schema import Scale

MAJOR = [0, 2, 4, 5, 7, 9, 11]
NAT_MINOR = [0, 2, 3, 5, 7, 8, 10]
MAJ_PENT = [0, 2, 4, 7, 9]
MIN_PENT = [0, 3, 5, 7, 10]
DORIAN = [0, 2, 3, 5, 7, 9, 10]


def _build(tonic: str, intervals: list[int]) -> list[str]:
    i = NOTES.index(normalize_note(tonic))
    return [NOTES[(i + iv) % 12] for iv in intervals]


def suggest_scales(tonic: str, mode: str) -> list[Scale]:
    tonic = normalize_note(tonic)
    if mode == "minor":
        specs = [
            (f"{tonic} minor pentatonic", MIN_PENT),
            (f"{tonic} natural minor", NAT_MINOR),
            (f"{tonic} Dorian", DORIAN),
        ]
    else:
        specs = [
            (f"{tonic} major pentatonic", MAJ_PENT),
            (f"{tonic} major", MAJOR),
        ]
    return [Scale(name=name, notes=_build(tonic, iv)) for name, iv in specs]
