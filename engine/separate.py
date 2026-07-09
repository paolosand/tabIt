import os

import librosa
import numpy as np
import soundfile as sf


def _hpss_fallback(wav_path: str, out_dir: str) -> dict[str, str]:
    """Percussion-removed harmonic component via librosa HPSS. No bass stem."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    harmonic = librosa.effects.harmonic(y)
    out = os.path.join(out_dir, "harmonic.wav")
    sf.write(out, harmonic, sr)
    return {"harmonic": out}


def separate(wav_path: str, out_dir: str, model: str = "htdemucs_6s") -> dict[str, str]:
    """Separate stems with Demucs; fall back to HPSS on any failure."""
    os.makedirs(out_dir, exist_ok=True)
    try:
        from demucs.api import Separator, save_audio

        sep = Separator(model=model)
        _, stems = sep.separate_audio_file(wav_path)
        paths: dict[str, str] = {}
        for name, source in stems.items():
            p = os.path.join(out_dir, f"{name}.wav")
            save_audio(source, p, samplerate=sep.samplerate)
            paths[name] = p
        return paths
    except Exception:
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
