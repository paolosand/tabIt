import numpy as np
import soundfile as sf
import pytest


@pytest.fixture(scope="session")
def tone_440_wav(tmp_path_factory):
    """A 2-second 440 Hz (A4) mono sine at 44100 Hz. Deterministic test audio."""
    sr = 44100
    t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
    y = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    path = tmp_path_factory.mktemp("audio") / "tone_440.wav"
    sf.write(str(path), y, sr)
    return str(path)
