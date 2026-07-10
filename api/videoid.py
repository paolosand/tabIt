import re
from urllib.parse import parse_qs, urlparse

_ID = r"([A-Za-z0-9_-]{11})"
_PATH_PATTERNS = [re.compile(p + _ID) for p in (r"^/shorts/", r"^/embed/", r"^/")]


def extract_video_id(url: str) -> str | None:
    """Parse a YouTube URL into its 11-char video id, or None."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or "").removeprefix("www.")
    if host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        v = parse_qs(parsed.query).get("v", [None])[0]
        if v and re.fullmatch(_ID, v):
            return v
        for pat in _PATH_PATTERNS[:2]:  # /shorts/, /embed/
            m = pat.match(parsed.path)
            if m:
                return m.group(1)
        return None
    if host == "youtu.be":
        m = _PATH_PATTERNS[2].match(parsed.path)  # /<id>
        return m.group(1) if m else None
    return None
