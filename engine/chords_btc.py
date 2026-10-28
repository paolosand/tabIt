"""BTC chord recognition (Park et al., ISMIR 2019) from the original mix.

Runs on the original mix, ~1 s warm on CPU. The vocabulary has no slash chords, so every segment's bass equals its root.
Model code is vendored in engine/vendor/btc; the weights are fetched from the
authors' repository on first use (see ensure_weights).
"""
import dataclasses
import hashlib
import http.client
import io
import os
import tempfile
import threading
import urllib.request
from pathlib import Path

import numpy as np

from engine.chords import RawChord, parse_harte

# Pinned upstream revision (jayg996/BTC-ISMIR19): code AND weights come from here.
WEIGHTS_COMMIT = "2682317be668032e6e4b269ded36adaa2ad57df0"
WEIGHTS_FILENAME = "btc_model_large_voca.pt"
WEIGHTS_URL = (f"https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/"
               f"{WEIGHTS_COMMIT}/test/{WEIGHTS_FILENAME}")
WEIGHTS_SHA256 = "1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51"

# BTC emits many sub-half-second flicker segments (passing-chord noise); anything
# shorter than this is folded into a neighbour.
MIN_SEGMENT_SEC = 0.5

# Upstream run_config.yaml (large-vocabulary model: 170 classes).
SONG_HZ = 22050
INST_LEN = 10.0
CQT_BINS, CQT_BINS_PER_OCTAVE, CQT_HOP = 144, 24, 2048
MODEL_CONFIG = dict(
    feature_size=144, timestep=108, num_chords=170, input_dropout=0.2,
    layer_dropout=0.2, attention_dropout=0.2, relu_dropout=0.2, num_layers=8,
    num_heads=4, hidden_size=128, total_key_depth=128, total_value_depth=128,
    filter_size=128,
)

_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_QUALITIES = ["min", "maj", "dim", "aug", "min6", "maj6", "min7", "minmaj7", "maj7",
              "7", "dim7", "hdim7", "sus2", "sus4"]
_UNKNOWN_CLASS, _NO_CHORD_CLASS = 168, 169


class BtcWeightsUnavailable(RuntimeError):
    """The BTC weights are neither cached nor downloadable."""


def voca_label(index: int) -> str:
    """Class index -> Harte label (12 roots x 14 qualities, then X, N)."""
    if index in (_UNKNOWN_CLASS, _NO_CHORD_CLASS):
        return "N"
    root, quality = _ROOTS[index // 14], _QUALITIES[index % 14]
    return root if quality == "maj" else f"{root}:{quality}"


def models_dir() -> Path:
    """Per-user model store: beside the helper's charts/env under Application Support."""
    override = os.environ.get("TABIT_MODELS_DIR")
    if override:
        return Path(override)
    from helper import paths
    return paths.MODELS_DIR


def _download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ensure_weights(directory: Path | None = None, *, fetch=_download) -> Path:
    """Return the verified weights path, downloading it on first use.

    Raises BtcWeightsUnavailable (never a bare OSError) when the file is absent
    and cannot be fetched, or fetched bytes do not match the pinned sha256.
    """
    directory = Path(directory) if directory else models_dir()
    target = directory / WEIGHTS_FILENAME
    if target.is_file() and _sha256(target.read_bytes()) == WEIGHTS_SHA256:
        return target
    try:
        data = fetch(WEIGHTS_URL)
    except (OSError, http.client.HTTPException) as exc:   # IncompleteRead is not an OSError
        raise BtcWeightsUnavailable(
            f"BTC chord weights are not in {directory} and could not be downloaded "
            f"({exc}). Connect to the internet and retry (`tabit warmup` fetches "
            f"them), or download {WEIGHTS_URL} to {target} yourself."
        ) from exc
    if _sha256(data) != WEIGHTS_SHA256:
        raise BtcWeightsUnavailable(
            f"Downloaded BTC weights failed the sha256 check (expected {WEIGHTS_SHA256}); "
            f"refusing to load them. Retry with `tabit warmup`.")
    directory.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, target)    # atomic: a crash never leaves a half-written model
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return target


def _merge_label_runs(segs: list[RawChord]) -> list[RawChord]:
    """Fuse touching segments with the same chord; confidence is duration-weighted."""
    out: list[RawChord] = []
    for s in segs:
        prev = out[-1] if out else None
        if prev and (prev.root, prev.quality, prev.bass) == (s.root, s.quality, s.bass):
            a, b = prev.end - prev.start, s.end - s.start
            out[-1] = dataclasses.replace(
                prev, end=s.end, confidence=(prev.confidence * a + s.confidence * b) / (a + b))
        else:
            out.append(s)
    return out


def filter_short_segments(raws: list[RawChord], min_sec: float = MIN_SEGMENT_SEC) -> list[RawChord]:
    """Fold every segment shorter than min_sec into its longer adjacent neighbour.

    Shortest first, so a run of flickers collapses onto the stable chord around it.
    A chord segment is never absorbed by "N" (silence is not a chord choice), and
    a lone segment with no eligible neighbour is kept as is.
    """
    segs = _merge_label_runs([dataclasses.replace(r) for r in raws])
    while True:
        for i in sorted((i for i, s in enumerate(segs) if s.end - s.start < min_sec),
                        key=lambda i: segs[i].end - segs[i].start):
            neighbours = [j for j in (i - 1, i + 1) if 0 <= j < len(segs)]
            if segs[i].root != "N":
                neighbours = [j for j in neighbours if segs[j].root != "N"]
            if not neighbours:
                continue
            j = max(neighbours, key=lambda j: segs[j].end - segs[j].start)
            if j < i:
                segs[j] = dataclasses.replace(segs[j], end=segs[i].end)
            else:
                segs[j] = dataclasses.replace(segs[j], start=segs[i].start)
            del segs[i]
            segs = _merge_label_runs(segs)
            break
        else:
            return segs


# What a plain state_dict checkpoint legitimately pickles. torch 2.0's own
# weights_only mode can't read the numpy-scalar mean/std stored beside the weights
# (and has no safe_globals hook), so the same idea is applied with an allowlist.
_ALLOWED_GLOBALS = {
    ("collections", "OrderedDict"), ("_codecs", "encode"),   # numpy scalars pickle bytes via this
    ("numpy", "dtype"), ("numpy.core.multiarray", "scalar"),
    ("torch._utils", "_rebuild_tensor_v2"), ("torch._utils", "_rebuild_parameter"),
}


def _restricted_pickle():
    """A pickle-module stand-in for torch.load whose Unpickler refuses any global
    outside the allowlist (and torch storage types), so a swapped file can't run code."""
    import pickle
    import types

    class RestrictedUnpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if (module, name) in _ALLOWED_GLOBALS or (
                    module == "torch" and name.endswith("Storage")):
                return super().find_class(module, name)
            raise pickle.UnpicklingError(f"checkpoint references forbidden global {module}.{name}")

    mod = types.ModuleType("restricted_pickle")
    mod.__dict__.update({k: getattr(pickle, k) for k in dir(pickle) if not k.startswith("__")})
    mod.Unpickler = RestrictedUnpickler
    mod.load = lambda f, **kw: RestrictedUnpickler(f, **kw).load()
    return mod


class BtcChordModel:
    """Chord estimator backed by BTC; predict() takes the ORIGINAL mix."""

    def __init__(self, weights_path: Path | None = None, config: dict | None = None,
                 sha256: str | None = None):
        """weights_path None means "the pinned download" (verified). A caller-supplied
        path is trusted as given unless it also passes the sha256 to check."""
        self._weights_path = Path(weights_path) if weights_path else None
        self._sha256 = sha256 or (None if weights_path else WEIGHTS_SHA256)
        self._config = config or MODEL_CONFIG
        self._lock = threading.Lock()
        self._model = None

    def load(self):
        with self._lock:
            if self._model is None:
                import torch
                from engine.vendor.btc.model import BTCModel

                path = self._weights_path or ensure_weights()
                # Hash the exact bytes we deserialize (no check-then-reopen gap).
                data = Path(path).read_bytes()
                if self._sha256 and _sha256(data) != self._sha256:
                    raise BtcWeightsUnavailable(
                        f"{path} does not match the pinned sha256; delete it to re-download.")
                ckpt = torch.load(io.BytesIO(data), map_location="cpu",
                                  pickle_module=_restricted_pickle())
                model = BTCModel(self._config)
                model.load_state_dict(ckpt["model"])
                self._model = (model.eval(), float(ckpt["mean"]), float(ckpt["std"]))
        return self._model

    def _features(self, wav_path: str) -> tuple[np.ndarray, float]:
        import librosa

        y, _ = librosa.load(wav_path, sr=SONG_HZ, mono=True)
        step = int(SONG_HZ * INST_LEN)
        chunks = []
        for s in range(0, len(y), step):    # upstream's fixed 10 s windows
            seg = y[s:s + step]
            if len(seg) < CQT_HOP and chunks:
                break
            chunks.append(librosa.cqt(
                seg, sr=SONG_HZ, n_bins=CQT_BINS, bins_per_octave=CQT_BINS_PER_OCTAVE,
                hop_length=CQT_HOP))
        if not chunks:
            raise ValueError(f"no audio in {wav_path}")
        return np.log(np.abs(np.concatenate(chunks, axis=1)) + 1e-6).T, len(y) / SONG_HZ

    def predict(self, wav_path: str) -> list[RawChord]:
        import torch

        model, mean, std = self.load()
        feats, duration = self._features(wav_path)
        feats = (feats - mean) / std
        n_frames, window = feats.shape[0], self._config["timestep"]
        feats = np.pad(feats, ((0, (-n_frames) % window), (0, 0)))
        with torch.no_grad():
            x = torch.tensor(feats, dtype=torch.float32).reshape(-1, window, feats.shape[1])
            probs = torch.softmax(model(x), dim=-1).reshape(-1, self._config["num_chords"])
            conf, ids = probs.max(dim=-1)
        ids, conf = ids[:n_frames].tolist(), conf[:n_frames].tolist()

        dt = INST_LEN / window
        raws: list[RawChord] = []
        start = 0
        for i in range(1, n_frames + 1):
            if i == n_frames or ids[i] != ids[start]:
                root, quality, bass = parse_harte(voca_label(ids[start]))
                raws.append(RawChord(
                    start=start * dt, end=min(i * dt, duration), root=root,
                    quality=quality, bass=bass,
                    confidence=float(np.mean(conf[start:i]))))
                start = i
        return filter_short_segments(raws)
