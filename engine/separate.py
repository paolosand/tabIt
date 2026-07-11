import functools
import logging
import os

import librosa
import numpy as np
import soundfile as sf

# torch 2.0's MPS backend can't run demucs' complex STFT ops natively; the
# fallback keeps those on CPU while the heavy transformer runs on the GPU.
# Must be set before torch initializes, hence at module import.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

logger = logging.getLogger(__name__)


def _hpss_fallback(wav_path: str, out_dir: str) -> dict[str, str]:
    """Percussion-removed harmonic component via librosa HPSS. No bass stem."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    harmonic = librosa.effects.harmonic(y)
    out = os.path.join(out_dir, "harmonic.wav")
    sf.write(out, harmonic, sr)
    return {"harmonic": out}


def _pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


@functools.lru_cache(maxsize=2)
def _get_separator(model: str, device: str):
    from demucs.api import Separator

    return Separator(model=model, device=device, progress=False)


def _demucs_stems(wav_path: str, out_dir: str, model: str, device: str) -> dict[str, str]:
    from demucs.api import save_audio

    sep = _get_separator(model, device)
    _, stems = sep.separate_audio_file(wav_path)
    paths: dict[str, str] = {}
    for name, source in stems.items():
        p = os.path.join(out_dir, f"{name}.wav")
        save_audio(source, p, samplerate=sep.samplerate)
        paths[name] = p
    return paths


def separate(wav_path: str, out_dir: str, model: str = "htdemucs") -> dict[str, str]:
    """Separate stems with Demucs (GPU when available, CPU retry on GPU
    failure); fall back to HPSS only if demucs itself is unusable."""
    os.makedirs(out_dir, exist_ok=True)
    device = _pick_device()
    try:
        return _demucs_stems(wav_path, out_dir, model, device)
    except Exception as exc:
        if device != "cpu":
            logger.warning(
                "Demucs on %s failed (%s); retrying on cpu", device, exc
            )
            try:
                return _demucs_stems(wav_path, out_dir, model, "cpu")
            except Exception as cpu_exc:
                exc = cpu_exc
        logger.warning(
            "Demucs separation failed (%s); falling back to HPSS (no bass stem)", exc
        )
        return _hpss_fallback(wav_path, out_dir)


def harmonic_mix(stems: dict[str, str], out_dir: str) -> str:
    """Sum all non-drum stems into one mono WAV (chord-model input)."""
    if set(stems) == {"harmonic"}:
        return stems["harmonic"]

    os.makedirs(out_dir, exist_ok=True)
    mix = None
    sr = None
    for name, path in stems.items():
        if name == "drums":
            continue
        y, this_sr = librosa.load(path, sr=None, mono=True)
        sr = this_sr if sr is None else sr
        mix = y if mix is None else mix[: len(y)] + y[: len(mix)]
    out = os.path.join(out_dir, "harmonic_mix.wav")
    sf.write(out, mix / np.max(np.abs(mix) + 1e-9), sr)
    return out
