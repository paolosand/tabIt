"""Untimed sequence benchmark against Ultimate Guitar chord charts.

Scores the engine's chord sequence (or any model's, via --hyp-dir) against
UG section chord lists with engine.seqeval -- no timestamps needed. Focus is
MISSED chords (deletions). Local/manual only, like chord_accuracy.py: the
engine path downloads from YouTube. Hypotheses are cached under
benchmarks/.cache_ug/ (git-ignored) so rescoring never re-downloads.
Raw UG chart data (songs.json) must never be committed.

songs.json: [{artist, title, youtube_id, sections: [{name, chords_sounding |
chords_written}], chord_sequence_sounding}]. Hypothesis files are
[{start, end, label}] JSON, one per youtube_id (<youtube_id>.json).
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from engine.seqeval import score_song

LEVELS = ("root", "majmin")
CACHE_DIR = Path(__file__).parent / ".cache_ug"


def load_songs(path) -> list[dict]:
    """Read songs.json; each section gets a unified `chords` list
    (sounding preferred, written as fallback)."""
    songs = json.loads(Path(path).read_text())
    for song in songs:
        for sec in song["sections"]:
            sec["chords"] = sec.get("chords_sounding") or sec.get("chords_written") or []
    return songs


def load_hyp(path) -> list[str]:
    """Read a precomputed hypothesis ([{start,end,label}]) as an ordered label list."""
    return [seg["label"] for seg in json.loads(Path(path).read_text())]


def engine_hyp(song, cache_dir=CACHE_DIR, analyze_fn=None) -> list[str]:
    """Engine hypothesis for a song, cached per youtube_id."""
    cache = Path(cache_dir) / f"{song['youtube_id']}.json"
    if cache.exists():
        return load_hyp(cache)
    if analyze_fn is None:
        from engine.pipeline import analyze as analyze_fn
    from engine.eval import to_mir_label
    url = f"https://www.youtube.com/watch?v={song['youtube_id']}"
    chart = analyze_fn(url, created_at=datetime.now(timezone.utc).isoformat())
    segs = [{"start": c.start, "end": c.end, "label": to_mir_label(c.root, c.quality)}
            for c in chart.chords]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(segs))
    return [s["label"] for s in segs]


def run_benchmark(songs, hyp_fn, levels=LEVELS) -> dict:
    """Score every song at each level. A failing song gets error and no levels."""
    rows = []
    for song in songs:
        row = {"artist": song["artist"], "title": song["title"],
               "youtube_id": song["youtube_id"], "levels": {}, "error": None}
        try:
            hyp = hyp_fn(song)
            if not hyp:
                raise ValueError("empty hypothesis")
            for lv in levels:
                row["levels"][lv] = score_song(
                    song["sections"], hyp, lv,
                    full_ref=song.get("chord_sequence_sounding") or None)
        except Exception as exc:  # download failure, empty chart, ...
            row["levels"] = {}
            row["error"] = f"{type(exc).__name__}: {exc}"
        rows.append(row)
        print(f"  {row['artist']} - {row['title']}: "
              + (f"ERROR {row['error']}" if row["error"] else
                 " ".join(f"{lv}={row['levels'][lv]['recall']:.2f}" for lv in levels)))
    return {"levels": list(levels), "songs": rows}


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def render_markdown(results: dict, tag: str = "") -> str:
    """Summary table by artist (root + majmin recall), then per-song detail."""
    rows = [r for r in results["songs"]]
    ok = [r for r in rows if r["levels"]]
    lines = [f"# UG sequence benchmark {tag}".strip(), "",
             "Recall = share of UG chords found, in order, in the hypothesis "
             "(untimed, semiglobal per section, key-shift corrected). "
             "Deletions = missed chords.", "",
             "## Summary by artist", "",
             "| Artist | Songs | root recall | majmin recall | majmin insertion rate |",
             "|---|---:|---:|---:|---:|"]
    for artist in sorted({r["artist"] for r in ok}):
        a = [r for r in ok if r["artist"] == artist]
        lines.append(
            f"| {artist} | {len(a)} | "
            f"{_mean([r['levels']['root']['recall'] for r in a]):.2f} | "
            f"{_mean([r['levels']['majmin']['recall'] for r in a]):.2f} | "
            f"{_mean([r['levels']['majmin']['insertion_rate'] for r in a]):.2f} |")
    lines.append(
        f"| **All** | {len(ok)} | "
        f"**{_mean([r['levels']['root']['recall'] for r in ok]):.2f}** | "
        f"**{_mean([r['levels']['majmin']['recall'] for r in ok]):.2f}** | "
        f"**{_mean([r['levels']['majmin']['insertion_rate'] for r in ok]):.2f}** |")
    for r in rows:
        lines += ["", f"## {r['artist']} - {r['title']}", ""]
        if r["error"]:
            lines.append(f"Error: {r['error']}")
            continue
        s = r["levels"]["majmin"]
        flag = " (KEY MISMATCH)" if s["key_mismatch"] else ""
        lines.append(f"- Transposition shift: {s['shift']} semitones{flag}; "
                     f"recall unshifted {s['unshifted_recall']:.2f} -> shifted {s['recall']:.2f}")
        lines.append(f"- majmin recall {s['recall']:.2f}, root recall "
                     f"{r['levels']['root']['recall']:.2f}, whole-song global recall "
                     f"{s['whole_song']['recall']:.2f}")
        lines.append("- Section recalls: " + ", ".join(
            f"{x['name']} {x['recall']:.2f}" for x in s["sections"]))
        missed = Counter((d["chord"], d["kind"]) for x in s["sections"]
                         for d in x["deletions"])
        top = ", ".join(f"{c} x{n} ({k})" for (c, k), n in missed.most_common(5))
        lines.append(f"- Top missed chords: {top or 'none'}")
        for x in s["sections"]:
            for d in x["deletions"]:
                lines.append(f"  - {x['name']}: missed {d['chord']} between "
                             f"{d['prev'] or '-'} and {d['next'] or '-'} [{d['kind']}]")
        miss = ", ".join(s["vocab"]["missing"]) or "none"
        lines.append(f"- Vocabulary misses (never in hypothesis): {miss}")
    return "\n".join(lines) + "\n"


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="tabIt UG sequence benchmark")
    parser.add_argument("--songs", required=True, help="path to songs.json")
    parser.add_argument("--hyp-dir", help="dir of precomputed <youtube_id>.json "
                        "hypotheses; skips the engine")
    parser.add_argument("--tag", default="engine", help="report name suffix")
    parser.add_argument("--out-dir", default=str(Path(__file__).parent / "results"))
    parser.add_argument("--cache-dir", default=str(CACHE_DIR))
    args = parser.parse_args(argv)

    songs = load_songs(args.songs)
    if args.hyp_dir:
        hyp_fn = lambda song: load_hyp(Path(args.hyp_dir) / f"{song['youtube_id']}.json")
    else:
        hyp_fn = lambda song: engine_hyp(song, args.cache_dir)
    print(f"Scoring {len(songs)} songs...")
    results = run_benchmark(songs, hyp_fn)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    report = out / f"ug_sequence_{args.tag}.md"
    report.write_text(render_markdown(results, args.tag))
    print(f"Wrote {report}")


if __name__ == "__main__":
    main()
