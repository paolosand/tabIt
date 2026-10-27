# Vendored: BTC (Bi-directional Transformer for Chord recognition)

Inference-only port of the model code from
https://github.com/jayg996/BTC-ISMIR19 at commit
`2682317be668032e6e4b269ded36adaa2ad57df0` (MIT License, Copyright (c) 2019
Jonggwon Park; the full licence text is in `LICENSE` next to this file).

Derived from upstream `btc_model.py` and `utils/transformer_modules.py`. Changes:
training-only code (loss, CRF hooks, attention-map plumbing, `__main__`) removed;
the removed `np.float` alias and the yaml/`HParams` loader replaced by a plain
config dict; the masks and timing signal are non-persistent buffers so the model
moves between devices cleanly. Layer and parameter names are unchanged so the
authors' released checkpoints load with `strict=True`.

The pretrained weights are NOT part of this repository. They are fetched on first
use from the authors' repository at the pinned commit above and verified against a
pinned SHA-256 (see `engine/chords_btc.py`).

## Citation

J. Park, K. Choi, S. Jeon, D. Kim, J. Park. "A Bi-directional Transformer for
Musical Chord Recognition." Proceedings of the 20th International Society for Music
Information Retrieval Conference (ISMIR), 2019.
