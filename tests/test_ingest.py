import json
import os
import shutil
import subprocess

import soundfile as sf

import engine.ingest as ingest_mod
from engine.ingest import ingest, _is_url


def test_download_audio_makes_single_ytdlp_call(tmp_path, monkeypatch):
    """Download and metadata must come from ONE yt-dlp invocation; the old
    second `-J` call was a full extra YouTube metadata round trip (~2s)."""
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        (tmp_path / "src.webm").write_bytes(b"fake-audio")
        (tmp_path / "src.info.json").write_text(
            json.dumps({"id": "abc", "title": "T", "duration": 123.0}))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(ingest_mod.subprocess, "run", fake_run)

    downloaded, info = ingest_mod._download_audio("https://youtu.be/abc", str(tmp_path))

    assert len(calls) == 1
    assert info["id"] == "abc" and info["duration"] == 123.0
    assert downloaded.endswith("src.webm")  # never the info json


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
