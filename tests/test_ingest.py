import json
import os
import shutil
import subprocess
import sys

import pytest
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


def test_ytdlp_binary_prefers_interpreter_sibling(tmp_path, monkeypatch):
    """PATH can resolve to a stale system yt-dlp that YouTube rejects
    (issue #4). When the running interpreter has a sibling yt-dlp (the
    venv's pinned copy), that one must win."""
    bin_dir = tmp_path / "venv" / "bin"
    bin_dir.mkdir(parents=True)
    (bin_dir / "yt-dlp").write_text("#!/bin/sh\n")
    monkeypatch.setattr(sys, "executable", str(bin_dir / "python"))

    assert ingest_mod._ytdlp_bin() == str(bin_dir / "yt-dlp")


def test_ytdlp_binary_falls_back_to_path(tmp_path, monkeypatch):
    """Without an interpreter-sibling copy (system Python, unusual venv
    layouts), fall back to PATH resolution."""
    bin_dir = tmp_path / "no-ytdlp-here"
    bin_dir.mkdir()
    monkeypatch.setattr(sys, "executable", str(bin_dir / "python"))

    assert ingest_mod._ytdlp_bin() == "yt-dlp"


def test_download_audio_invokes_resolved_ytdlp(tmp_path, monkeypatch):
    """_download_audio must call the resolved binary, not bare 'yt-dlp'."""
    bin_dir = tmp_path / "venv" / "bin"
    bin_dir.mkdir(parents=True)
    (bin_dir / "yt-dlp").write_text("#!/bin/sh\n")
    monkeypatch.setattr(sys, "executable", str(bin_dir / "python"))

    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        (tmp_path / "src.webm").write_bytes(b"fake-audio")
        (tmp_path / "src.info.json").write_text(
            json.dumps({"id": "abc", "title": "T", "duration": 123.0}))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(ingest_mod.subprocess, "run", fake_run)

    ingest_mod._download_audio("https://youtu.be/abc", str(tmp_path))

    assert calls[0][0] == str(bin_dir / "yt-dlp")


def test_download_audio_error_surfaces_stderr(tmp_path, monkeypatch):
    """A failed download must carry yt-dlp's stderr in the raised error;
    the bare CalledProcessError ('returned non-zero exit status 1') gave
    the API job store nothing to show users (issue #4)."""

    def fake_run(cmd, **kwargs):
        raise subprocess.CalledProcessError(
            1, cmd,
            stderr=b"ERROR: [youtube] abc: The following content is not available on this app.")

    monkeypatch.setattr(ingest_mod.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="not available on this app"):
        ingest_mod._download_audio("https://youtu.be/abc", str(tmp_path))


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
