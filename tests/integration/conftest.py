import numpy as np
import pytest
import soundfile as sf

SR = 44100
CHORD_SECONDS = 2.0

# Progression: Am -> F -> C -> G, 3 notes per chord, voiced ~C3-C5 (~130-520 Hz).
_PROGRESSION = [
    ("A:min", [220.00, 261.63, 329.63]),   # A3, C4, E4
    ("F:maj", [174.61, 220.00, 261.63]),   # F3, A3, C4
    ("C:maj", [261.63, 329.63, 392.00]),   # C4, E4, G4
    ("G:maj", [196.00, 246.94, 293.66]),   # G3, B3, D4
]

# Additive-synthesis harmonic amplitudes (fundamental + 3 overtones).
_HARMONIC_AMPS = [1.0, 0.5, 0.33, 0.25]


def _envelope(n_samples: int, sr: int, attack: float = 0.02, decay: float = 0.15) -> np.ndarray:
    """Short attack + gentle exponential decay so notes sound plucked/instrument-like."""
    env = np.ones(n_samples)
    attack_n = max(1, int(attack * sr))
    env[:attack_n] = np.linspace(0.0, 1.0, attack_n)
    t = np.arange(n_samples) / sr
    env *= np.exp(-decay * t)
    return env


def _render_chord(notes: list[float], seconds: float, sr: int) -> np.ndarray:
    n_samples = int(seconds * sr)
    t = np.arange(n_samples) / sr
    chord = np.zeros(n_samples)
    for freq in notes:
        note = np.zeros(n_samples)
        for h, amp in enumerate(_HARMONIC_AMPS, start=1):
            note += amp * np.sin(2 * np.pi * freq * h * t)
        chord += note * _envelope(n_samples, sr)
    return chord


def _synthesize_progression(sr: int = SR, chord_seconds: float = CHORD_SECONDS):
    audio = np.concatenate(
        [_render_chord(notes, chord_seconds, sr) for _, notes in _PROGRESSION]
    )
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = 0.9 * audio / peak
    return audio.astype(np.float32)


def _lab_lines(chord_seconds: float = CHORD_SECONDS) -> list[str]:
    lines = []
    for i, (label, _) in enumerate(_PROGRESSION):
        start = i * chord_seconds
        end = start + chord_seconds
        lines.append(f"{start:.3f} {end:.3f} {label}")
    return lines


@pytest.fixture(scope="session")
def ref_clip(tmp_path_factory):
    """Deterministic, richly-timbred Am-F-C-G progression + matching .lab ground truth.

    Synthesized (not a licensed recording) so the accuracy harness is
    self-contained and reproducible. Each note is additive synthesis
    (fundamental + 3 decaying harmonics) with a short attack/decay envelope,
    voiced in ~C3-C5, so the chord detector gets richer timbre than a pure tone.
    """
    workdir = tmp_path_factory.mktemp("ref_clip")
    wav_path = workdir / "clip.wav"
    lab_path = workdir / "clip.lab"

    audio = _synthesize_progression()
    sf.write(str(wav_path), audio, SR)
    lab_path.write_text("\n".join(_lab_lines()) + "\n")

    return {"wav": str(wav_path), "lab": str(lab_path)}
