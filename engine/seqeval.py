"""Untimed, sequence-based chord scoring against Ultimate Guitar-style charts.

A UG chart is an ordered chord list per section with NO timestamps, written by
a crowd, possibly in another key than the recording and often simplified (no
passing chords, loops written once). So instead of the time-aligned mir_eval
path in engine/eval.py we compare *sequences*: an edit-distance alignment of
the reference chords against the engine's collapsed chord sequence. The point
is to surface MISSED chords (deletions) -- the engine's most common error.

Chords are (root_pitch_class, quality) tokens, reduced to a comparison level:
  root     -> quality ""            (root only)
  majmin   -> "maj" | "min"         (mir_eval majmin convention)
  sevenths -> "maj" "min" "maj7" "min7" "7"
Slash bass is always ignored. Not run by CI against real data; pure Python.
"""
import re

LEVELS = ("root", "majmin", "sevenths")

_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_ROOT_RE = re.compile(r"^([A-G])([#b♯♭]*)(.*)$")
_REST_OK = re.compile(r"^[A-Za-z0-9#+\-ø°]*$")
_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_SUFFIX = {"": "", "maj": "", "min": "m", "maj7": "maj7", "min7": "m7", "7": "7"}


def _full_quality(rest: str) -> str:
    """Reduce a chord suffix (UG or Harte shorthand) to the sevenths-level class."""
    rest = re.sub(r"\([^)]*\)", "", rest).lstrip(":")
    has7 = bool(re.search(r"(?<![0-9])(7|9|11|13)", rest))
    if rest.startswith("maj") or rest.startswith("M"):
        return "maj7" if has7 else "maj"
    if rest.startswith(("dim", "hdim", "o", "°", "ø")):
        # dim/hdim carry a minor third: min-ish; a seventh makes it min7
        return "min7" if has7 else "min"
    if rest.startswith(("min", "m", "-")):
        if "maj" in rest:  # minmaj7 / mmaj7: no sevenths-level class, keep min
            return "min"
        return "min7" if has7 else "min"
    if rest.startswith(("aug", "+")):
        return "7" if has7 else "maj"  # augmented: major third
    if rest.startswith("sus"):
        return "7" if has7 else "maj"  # sus has no third; mir_eval maps to maj-ish
    return "7" if has7 and not rest.startswith(("6", "add")) else "maj"


def normalize(label: str, level: str = "sevenths"):
    """Parse a UG ('Am7', 'G/B') or Harte ('A:min7', 'N') label.

    Returns (root_pitch_class, quality-at-level), or None for no-chord /
    unparseable labels.
    """
    s = (label or "").strip().split("/")[0]
    s = s[:1].upper() + s[1:]  # lowercase roots ('am7', 'bb') are common in UG
    m = _ROOT_RE.match(s)
    if not m:
        return None
    letter, acc, rest = m.groups()
    if not _REST_OK.match(rest.replace(":", "")) and "(" not in rest:
        return None
    pc = _PC[letter]
    for a in acc:
        pc += 1 if a in "#♯" else -1
    q = _full_quality(rest)
    if level == "root":
        q = ""
    elif level == "majmin":
        q = "min" if q in ("min", "min7") else "maj"
    return (pc % 12, q)


_NO_CHORD = {"N", "N.C.", "NC", "N.C", "", "X"}


def count_unparseable(seq) -> int:
    """Labels that are neither a chord nor an explicit no-chord marker."""
    return sum(1 for x in seq if isinstance(x, str)
               and x.strip().upper() not in _NO_CHORD and normalize(x) is None)


def fmt(token) -> str:
    """Human label for a token, e.g. (9, 'min') -> 'Am'."""
    pc, q = token
    return _NAMES[pc] + _SUFFIX[q]


def _tokens(seq, level):
    """Labels -> collapsed tokens; already-tokenised input passes through."""
    return collapse(seq, level)


def collapse(seq, level: str = "sevenths"):
    """Drop 'N'/unparseable labels and merge consecutive duplicates (at `level`)."""
    out = []
    for item in seq:
        tok = normalize(item, level) if isinstance(item, str) else tuple(item)
        if tok is None:
            continue
        if not out or out[-1] != tok:
            out.append(tok)
    return out


def align(ref, hyp, level: str = "majmin", mode: str = "global") -> dict:
    """Unit-cost edit alignment of ref vs hyp with backtrace.

    mode="global":     both sequences fully aligned.
    mode="semiglobal": ref is a short pattern located inside a long hyp; hyp
                       chords before/after the matched window are free.

    Tie-breaking (deterministic): the backtrace walks from the end and prefers
    diagonal (match/substitution), then deletion, then insertion; in
    semiglobal mode, among minimal-cost end columns, the window with the most
    matches wins (so a trailing extra hyp chord reads as an insertion, not a
    deleted ref chord), then the EARLIEST one.

    Returns {"ops", "cost", "hyp_span", "n_ref", "n_hyp"}. Each op is
    {"op": match|substitution|deletion|insertion, "ref", "hyp" (labels or
    None), "ref_idx", "hyp_idx" (indices or None)}. A deletion is a ref chord
    missing from hyp; an insertion is an extra hyp chord. hyp_span is the
    half-open hyp window consumed.
    """
    if mode not in ("global", "semiglobal"):
        raise ValueError(f"unknown mode {mode!r}")
    r, h = _tokens(ref, level), _tokens(hyp, level)
    n, m = len(r), len(h)
    free = mode == "semiglobal"
    D = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0] = i
    for j in range(1, m + 1):
        D[0][j] = 0 if free else j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = D[i - 1][j - 1] + (r[i - 1] != h[j - 1])
            D[i][j] = min(sub, D[i - 1][j] + 1, D[i][j - 1] + 1)
    def trace(j):
        end, i, ops = j, n, []
        while i > 0 or (j > 0 and not free):
            if i > 0 and j > 0 and D[i][j] == D[i - 1][j - 1] + (r[i - 1] != h[j - 1]):
                same = r[i - 1] == h[j - 1]
                ops.append({"op": "match" if same else "substitution",
                            "ref": fmt(r[i - 1]), "hyp": fmt(h[j - 1]),
                            "ref_idx": i - 1, "hyp_idx": j - 1})
                i, j = i - 1, j - 1
            elif i > 0 and D[i][j] == D[i - 1][j] + 1:
                ops.append({"op": "deletion", "ref": fmt(r[i - 1]), "hyp": None,
                            "ref_idx": i - 1, "hyp_idx": None})
                i -= 1
            else:
                ops.append({"op": "insertion", "ref": None, "hyp": fmt(h[j - 1]),
                            "ref_idx": None, "hyp_idx": j - 1})
                j -= 1
        ops.reverse()
        return ops, (j, end)

    if free:
        best = min(D[n])
        cands = [trace(c) for c in range(m + 1) if D[n][c] == best]
        # fewest deletions (most matches) first, then the earliest window
        ops, span = max(cands, key=lambda c: (sum(o["op"] == "match" for o in c[0]),
                                              -c[1][1]))
    else:
        ops, span = trace(m)
    return {"ops": ops, "cost": D[n][span[1]], "hyp_span": span, "n_ref": n, "n_hyp": m}


def _shift(tokens, s):
    return [((pc + s) % 12, q) for pc, q in tokens]


def _pick_shift(cost_of):
    """Lowest cost wins; ties prefer shift 0, then the smallest shift."""
    return min(range(12), key=lambda s: (cost_of(s), s))


def best_transposition(ref, hyp, level: str = "majmin", mode: str = "global") -> dict:
    """Try all 12 semitone shifts of ref; keep the lowest alignment cost.

    Reports `shift` (semitones UP applied to ref), `key_mismatch` (shift != 0),
    the winning alignment under `alignment`, and the unshifted (shift=0) result
    under `unshifted`, so a caller sees both. Ties prefer shift 0.
    """
    r, h = _tokens(ref, level), _tokens(hyp, level)
    results = [align(_shift(r, s), h, level, mode) for s in range(12)]
    shift = _pick_shift(lambda s: results[s]["cost"])
    return {"shift": shift, "key_mismatch": shift != 0, "cost": results[shift]["cost"],
            "alignment": results[shift], "unshifted": results[0]}


def _neighbor(tokens, idx):
    return fmt(tokens[idx]) if 0 <= idx < len(tokens) else None


def _score_sections(secs, h, level, shift):
    """Per-section semiglobal results for refs already tokenised, shifted by `shift`."""
    out = []
    for name, toks in secs:
        shifted = _shift(toks, shift)
        a = align(shifted, h, level, "semiglobal")
        dels, subs, ins = [], [], 0
        for o in a["ops"]:
            if o["op"] == "deletion":
                k = o["ref_idx"]
                dels.append({"ref_idx": k, "chord": o["ref"],
                             "prev": _neighbor(shifted, k - 1),
                             "next": _neighbor(shifted, k + 1)})
            elif o["op"] == "substitution":
                subs.append({"ref_idx": o["ref_idx"], "ref": o["ref"], "hyp": o["hyp"]})
            elif o["op"] == "insertion":
                ins += 1
        matches = sum(o["op"] == "match" for o in a["ops"])
        out.append({"name": name, "n_ref": len(toks), "matches": matches,
                    "recall": matches / len(toks) if toks else 0.0,
                    "deletions": dels, "substitutions": subs, "n_insertions": ins,
                    "hyp_span": a["hyp_span"], "cost": a["cost"]})
    return out


def choose_shift(ref_sections, hyp_seq, level: str = "majmin", min_margin=None) -> dict:
    """Pick the ref key shift for a whole song (total semiglobal cost over sections).

    A non-zero shift is accepted only if it beats shift 0 by at least
    `min_margin` cost (default max(2, 10% of total ref chords)); otherwise a
    short or simplified chart can "fit" a wrong key by luck. Ties among
    non-zero shifts prefer the smallest. Returns shift, margin (cost0 - best
    cost over all shifts), cost0, cost.
    """
    h = _tokens(hyp_seq, level)
    secs = [(s["name"], _tokens(s["chords"], level)) for s in ref_sections]
    n_ref = sum(len(t) for _, t in secs)
    if min_margin is None:
        min_margin = max(2, -(-n_ref // 10))
    costs = [sum(a["cost"] for a in _score_sections(secs, h, level, sh))
             for sh in range(12)]
    best = _pick_shift(lambda sh: costs[sh])
    margin = costs[0] - costs[best]
    shift = best if margin >= min_margin else 0
    return {"shift": shift, "margin": margin, "cost0": costs[0], "cost": costs[shift]}


def score_song(ref_sections, hyp_seq, level: str = "majmin", full_ref=None,
               shift=None) -> dict:
    """Score one song's hypothesis against its UG sections.

    ref_sections: [{name, chords}]. The ref key shift is chosen once per song
    by choose_shift() AT THE MAJMIN LEVEL (with a minimum cost margin) and
    reused for every level and section; pass `shift` to override. Per section: semiglobal recall, deletions (with neighbours and
    whether the chord appears elsewhere in hyp: "timing" = passing-chord miss,
    incl. when the chord shows up as an insertion/substitution nearby;
    "vocab" = the engine never produced it), substitutions, insertions.
    Overall: recall = total matches / total ref chords; insertion_rate = total
    in-window insertions / total ref chords; vocabulary recall of distinct ref
    chords; and a whole-song global alignment of hyp against `full_ref` (default:
    the concatenated sections) as a loop-aware sanity check.
    """
    h = _tokens(hyp_seq, level)
    secs = [(s["name"], _tokens(s["chords"], level)) for s in ref_sections]

    if shift is None:
        pick = choose_shift(ref_sections, hyp_seq, "majmin")
    else:
        pick = {"shift": shift, "margin": None}
    shift = pick["shift"]
    sections = _score_sections(secs, h, level, shift)
    unshifted = _score_sections(secs, h, level, 0)

    n_ref = sum(s["n_ref"] for s in sections)
    hyp_set = set(h)
    for sec, (_, toks) in zip(sections, secs):
        shifted = _shift(toks, shift)
        for d in sec["deletions"]:
            d["elsewhere_in_hyp"] = shifted[d["ref_idx"]] in hyp_set
            d["kind"] = "timing" if d["elsewhere_in_hyp"] else "vocab"

    vocab = sorted({t for _, toks in secs for t in _shift(toks, shift)})
    missing = [fmt(t) for t in vocab if t not in hyp_set]
    if full_ref is None:
        # concatenated sections live in the sections' pitch space: same shift
        whole_ref = _shift(collapse([t for _, toks in secs for t in toks], level), shift)
        w_shift = shift
    else:
        # full_ref (chord_sequence_sounding) may be in a different pitch space
        # than the sections (e.g. sections written with a capo), so reusing the
        # section shift would transpose it twice. Pick its own shift, with the
        # same cost-margin gate.
        base = collapse(full_ref, level)
        costs = [align(_shift(base, sh), h, level, "global")["cost"] for sh in range(12)]
        best = _pick_shift(lambda sh: costs[sh])
        w_shift = best if costs[0] - costs[best] >= max(2, -(-len(base) // 10)) else 0
        whole_ref = _shift(base, w_shift)
    w = align(whole_ref, h, level, "global")
    w_match = sum(o["op"] == "match" for o in w["ops"])
    return {
        "level": level,
        "shift": shift,
        "key_mismatch": shift != 0,
        "shift_margin": pick["margin"],
        "unparseable": {"ref": sum(count_unparseable(x["chords"]) for x in ref_sections),
                        "hyp": count_unparseable(hyp_seq)},
        "sections": sections,
        "recall": sum(s["matches"] for s in sections) / n_ref if n_ref else 0.0,
        "unshifted_recall": (sum(s["matches"] for s in unshifted) / n_ref) if n_ref else 0.0,
        "insertion_rate": sum(s["n_insertions"] for s in sections) / n_ref if n_ref else 0.0,
        "vocab": {"n_distinct": len(vocab), "missing": missing,
                  "recall": (len(vocab) - len(missing)) / len(vocab) if vocab else 0.0},
        "deletion_rate": sum(len(x["deletions"]) for x in sections) / n_ref if n_ref else 0.0,
        "whole_song": {
            "shift": w_shift,
            "cost": w["cost"], "n_ref": w["n_ref"], "n_hyp": w["n_hyp"],
            "recall": w_match / w["n_ref"] if w["n_ref"] else 0.0,
            "deletions": sum(o["op"] == "deletion" for o in w["ops"]),
            "insertions": sum(o["op"] == "insertion" for o in w["ops"]),
        },
    }
