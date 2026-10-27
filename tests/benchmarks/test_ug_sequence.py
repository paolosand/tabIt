import json

import pytest

from benchmarks.ug_sequence import (
    load_songs, load_hyp, run_benchmark, render_markdown, main,
)

SONGS = [
    {"artist": "Band", "title": "One", "youtube_id": "vid1",
     "sections": [{"name": "verse", "chords_sounding": ["C", "G", "Am", "F"]},
                  {"name": "chorus", "chords_written": ["F", "C"]}],
     "chord_sequence_sounding": ["C", "G", "Am", "F", "F", "C"]},
    {"artist": "Band", "title": "Two", "youtube_id": "vid2",
     "sections": [{"name": "verse", "chords_sounding": ["Em", "D"]}],
     "chord_sequence_sounding": ["Em", "D"]},
]
HYPS = {
    "vid1": [{"start": 0, "end": 1, "label": "C:maj"},
             {"start": 1, "end": 2, "label": "A:min"},
             {"start": 2, "end": 3, "label": "F:maj"},
             {"start": 3, "end": 4, "label": "C:maj"}],
    "vid2": [{"start": 0, "end": 1, "label": "E:min"},
             {"start": 1, "end": 2, "label": "D:maj"}],
}


@pytest.fixture
def songs_json(tmp_path):
    p = tmp_path / "songs.json"
    p.write_text(json.dumps(SONGS))
    return p


def test_load_songs_prefers_sounding_and_falls_back(songs_json):
    songs = load_songs(songs_json)
    assert songs[0]["sections"][0]["chords"] == ["C", "G", "Am", "F"]
    assert songs[0]["sections"][1]["chords"] == ["F", "C"]


def test_load_hyp_reads_labels(tmp_path):
    (tmp_path / "vid2.json").write_text(json.dumps(HYPS["vid2"]))
    assert load_hyp(tmp_path / "vid2.json") == ["E:min", "D:maj"]


def test_run_benchmark_uses_hyp_fn_and_scores(songs_json):
    songs = load_songs(songs_json)
    res = run_benchmark(songs, hyp_fn=lambda s: [c["label"] for c in HYPS[s["youtube_id"]]])
    one = res["songs"][0]
    assert one["levels"]["majmin"]["sections"][0]["deletions"][0]["chord"] == "G"
    assert res["songs"][1]["levels"]["root"]["recall"] == 1.0


def test_run_benchmark_survives_failure(songs_json):
    def boom(song):
        raise RuntimeError("403")
    res = run_benchmark(load_songs(songs_json), hyp_fn=boom)
    assert all(s["error"] and not s["levels"] for s in res["songs"])


def test_render_markdown_has_summary_and_details(songs_json):
    res = run_benchmark(load_songs(songs_json),
                        hyp_fn=lambda s: [c["label"] for c in HYPS[s["youtube_id"]]])
    md = render_markdown(res)
    assert "| Artist |" in md and "Band" in md
    assert "G" in md and "shift" in md.lower()


def test_main_with_hyp_dir_writes_report(tmp_path, songs_json):
    hyp_dir = tmp_path / "hyps"
    hyp_dir.mkdir()
    for k, v in HYPS.items():
        (hyp_dir / f"{k}.json").write_text(json.dumps(v))
    out = tmp_path / "out"
    main(["--songs", str(songs_json), "--hyp-dir", str(hyp_dir),
          "--tag", "t", "--out-dir", str(out)])
    assert (out / "ug_sequence_t.md").exists()


def test_engine_hyp_caches_and_never_reanalyzes(tmp_path):
    from types import SimpleNamespace as NS
    from benchmarks.ug_sequence import engine_hyp
    calls = []

    def fake(url, created_at):
        calls.append(url)
        return NS(chords=[NS(start=0, end=1, root="C", quality="maj"),
                          NS(start=1, end=2, root="A", quality="min")])
    song = {"youtube_id": "vidX"}
    assert engine_hyp(song, tmp_path, analyze_fn=fake) == ["C:maj", "A:min"]
    assert engine_hyp(song, tmp_path, analyze_fn=fake) == ["C:maj", "A:min"]
    assert len(calls) == 1 and "vidX" in calls[0]


def test_report_shows_margin_and_both_recalls_and_unparseable(songs_json):
    res = run_benchmark(load_songs(songs_json),
                        hyp_fn=lambda s: [c["label"] for c in HYPS[s["youtube_id"]]])
    md = render_markdown(res)
    assert "margin" in md and "unshifted" in md and "unparseable" in md.lower()


def test_run_benchmark_uses_one_shift_for_all_levels(songs_json):
    res = run_benchmark(load_songs(songs_json),
                        hyp_fn=lambda s: [c["label"] for c in HYPS[s["youtube_id"]]])
    for s in res["songs"]:
        assert s["levels"]["root"]["shift"] == s["levels"]["majmin"]["shift"]


def test_ug_report_files_are_gitignored():
    import subprocess
    out = subprocess.run(["git", "check-ignore", "benchmarks/results/ug_sequence_x.md"],
                         capture_output=True, text=True)
    assert out.returncode == 0


def test_report_has_deletion_rate_and_missed_list(songs_json):
    res = run_benchmark(load_songs(songs_json),
                        hyp_fn=lambda s: [c["label"] for c in HYPS[s["youtube_id"]]])
    md = render_markdown(res)
    assert "deletion rate" in md.lower()
    assert "Missed chord list" in md and "G x1 (vocab)" in md
