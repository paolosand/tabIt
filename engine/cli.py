import argparse
from datetime import datetime, timezone

from engine.pipeline import analyze


def main() -> None:
    parser = argparse.ArgumentParser(description="tabIt MIR engine: audio -> chord chart JSON")
    parser.add_argument("source", help="YouTube URL or path to an audio file")
    parser.add_argument("-o", "--out", default="chart.json", help="output JSON path")
    args = parser.parse_args()

    created_at = datetime.now(timezone.utc).isoformat()
    chart = analyze(args.source, created_at=created_at)
    with open(args.out, "w") as f:
        f.write(chart.model_dump_json(indent=2))
    print(f"Wrote {args.out}: key={chart.key.tonic} {chart.key.mode}, "
          f"{len(chart.chords)} chords, {chart.tempo.bpm:.0f} BPM")


if __name__ == "__main__":
    main()
