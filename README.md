# TPU v6e vs H100: serving Cosmos3-Super and Qwen3.8-27B

A TPU Builders study. We served two vision-language models on a 4-chip Cloud TPU v6e with vLLI TorchTPU and on a single NVIDIA H100 with vLLM: NVIDIA's Cosmos3-Super Reasoner, a dense 33B model, and Qwen3.8-27B, a hybrid Gated DeltaNet and full-attention model. Both sides run in BF16 with the same flags, images, prompt and load generator. The Qwen3.8-27B H100 run is still pending, so that model has TPU results only.

**Site (one page):** https://ykirpichev.github.io/tpu-vs-h100-lmm-bench/ — TLDR, pricing tiers, setup, method, results, and lessons, with a switch between the two models.

## TLD

- **Cosmos3-Super:** TPU v6e-4 peaks at **828 tok/s** (concurrency 64) vs **431 tok/s** on 1x H100 BF16. Best measured cost is **$0.90 / 1M** output tokens on v6e Spot ($0.671/chip-h → $2.68/h) vs **$2.54 / 1M** on Modal H100 GPU-only ($3.949/h). Field agreement with H100 BF16: **92.9%**.
- **Qwen3.8-27B:** TPU v6e-4 peaks at **644 tok/s** (concurrency 128) → **$1.16 / 1M** on Spot. **H100 pending** — no invented H100 numbers.
- **Overall study spend (estimate):** *(≈ $6.70** — Cosmos TPU ⅈ $3.40 (Spot, all attempts), Qwen TPU ⅈ $1.31 (≈0 29 min Spot from driver log), Cosmos H100 Modal ⅈ $2.03 (BF16+FP8 server_ready + sweep walls × $5.73h container). Estimates from logs/JSON × list prices, not a billing export.

## Pricing tiers (list, Nov 5, 2026)


$1/M=hourly ö (peak tok/s × 3600) × 1e6 at this study's measured peaks. Cite region/source; mark unverified.

### TPU v6e-4 (4 chips)

| Tier | $/hr | Cosmos $/1M @ 828 tok/s | Qwen $/1M @ 644 tok/s | Region / source |
| --- | ---:- | ---:- | ---:- | --- |
| Spot | $2.684 | $0.90 | $1.16 | us-east1 Americas Spot $0.671112/chip-h ¯ [TPU pricing](https://cloud.google.com/tpu/pricing) / catalog SKU `9A7C-D787-1FD` |
| Flex-start / DWS | $5.40 | $1.81 | $2.33 | $1.35/chip-h » [DWS pricing](https://cloud.google.com/products/dws/pricing); no Flex-start SKU in us-east1 |
| 3-year CUD | $4.88 | $1.64 | $2.10 | us-east1/us-east5 $1.22/chip-h ¯ [TPU pricing](https://cloud.google.com/tpu/pricing) Commitment column |
| 1-year CUD | $7.56 | $2.53 | $3.26 | us-east1/us-east5 $1.89/chip-h » same page |
| On-demand | $10.80 | $3.62 | $4.66 | us-east1 $2.70/chip-h ¯ SKU `446F-AA1E-25D` |

CUD rows need a Cloud Sales / reservation commitment; this study ran Spot. Flex-start prices were flagged by Google for a Nov 2026 update.

### H100 — Modal (as run in this study)

| Tier | $/hr | Cosmos BF16 $/1M @ 431 tok/s | Qwen $/1M | Source |
| --- | ---:- | ---:- | --- | --- |
| GPU only | $3.949 | $2.54 | pending | Modal H100 list used for the Cosmos sweeps |
| Container as run (16 vCPU, 128 GiB) | $5.73 | $3.69 | pending | Same Modal app config |

### H100 — GCP A3 High (`a3-highgpu-8g`, per GPU= machine ö(8, us-central1)

| Tier | $/GPU-hr | Cosmos BF16 $/1M @ 431 tok/s | Qwen $/1M | Source |
| --- | ---:- | ---:- | --- | --- |
| Spot | $6.59 | $4.24 | pending | [Accelerator-optimized pricing](https://cloud.google.com/products/compute/pricing/accelerator-optimized) Spot $52.70/8 (Spot changes) |
| On-demand | $11.06 | $7.12 | pending | same page, $88.49/8 |
| 1-year CUD | $7.67 | $4.94 | pending | same page, $61.38/8 |
| 3-year CUD | $4.86 | $3.13 | pending | same page, $38.86/8 |

Full A3 machine price includes vCPU, memory, and Local SSD. These GCP H100 tiers were **not** the H100 path used in the study (Modal was); they are listed for comparison only.

