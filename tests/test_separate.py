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
    assert "bass" in stems  # htdemucs_6s yields a bass stem
    assert all(os.path.exists(p) for p in stems.values())
