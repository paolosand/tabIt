import os
import soundfile as sf
import pytest
from engine.separate import harmonic_mix, _hpss_fallback


def test_hpss_fallback_produces_wav(tone_440_wav, tmp_path):
    stems = _hpss_fallback(tone_440_wav, str(tmp_path))
    assert "harmonic" in stems
    assert os.path.exists(stems["harmonic"])


def test_harmonic_mix_excludes_drums(tone_440_wav, tmp_path):
    # Fake stems: reuse the tone as both a "drums" and "other" stem.
    stems = {"drums": tone_440_wav, "other": tone_440_wav, "bass": tone_440_wav}
    out = harmonic_mix(stems, str(tmp_path))
    assert os.path.exists(out)
    data, sr = sf.read(out)
    assert data.ndim == 1


def test_harmonic_mix_passthrough_when_only_harmonic(tone_440_wav, tmp_path):
    out = harmonic_mix({"harmonic": tone_440_wav}, str(tmp_path))
    assert out == tone_440_wav


@pytest.mark.integration
def test_demucs_separates_into_stems(tone_440_wav, tmp_path):
    from engine.separate import separate
    stems = separate(tone_440_wav, str(tmp_path))
    assert "bass" in stems  # htdemucs yields a bass stem
    assert all(os.path.exists(p) for p in stems.values())


def test_pick_device_prefers_cuda_then_mps_then_cpu(monkeypatch):
    import torch
    from engine.separate import _pick_device

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    assert _pick_device() == "cuda"

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    assert _pick_device() == "mps"

    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    assert _pick_device() == "cpu"


def test_separate_defaults_to_4stem_and_reuses_separator(tone_440_wav, tmp_path, monkeypatch):
    """The pipeline only consumes the bass stem plus the sum of non-drum stems,
    which the 4-stem htdemucs provides -- and the model must load once per
    process, not once per song."""
    import torch
    import demucs.api
    from engine import separate as sep_mod

    created = []

    class FakeSeparator:
        samplerate = 44100

        def __init__(self, model="", device="", **kwargs):
            created.append((model, device))

        def separate_audio_file(self, path):
            stem = torch.zeros(2, 100)
            return None, {"bass": stem, "other": stem}

    monkeypatch.setattr(demucs.api, "Separator", FakeSeparator)
    sep_mod._get_separator.cache_clear()
    try:
        out1 = sep_mod.separate(tone_440_wav, str(tmp_path / "a"))
        out2 = sep_mod.separate(tone_440_wav, str(tmp_path / "b"))
    finally:
        sep_mod._get_separator.cache_clear()  # don't leak the fake to other tests

    assert "bass" in out1 and "bass" in out2  # fake path ran, not the HPSS fallback
    assert len(created) == 1  # separator constructed once, reused across songs
    assert created[0][0] == "htdemucs"


def test_separate_retries_on_cpu_when_gpu_inference_fails(tone_440_wav, tmp_path, monkeypatch):
    """A GPU-side failure must fall back to CPU demucs (stems intact), not all
    the way down to HPSS (which loses the bass stem and with it slash chords)."""
    import torch
    import demucs.api
    from engine import separate as sep_mod

    created = []

    class FakeSeparator:
        samplerate = 44100

        def __init__(self, model="", device="", **kwargs):
            self.device = device
            created.append(device)

        def separate_audio_file(self, path):
            if self.device == "mps":
                raise RuntimeError("MPS op not supported")
            stem = torch.zeros(2, 100)
            return None, {"bass": stem, "other": stem}

    monkeypatch.setattr(demucs.api, "Separator", FakeSeparator)
    monkeypatch.setattr(sep_mod, "_pick_device", lambda: "mps")
    sep_mod._get_separator.cache_clear()
    try:
        out = sep_mod.separate(tone_440_wav, str(tmp_path))
    finally:
        sep_mod._get_separator.cache_clear()

    assert created == ["mps", "cpu"]
    assert "bass" in out  # demucs stems, not the HPSS fallback
