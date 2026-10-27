"""BTC (Bi-directional Transformer for Chord recognition), inference only.

Vendored and trimmed from https://github.com/jayg996/BTC-ISMIR19
(MIT, (c) 2019 Jonggwon Park) -- see NOTICE.md and LICENSE in this directory.
Parameter names match upstream so the released checkpoints load strictly.
"""
import math

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


def _gen_bias_mask(max_length):
    """-inf above the diagonal: a position may not attend to the future."""
    np_mask = np.triu(np.full([max_length, max_length], -np.inf), 1)
    return torch.from_numpy(np_mask).type(torch.FloatTensor).unsqueeze(0).unsqueeze(1)


def _gen_timing_signal(length, channels, min_timescale=1.0, max_timescale=1.0e4):
    """Sinusoidal position signal, shape [1, length, channels] (tensor2tensor)."""
    position = np.arange(length)
    num_timescales = channels // 2
    log_timescale_increment = (
        math.log(float(max_timescale) / float(min_timescale)) / (float(num_timescales) - 1))
    inv_timescales = min_timescale * np.exp(
        np.arange(num_timescales).astype(float) * -log_timescale_increment)
    scaled_time = np.expand_dims(position, 1) * np.expand_dims(inv_timescales, 0)
    signal = np.concatenate([np.sin(scaled_time), np.cos(scaled_time)], axis=1)
    signal = np.pad(signal, [[0, 0], [0, channels % 2]], "constant", constant_values=[0.0, 0.0])
    return torch.from_numpy(signal.reshape([1, length, channels])).type(torch.FloatTensor)


class LayerNorm(nn.Module):
    # Upstream's own (unbiased-std) layer norm, not nn.LayerNorm: the weights
    # were trained against this exact formula.
    def __init__(self, features, eps=1e-6):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(features))
        self.beta = nn.Parameter(torch.zeros(features))
        self.eps = eps

    def forward(self, x):
        mean = x.mean(-1, keepdim=True)
        std = x.std(-1, keepdim=True)
        return self.gamma * (x - mean) / (std + self.eps) + self.beta


class MultiHeadAttention(nn.Module):
    def __init__(self, input_depth, total_key_depth, total_value_depth, output_depth,
                 num_heads, bias_mask, dropout):
        super().__init__()
        if total_key_depth % num_heads or total_value_depth % num_heads:
            raise ValueError("key/value depth must be divisible by the number of heads")
        self.num_heads = num_heads
        self.query_scale = (total_key_depth // num_heads) ** -0.5
        self.register_buffer("bias_mask", bias_mask, persistent=False)
        self.query_linear = nn.Linear(input_depth, total_key_depth, bias=False)
        self.key_linear = nn.Linear(input_depth, total_key_depth, bias=False)
        self.value_linear = nn.Linear(input_depth, total_value_depth, bias=False)
        self.output_linear = nn.Linear(total_value_depth, output_depth, bias=False)
        self.dropout = nn.Dropout(dropout)

    def _split_heads(self, x):
        b, t, d = x.shape
        return x.view(b, t, self.num_heads, d // self.num_heads).permute(0, 2, 1, 3)

    def _merge_heads(self, x):
        b, h, t, d = x.shape
        return x.permute(0, 2, 1, 3).contiguous().view(b, t, h * d)

    def forward(self, queries, keys, values):
        q = self._split_heads(self.query_linear(queries)) * self.query_scale
        k = self._split_heads(self.key_linear(keys))
        v = self._split_heads(self.value_linear(values))
        logits = torch.matmul(q, k.permute(0, 1, 3, 2))
        logits = logits + self.bias_mask[:, :, :logits.shape[-2], :logits.shape[-1]]
        weights = self.dropout(F.softmax(logits, dim=-1))
        return self.output_linear(self._merge_heads(torch.matmul(weights, v)))


class Conv(nn.Module):
    """Pad + 1-D convolution over [batch, time, channels]."""

    def __init__(self, input_size, output_size, kernel_size):
        super().__init__()
        self.pad = nn.ConstantPad1d((kernel_size // 2, (kernel_size - 1) // 2), 0)
        self.conv = nn.Conv1d(input_size, output_size, kernel_size=kernel_size, padding=0)

    def forward(self, inputs):
        return self.conv(self.pad(inputs.permute(0, 2, 1))).permute(0, 2, 1)


class PositionwiseFeedForward(nn.Module):
    """conv -> ReLU -> conv -> ReLU (upstream's 'cc' layer_config, both-side padding)."""

    def __init__(self, input_depth, filter_size, output_depth, dropout):
        super().__init__()
        self.layers = nn.ModuleList([
            Conv(input_depth, filter_size, kernel_size=3),
            Conv(filter_size, output_depth, kernel_size=3),
        ])
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        for layer in self.layers:
            x = self.dropout(self.relu(layer(x)))
        return x


class SelfAttentionBlock(nn.Module):
    def __init__(self, hidden_size, key_depth, value_depth, filter_size, num_heads,
                 bias_mask, layer_dropout, attention_dropout, relu_dropout):
        super().__init__()
        self.multi_head_attention = MultiHeadAttention(
            hidden_size, key_depth, value_depth, hidden_size, num_heads, bias_mask,
            attention_dropout)
        self.positionwise_convolution = PositionwiseFeedForward(
            hidden_size, filter_size, hidden_size, relu_dropout)
        self.dropout = nn.Dropout(layer_dropout)
        self.layer_norm_mha = LayerNorm(hidden_size)
        self.layer_norm_ffn = LayerNorm(hidden_size)

    def forward(self, x):
        x_norm = self.layer_norm_mha(x)
        x = self.dropout(x + self.multi_head_attention(x_norm, x_norm, x_norm))
        return self.dropout(x + self.positionwise_convolution(self.layer_norm_ffn(x)))


class BiDirectionalSelfAttention(nn.Module):
    """One forward-masked and one backward-masked block, concatenated and projected."""

    def __init__(self, hidden_size, key_depth, value_depth, filter_size, num_heads,
                 max_length, layer_dropout, attention_dropout, relu_dropout):
        super().__init__()
        args = (hidden_size, key_depth, value_depth, filter_size, num_heads)
        drops = (layer_dropout, attention_dropout, relu_dropout)
        forward_mask = _gen_bias_mask(max_length)
        self.attn_block = SelfAttentionBlock(*args, forward_mask, *drops)
        self.backward_attn_block = SelfAttentionBlock(
            *args, torch.transpose(forward_mask, 2, 3), *drops)
        self.linear = nn.Linear(hidden_size * 2, hidden_size)

    def forward(self, x):
        return self.linear(torch.cat((self.attn_block(x), self.backward_attn_block(x)), dim=2))


class BiDirectionalSelfAttentionLayers(nn.Module):
    def __init__(self, embedding_size, hidden_size, num_layers, num_heads, key_depth,
                 value_depth, filter_size, max_length, input_dropout, layer_dropout,
                 attention_dropout, relu_dropout):
        super().__init__()
        self.register_buffer(
            "timing_signal", _gen_timing_signal(max_length, hidden_size), persistent=False)
        self.embedding_proj = nn.Linear(embedding_size, hidden_size, bias=False)
        self.self_attn_layers = nn.Sequential(*[
            BiDirectionalSelfAttention(
                hidden_size, key_depth or hidden_size, value_depth or hidden_size,
                filter_size, num_heads, max_length, layer_dropout, attention_dropout,
                relu_dropout)
            for _ in range(num_layers)])
        self.layer_norm = LayerNorm(hidden_size)
        self.input_dropout = nn.Dropout(input_dropout)

    def forward(self, inputs):
        x = self.embedding_proj(self.input_dropout(inputs))
        x = x + self.timing_signal[:, :inputs.shape[1], :]
        return self.layer_norm(self.self_attn_layers(x))


class SoftmaxOutputLayer(nn.Module):
    def __init__(self, hidden_size, output_size):
        super().__init__()
        self.output_projection = nn.Linear(hidden_size, output_size)
        # Never used at inference, but present in the released checkpoints; kept
        # so they load with strict=True.
        self.lstm = nn.LSTM(input_size=hidden_size, hidden_size=hidden_size // 2,
                            batch_first=True, bidirectional=True)

    def forward(self, hidden):
        return self.output_projection(hidden)


class BTCModel(nn.Module):
    """Features [batch, timestep, feature_size] -> chord logits [batch, timestep, num_chords]."""

    def __init__(self, config):
        super().__init__()
        self.self_attn_layers = BiDirectionalSelfAttentionLayers(
            config["feature_size"], config["hidden_size"], config["num_layers"],
            config["num_heads"], config["total_key_depth"], config["total_value_depth"],
            config["filter_size"], config["timestep"], config["input_dropout"],
            config["layer_dropout"], config["attention_dropout"], config["relu_dropout"])
        self.output_layer = SoftmaxOutputLayer(config["hidden_size"], config["num_chords"])

    def forward(self, x):
        return self.output_layer(self.self_attn_layers(x))
