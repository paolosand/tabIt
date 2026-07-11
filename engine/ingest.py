import json
import os
import subprocess
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


def _download_audio(url: str, workdir: str) -> tuple[str, dict]:
    """Download bestaudio + metadata via a single yt-dlp call;
    return (downloaded_path, info_dict)."""
    out_tmpl = os.path.join(workdir, "src.%(ext)s")
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio", "--no-playlist", "--write-info-json",
         "-o", out_tmpl, url],
        check=True, capture_output=True,
    )
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
