"""Real-song chord-accuracy benchmark for the tabIt engine.

Runs a manifest of songs through the live engine.analyze() pipeline
(YouTube-URL ingest) and scores chords against published Isophonics
annotations with mir_eval. Local/manual only: yt-dlp is blocked from
datacenter IPs, so this never runs in CI. Not collected by pytest.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pydantic import BaseModel

from engine.pipeline import analyze
from engine.eval import load_lab, chords_to_mir, score_chart


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


def duration_warning(actual: float, expected: float | None, tol: float = 0.03) -> str | None:
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


DEFAULT_METRICS = ("majmin", "sevenths", "root")


def run_benchmark(songs, base_dir, metrics=DEFAULT_METRICS,
                  analyze_fn=analyze, created_at=None) -> dict:
    """Analyze + score every song. Never raises for a single-song failure:
    a failed song gets scores=None and an error note."""
    created_at = created_at or datetime.now(timezone.utc).isoformat()
    rows, engine_version = [], None
    for song in songs:
        row = {"id": song.id, "title": song.title, "scores": None,
               "weight": 0.0, "warning": None, "error": None, "duration": None}
        try:
            chart = analyze_fn(song.url, created_at=created_at)
            engine_version = chart.analysis.engineVersion
            row["duration"] = chart.source.duration
            row["warning"] = duration_warning(chart.source.duration, song.ref_duration)
            if not chart.chords:
                raise ValueError("empty chart: analyze returned no chords")

            ref_int, ref_lab = load_lab(song.lab)
            est_int, est_lab = chords_to_mir(chart.chords, offset_sec=song.offset_sec)
            row["scores"] = score_chart(ref_int, ref_lab, est_int, est_lab, metrics=metrics)
            row["weight"] = float(ref_int[-1][1] - ref_int[0][0])  # scored span (s)
        except Exception as exc:  # dead URL, empty chart, yt-dlp error, ...
            row["error"] = f"{type(exc).__name__}: {exc}"
        rows.append(row)
        print(f"  {song.id}: "
              + ("ERROR " + row["error"] if row["error"]
                 else " ".join(f"{m}={row['scores'][m]:.2f}" for m in metrics)
                      + (f"  [{row['warning']}]" if row["warning"] else "")))

    return {
        "engineVersion": engine_version,
        "metrics": list(metrics),
        "songs": rows,
        "aggregate": aggregate(rows, metrics),
    }


def write_results(results: dict, base_dir) -> None:
    out_dir = Path(base_dir) / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "latest.json").write_text(json.dumps(results, indent=2) + "\n")
    md = render_markdown(results["songs"], results["aggregate"], tuple(results["metrics"]))
    (out_dir / "latest.md").write_text(md)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="tabIt real-song chord-accuracy benchmark")
    parser.add_argument("--manifest", default=str(Path(__file__).parent / "manifest.yaml"),
                        help="path to the song manifest YAML")
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    songs = load_manifest(str(manifest_path))
    print(f"Running benchmark on {len(songs)} songs...")
    results = run_benchmark(songs, manifest_path.parent)
    write_results(results, manifest_path.parent)
    agg = results["aggregate"]
    print(f"\nHeadline majmin: all={agg['all']['majmin']:.3f} "
          f"aligned={agg['aligned']['majmin']:.3f}")
    print(f"Wrote {manifest_path.parent / 'results' / 'latest.md'}")


if __name__ == "__main__":
    main()
