"""Real-song chord-accuracy benchmark for the tabIt engine.

Runs a manifest of songs through the live engine.analyze() pipeline
(YouTube-URL ingest) and scores chords against published Isophonics
annotations with mir_eval. Local/manual only: yt-dlp is blocked from
datacenter IPs, so this never runs in CI. Not collected by pytest.
"""
from pathlib import Path

import yaml
from pydantic import BaseModel


class Song(BaseModel):
    id: str
    title: str
    url: str
    lab: str
    ref_duration: float | None = None
    offset_sec: float = 0.0


def load_manifest(path) -> list[Song]:
    """Parse the YAML manifest; resolve each `lab` relative to the manifest dir."""
    manifest_path = Path(path)
    data = yaml.safe_load(manifest_path.read_text()) or []
    songs = []
    for entry in data:
        song = Song(**entry)
        song.lab = str((manifest_path.parent / song.lab).resolve())
        songs.append(song)
    return songs


def duration_warning(actual: float, expected: float | None, tol: float = 0.03):
    """Return a short warning string if fetched duration drifts from the
    annotated master beyond `tol`, else None."""
    if not expected:
        return None
    delta = (actual - expected) / expected
    if abs(delta) > tol:
        return f"dur {delta * 100:+.0f}%"
    return None


def aggregate(rows: list[dict], metrics) -> dict:
    """Duration-weighted mean per metric, over all scored rows and over
    aligned-only rows (excluding duration-warned rows)."""
    def _agg(subset):
        out = {}
        for m in metrics:
            den = sum(r["weight"] for r in subset)
            num = sum(r["scores"][m] * r["weight"] for r in subset)
            out[m] = (num / den) if den else 0.0
        return out

    scored = [r for r in rows if r.get("scores") is not None]
    aligned = [r for r in scored if not r.get("warning")]
    return {"all": _agg(scored), "aligned": _agg(aligned)}


def render_markdown(rows: list[dict], agg: dict, metrics) -> str:
    """Render the human-readable results table."""
    header = "| Song | " + " | ".join(metrics) + " | notes |"
    sep = "|------|" + "".join("-------:|" for _ in metrics) + "-------|"
    lines = [header, sep]
    for r in rows:
        if r.get("scores") is None:
            cells = " | ".join("—" for _ in metrics)
            note = r.get("error") or ""
        else:
            cells = " | ".join(f"{r['scores'][m]:.2f}" for m in metrics)
            note = r.get("warning") or ""
            if note:
                note = f"⚠ {note}"
        lines.append(f"| {r['title']} | {cells} | {note} |")
    all_cells = " | ".join(f"**{agg['all'][m]:.2f}**" for m in metrics)
    aligned_cells = " | ".join(f"**{agg['aligned'][m]:.2f}**" for m in metrics)
    lines.append(f"| **Aggregate (all)** | {all_cells} | duration-weighted |")
    lines.append(f"| **Aggregate (aligned)** | {aligned_cells} | excludes ⚠ |")
    return "\n".join(lines) + "\n"
