import os
import shutil

import soundfile as sf

import engine.ingest as ingest_mod
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


def test_ingest_url_with_null_duration_coerces_to_zero(tone_440_wav, tmp_path, monkeypatch):
    """yt-dlp can return an explicit `"duration": null` (e.g. livestreams).

    ingest() must coerce that to 0.0 instead of raising TypeError from
    float(None).
    """
    workdir = str(tmp_path)
    downloaded_path = os.path.join(workdir, "src.webm")

    def fake_download_audio(url, wd):
        shutil.copy(tone_440_wav, downloaded_path)
        info = {"id": "abc", "title": "t", "duration": None}
        return downloaded_path, info

    def fake_to_mono_wav(in_path, out_path, sample_rate):
        shutil.copy(tone_440_wav, out_path)

    monkeypatch.setattr(ingest_mod, "_download_audio", fake_download_audio)
    monkeypatch.setattr(ingest_mod, "_to_mono_wav", fake_to_mono_wav)

    result = ingest("https://youtu.be/abc", workdir)

    assert result.source.kind == "youtube"
    assert result.source.duration == 0.0
    assert result.source.videoId == "abc"
    assert not os.path.exists(downloaded_path)  # cleanup happened
