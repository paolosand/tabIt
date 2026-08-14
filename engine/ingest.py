import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass

import soundfile as sf

from engine.schema import Source


@dataclass
class IngestResult:
    wav_path: str
    source: Source


def _is_url(src: str) -> bool:
    return src.startswith("http://") or src.startswith("https://")


def _to_mono_wav(in_path: str, out_path: str, sample_rate: int) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", in_path, "-ac", "1", "-ar", str(sample_rate), out_path],
        check=True, capture_output=True,
    )


def _ytdlp_bin() -> str:
    """Prefer the yt-dlp installed alongside this interpreter (the venv's
    pinned copy). Bare PATH resolution can silently pick a stale system
    copy that YouTube rejects (issue #4)."""
    sibling = os.path.join(os.path.dirname(sys.executable), "yt-dlp")
    return sibling if os.path.exists(sibling) else "yt-dlp"


_DOWNLOAD_RETRIES = 3
_RETRY_BACKOFF_SEC = 2


def _download_audio(url: str, workdir: str) -> tuple[str, dict]:
    """Download bestaudio + metadata via a single yt-dlp call;
    return (downloaded_path, info_dict).

    YouTube's fetch 403s are frequently transient (a bare retry with no
    other change succeeds), so a failed attempt is retried a few times
    with a short backoff before surfacing an error."""
    out_tmpl = os.path.join(workdir, "src.%(ext)s")
    cmd = [_ytdlp_bin(), "-f", "bestaudio", "--no-playlist", "--write-info-json",
           "-o", out_tmpl, url]
    for attempt in range(1, _DOWNLOAD_RETRIES + 1):
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            break
        except subprocess.CalledProcessError as e:
            if attempt == _DOWNLOAD_RETRIES:
                stderr = (e.stderr or b"").decode(errors="replace").strip()
                tail = " | ".join(stderr.splitlines()[-3:]) or "no stderr"
                raise RuntimeError(f"yt-dlp failed for {url}: {tail}") from e
            time.sleep(_RETRY_BACKOFF_SEC)
    info_path = os.path.join(workdir, "src.info.json")
    with open(info_path) as f:
        info = json.load(f)
    os.remove(info_path)
    downloaded = next(
        os.path.join(workdir, f) for f in os.listdir(workdir)
        if f.startswith("src.") and not f.endswith(".info.json")
    )
    return downloaded, info


def ingest(src: str, workdir: str, sample_rate: int = 44100) -> IngestResult:
    os.makedirs(workdir, exist_ok=True)
    wav_path = os.path.join(workdir, "audio.wav")
    if _is_url(src):
        downloaded, info = _download_audio(src, workdir)
        try:
            _to_mono_wav(downloaded, wav_path, sample_rate)
        finally:
            os.remove(downloaded)
        source = Source(kind="youtube", videoId=info.get("id"),
                        title=info.get("title"), duration=float(info.get("duration") or 0.0))
    else:
        _to_mono_wav(src, wav_path, sample_rate)
        info_sf = sf.info(wav_path)
        source = Source(kind="file", title=os.path.basename(src), duration=info_sf.duration)
    return IngestResult(wav_path=wav_path, source=source)
