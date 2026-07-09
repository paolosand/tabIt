from engine.notes import normalize_note
from engine.schema import Key


def detect_key(wav_path: str) -> Key:
    """Detect musical key with Essentia's KeyExtractor (shaath profile for pop/rock)."""
    import essentia.standard as es

    audio = es.MonoLoader(filename=wav_path, sampleRate=44100)()
    tonic, scale, strength = es.KeyExtractor(profileType="shaath")(audio)
    return Key(tonic=normalize_note(tonic), mode=scale, confidence=float(strength))
