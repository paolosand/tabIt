__version__ = "0.4.0"


def engine_version() -> str:
    """Chart/cache version tag. Cached charts are keyed by it, so a release that
    changes the chord output bumps __version__ and older charts are re-analyzed."""
    return __version__
