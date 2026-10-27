import torch

from engine.vendor.btc.model import BTCModel

TINY = dict(feature_size=12, timestep=8, num_chords=5, input_dropout=0.0,
            layer_dropout=0.0, attention_dropout=0.0, relu_dropout=0.0,
            num_layers=2, num_heads=2, hidden_size=16, total_key_depth=16,
            total_value_depth=16, filter_size=16)


def test_forward_shape_is_batch_time_chords():
    model = BTCModel(TINY).eval()
    out = model(torch.randn(3, 8, 12))
    assert out.shape == (3, 8, 5)


def test_param_names_match_upstream_checkpoints():
    keys = set(BTCModel(TINY).state_dict())
    assert "self_attn_layers.embedding_proj.weight" in keys
    assert ("self_attn_layers.self_attn_layers.0.backward_attn_block."
            "positionwise_convolution.layers.1.conv.weight") in keys
    assert "self_attn_layers.layer_norm.gamma" in keys
    assert "output_layer.output_projection.weight" in keys
    assert "output_layer.lstm.weight_ih_l0" in keys
    # masks / timing signal are derived, not learned: absent from checkpoints
    assert not any("bias_mask" in k or "timing_signal" in k for k in keys)


def test_forward_and_backward_blocks_see_opposite_halves():
    """Perturbing a late frame must not change the forward block's earlier
    output but must change the backward block's, and vice versa."""
    model = BTCModel({**TINY, "num_layers": 1}).eval()
    layer = model.self_attn_layers.self_attn_layers[0]
    x = torch.randn(1, 8, 16)
    x2 = x.clone()
    x2[:, 7] = torch.randn(16) * 5  # not a constant shift: layer norm would cancel it
    with torch.no_grad():
        f1, f2 = layer.attn_block(x), layer.attn_block(x2)
        b1, b2 = layer.backward_attn_block(x), layer.backward_attn_block(x2)
    assert torch.allclose(f1[:, :6], f2[:, :6], atol=1e-5)
    assert not torch.allclose(b1[:, :6], b2[:, :6], atol=1e-5)
