import librosa


def track_beats(wav_path: str) -> tuple[float, list[float]]:
    """Return (bpm, beat_times_in_seconds) using librosa's beat tracker."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    tempo, beat_times = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(tempo) if hasattr(tempo, "__float__") else float(tempo[0])
    return bpm, [float(t) for t in beat_times]
