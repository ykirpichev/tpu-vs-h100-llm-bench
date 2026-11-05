export type ModelInfo = {
  id: "cosmos3" | "qwen38"
  name: string
  short: string
  hf: string
  date: string
  summary: string
  architecture: string
  weights: string
  serveTarget: string
  modelArgs: string
  plugin: string | null
  requestExtra: string | null
  scaling: { title: string; body: string[] }
  h100Edge: { title: string; body: string[] }
  quote: string
}

export const MODELS: Record<ModelInfo["id"], ModelInfo> = {
  cosmos3: {
    id: "cosmos3",
    name: "NVIDIA Cosmos3-Super Reasoner",
    short: "Cosmos3-Super",
    hf: "nvidia/Cosmos3-Super",
    date: "Nov 5, 2026",
    summary:
      "The Reasoner tower of Cosmos3-Super: a Qwen3-VL-32B-shaped vision-language model, about 33B parameters and 65 GB in BF16.",
    architecture: "Dense transformer, 64 full-attention layers, Qwen3-VL vision encoder",
    weights: "≈ 65 GB BF16 (129 GB download: Reasoner and generator weights are interleaved)",
    serveTarget: "/dev/shm/cosmos3-super-qwen3vl",
    modelArgs: `--hf-overrides '{"architectures": ["Cosmos3ReasonerForConditionalGeneration"]}'`,
    plugin: "NVIDIA vllm-cosmos3 plugin registers Cosmos3ReasonerForConditionalGeneration and keeps only the understanding weights.",
    requestExtra: null,
    scaling: {
      title: "Why the TPU keeps scaling",
      body: [
        "Four v6e chips have 128 GB of HBM. After 65 GB of BF16 weights, vLLM's KV cache holds 200,448 tokens: about 120 of these 1,607-token requests at once.",
        "One 80 GB H100 fits about 24 requests in BF16. Past concurrency 32 the extra requests just queue, so throughput stays flat at ≈430 tok/s and time to first token climbs to 36 s at 128.",
      ],
    },
    h100Edge: {
      title: "Where the H100 still wins",
      body: [
        "At concurrency 64 and above, per-token latency on the TPU rises (67 ms, then 153 ms) because it is batching far more requests. The H100 stays at ≈45 ms per token, but only because it queues the rest.",
        "In FP8, which v6e does not support in hardware, the H100 reaches 953 tok/s. FP8 is not validated by NVIDIA for this model, and its outputs drift further from BF16.",
      ],
    },
    quote: "Field agreement with H100 BF16",
  },
  qwen38: {
    id: "qwen38",
    name: "Qwen3.8-27B",
    short: "Qwen3.8-27B",
    hf: "Qwen/Qwen3.8-27B",
    date: "Nov 5, 2026",
    summary:
      "Qwen3.8-27B: a natively multimodal 27.8B-parameter model with a hybrid stack of Gated DeltaNet linear-attention layers and full-attention layers, about 56 GB in BF16.",
    architecture: "Hybrid: 48 Gated DeltaNet (linear attention) + 16 full-attention layers, built-in vision encoder",
    weights: "≈ 56 GB BF16",
    serveTarget: "/dev/shm/qwen3.8-27b",
    modelArgs: "",
    plugin: null,
    requestExtra: `"chat_template_kwargs": {"enable_thinking": false}`,
    scaling: { title: "How each side scales", body: [] },
    h100Edge: { title: "Where the H100 holds up", body: [] },
    quote: "Field agreement with H100 BF16",
  },
}
