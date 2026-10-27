__version__ = "0.4.0"


def engine_version(backend: str) -> str:
    """Chart/cache version tag: the same audio analysed by a different chord
    backend is a different chart, so the backend is part of the version."""
    return f"{__version__}-{backend}"
