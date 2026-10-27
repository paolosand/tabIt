import pytest

from engine.seqeval import (
    normalize, collapse, align, best_transposition, score_song, fmt,
)


def test_normalize_ug_style_sevenths():
    assert normalize("Am7") == (9, "min7")
    assert normalize("F#m") == (6, "min")
    assert normalize("Bb") == (10, "maj")
    assert normalize("Cmaj7") == (0, "maj7")
    assert normalize("G7") == (7, "7")
    assert normalize("Cadd9") == (0, "maj")
    assert normalize("Dsus4") == (2, "maj")
    assert normalize("E5") == (4, "maj")
    assert normalize("Bdim") == (11, "min")
    assert normalize("Caug") == (0, "maj")


def test_normalize_slash_bass_ignored():
    assert normalize("G/B") == (7, "maj")
    assert normalize("Am7/G") == (9, "min7")
    assert normalize("C:maj/3") == (0, "maj")


def test_normalize_harte_style():
    assert normalize("A:min7") == (9, "min7")
    assert normalize("C:maj") == (0, "maj")
    assert normalize("G:7") == (7, "7")
    assert normalize("D:sus4") == (2, "maj")
    assert normalize("B:hdim7") == (11, "min7")
    assert normalize("C:maj6") == (0, "maj")


def test_normalize_no_chord_and_garbage_is_none():
    for bad in ("N", "N.C.", "NC", "", "x?", "H"):
        assert normalize(bad) is None


def test_normalize_levels():
    assert normalize("Am7", "root") == (9, "")
    assert normalize("Am7", "majmin") == (9, "min")
    assert normalize("G7", "majmin") == (7, "maj")
    assert normalize("Cmaj7", "majmin") == (0, "maj")
    assert normalize("G7", "sevenths") == (7, "7")


def test_normalize_unicode_accidentals():
    assert normalize("B♭m") == (10, "min")
    assert normalize("F♯") == (6, "maj")


def test_collapse_drops_n_and_merges_duplicates():
    seq = ["C", "C", "N", "C", "G", "Gmaj", "x?", "Am"]
    assert collapse(seq, "majmin") == [(0, "maj"), (7, "maj"), (9, "min")]


def test_collapse_merge_is_level_dependent():
    assert collapse(["C", "Cmaj7"], "majmin") == [(0, "maj")]
    assert collapse(["C", "Cmaj7"], "sevenths") == [(0, "maj"), (0, "maj7")]


def _ops(result):
    return [(o["op"], o["ref"], o["hyp"]) for o in result["ops"] if o["op"] != "match"]


def test_deletion_of_skipped_passing_chord():
    r = align(["C", "G", "Am", "F"], ["C", "Am", "F"], "majmin")
    assert r["cost"] == 1
    assert _ops(r) == [("deletion", "G", None)]
    d = [o for o in r["ops"] if o["op"] == "deletion"][0]
    assert d["ref_idx"] == 1


def test_substitution():
    r = align(["C", "G", "F"], ["C", "D", "F"], "majmin")
    assert _ops(r) == [("substitution", "G", "D")]


def test_insertion():
    r = align(["C", "G", "F"], ["C", "G", "Am", "F"], "majmin")
    assert _ops(r) == [("insertion", None, "Am")]


def test_align_level_root_ignores_quality():
    assert align(["Am"], ["A"], "root")["cost"] == 0
    assert align(["Am"], ["A"], "majmin")["cost"] == 1


def test_tie_break_is_deterministic():
    # C G vs G C: sub+sub (2) ties with del+ins variants; diag preferred
    a = align(["C", "G"], ["G", "C"], "majmin")
    b = align(["C", "G"], ["G", "C"], "majmin")
    assert a == b and a["cost"] == 2
    assert [o["op"] for o in a["ops"]] == ["substitution", "substitution"]


def test_semiglobal_finds_pattern_in_long_repeated_hyp():
    verse = ["C", "G", "Am", "F"]
    hyp = ["E", "A"] + verse * 3 + ["B"]
    r = align(verse, hyp, "majmin", mode="semiglobal")
    assert r["cost"] == 0
    assert r["hyp_span"] == (2, 6)  # earliest best window
    assert all(o["op"] == "match" for o in r["ops"])


def test_semiglobal_free_gaps_do_not_count_as_insertions():
    r = align(["C", "G"], ["D", "A", "C", "G", "E"], "majmin", mode="semiglobal")
    assert r["cost"] == 0
    assert not [o for o in r["ops"] if o["op"] == "insertion"]


def test_global_penalizes_surrounding_hyp():
    r = align(["C", "G"], ["D", "C", "G"], "majmin", mode="global")
    assert r["cost"] == 1


def test_best_transposition_recovers_shift():
    ref = ["C", "G", "Am", "F"]
    hyp = ["D", "A", "Bm", "G"]
    r = best_transposition(ref, hyp, "majmin")
    assert r["shift"] == 2
    assert r["key_mismatch"] is True
    assert r["cost"] == 0
    assert r["unshifted"]["cost"] > 0


def test_no_key_mismatch_when_same_key():
    ref = ["C", "G", "Am", "F"]
    r = best_transposition(ref, ref, "majmin")
    assert r["shift"] == 0
    assert r["key_mismatch"] is False
    assert r["unshifted"]["cost"] == 0


def test_shift_zero_preferred_on_tie():
    # single chord ref: every shift ties on a one-chord hyp only at its own pc
    r = best_transposition(["C", "G"], ["C", "G"], "root")
    assert r["shift"] == 0


SECTIONS = [{"name": "verse", "chords": ["C", "G", "Am", "F"]}]


def test_score_song_reports_deletion_with_neighbors():
    hyp = ["C", "Am", "F", "C", "Am", "F"]
    s = score_song(SECTIONS, hyp, "majmin")
    sec = s["sections"][0]
    assert sec["n_ref"] == 4
    assert sec["matches"] == 3
    assert sec["recall"] == pytest.approx(0.75)
    assert len(sec["deletions"]) == 1
    d = sec["deletions"][0]
    assert (d["chord"], d["prev"], d["next"]) == ("G", "C", "Am")
    assert s["recall"] == pytest.approx(0.75)


def test_score_song_substitution_pairs_and_insertion_rate():
    sections = [{"name": "verse", "chords": ["C", "G", "F"]}]
    s = score_song(sections, ["C", "D", "F"], "majmin")
    assert s["sections"][0]["substitutions"][0]["ref"] == "G"
    assert s["sections"][0]["substitutions"][0]["hyp"] == "D"
    s2 = score_song(sections, ["C", "G", "Am", "F"], "majmin")
    assert s2["sections"][0]["n_insertions"] == 1
    assert s2["insertion_rate"] == pytest.approx(1 / 3)


def test_vocab_miss_vs_timing_miss():
    # G exists elsewhere in hyp -> timing/passing miss
    timing = score_song(SECTIONS, ["C", "Am", "F", "C", "G", "C"], "majmin")
    d = timing["sections"][0]["deletions"][0]
    assert d["chord"] == "G" and d["elsewhere_in_hyp"] is True
    assert d["kind"] == "timing"
    assert timing["vocab"]["missing"] == []
    # G never appears -> vocabulary miss
    vocab = score_song(SECTIONS, ["C", "Am", "F", "C", "Am", "F"], "majmin")
    d = vocab["sections"][0]["deletions"][0]
    assert d["elsewhere_in_hyp"] is False and d["kind"] == "vocab"
    assert vocab["vocab"]["missing"] == ["G"]
    assert vocab["vocab"]["recall"] == pytest.approx(0.75)


def test_score_song_flags_key_mismatch():
    s = score_song(SECTIONS, ["D", "A", "Bm", "G"], "majmin")
    assert s["shift"] == 2 and s["key_mismatch"] is True
    assert s["recall"] == pytest.approx(1.0)
    assert s["unshifted_recall"] < 1.0


def test_score_song_whole_song_global_check():
    sections = [{"name": "verse", "chords": ["C", "G"]},
                {"name": "chorus", "chords": ["F", "C"]}]
    s = score_song(sections, ["C", "G", "F", "C"], "majmin")
    w = s["whole_song"]
    assert w["cost"] == 0 and w["n_ref"] == 4 and w["recall"] == 1.0
    # explicit full_ref (e.g. chord_sequence_sounding) overrides concatenation
    w2 = score_song(sections, ["C", "G", "F", "C"], "majmin",
                    full_ref=["C", "G", "F", "C", "C", "G"])["whole_song"]
    assert w2["n_ref"] == 5 and w2["deletions"] == 1


def test_fmt_labels():
    assert fmt((9, "min")) == "Am"
    assert fmt((10, "maj")) == "A#"
    assert fmt((0, "7")) == "C7"
    assert fmt((2, "")) == "D"


def test_spurious_shift_rejected_without_cost_margin():
    sections = [{"name": "verse", "chords": ["C", "F", "C"]}]
    hyp = "C G C G C G F C C G F C A F G C G F C".split()
    s = score_song(sections, hyp, "majmin")
    assert s["shift"] == 0 and s["key_mismatch"] is False
    assert s["recall"] == pytest.approx(s["unshifted_recall"])
    assert s["recall"] < 1.0
    assert s["shift_margin"] < 2


def test_real_shift_accepted_with_margin_and_reported():
    sections = [{"name": "v", "chords": ["C", "G", "Am", "F", "C", "G"]}]
    s = score_song(sections, ["D", "A", "Bm", "G", "D", "A"], "majmin")
    assert s["shift"] == 2 and s["shift_margin"] >= 2


def test_same_shift_across_levels():
    sections = [{"name": "v", "chords": ["C", "G", "Am7", "F"]}]
    hyp = ["D", "A", "Bm", "G"]
    shifts = {lv: score_song(sections, hyp, lv)["shift"]
              for lv in ("root", "majmin", "sevenths")}
    assert set(shifts.values()) == {2}


def test_root_level_uses_majmin_shift_even_if_root_alone_would_differ():
    # at root level alone, ref Am F vs hyp C F fits shift 3 (A->C, F->F? no) --
    # pin behaviour: an explicit shift is honoured and default comes from majmin
    sections = [{"name": "v", "chords": ["Am", "Dm", "Em", "Am"]}]
    hyp = ["A", "D", "E", "A"]
    assert score_song(sections, hyp, "root")["shift"] == \
        score_song(sections, hyp, "majmin")["shift"]


def test_normalize_lowercase_root():
    assert normalize("am7") == (9, "min7")
    assert normalize("bb") == (10, "maj")
    assert normalize("f#m") == (6, "min")


def test_unparseable_labels_counted_not_silent():
    sections = [{"name": "v", "chords": ["C", "G", "x?"]}]
    s = score_song(sections, ["C", "N", "G", "???", "H"], "majmin")
    assert s["unparseable"] == {"ref": 1, "hyp": 2}  # N is no-chord, not garbage


def test_deleted_chord_present_in_window_as_insertion_is_timing():
    s = score_song(SECTIONS, ["C", "Am", "F", "G"], "majmin")
    d = s["sections"][0]["deletions"][0]
    assert d["chord"] == "G" and d["kind"] == "timing"
