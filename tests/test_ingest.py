import os
import soundfile as sf
from engine.ingest import ingest, _is_url


def test_is_url():
    assert _is_url("https://youtu.be/abc")
    assert _is_url("http://x.com/y")
    assert not _is_url("/tmp/song.wav")
    assert not _is_url("song.mp3")


def test_ingest_local_file_produces_mono_wav(tone_440_wav, tmp_path):
    result = ingest(tone_440_wav, str(tmp_path))
    assert os.path.exists(result.wav_path)
    data, sr = sf.read(result.wav_path)
    assert sr == 44100
    assert data.ndim == 1  # mono
    assert result.source.kind == "file"
    assert result.source.duration > 1.9
