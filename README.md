# TPU v6e vs H100: serving Cosmos3-Super and Qwen3.8-27B

A TPU Builders study. We served two vision-language models on a 4-chip Cloud TPU v6e with vLLM TorchTPU and on a single NVIDIA H100 with vLLM: NVIDIA's Cosmos3-Super Reasoner, a dense 33B model, and Qwen3.8-27B, a hybrid Gated DeltaNet and full-attention model. Both sides run in BF16 with the same flags, images, prompt and load generator. The Qwen3.8-27B H100 run is still pending, so that model has TPU results only.

**Site (one page):** https://ykirpichev.github.io/tpu-vs-h100-llm-bench/ — TLDR, pricing tiers, setup, method, results, and lessons, with a switch between the two models.

## TLDR

- **Cosmos3-Super:** TPU v6e-4 peaks at **828 tok/s** (concurrency 64) vs **431 tok/s** on 1× H100 BF16. Best measured cost is **$0.90 / 1M** output tokens on v6e Spot ($0.671/chip-h → $2.68/h) vs **$2.54 / 1M** on Modal H100 GPU-only ($3.949/h). Field agreement with H100 BF16: **92.9%**.
- **Qwen3.8-27B:** TPU v6e-4 peaks at **644 tok/s** (concurrency 128) → **$1.16 / 1M** on Spot. **H100 pending** — no invented H100 numbers.
- **Overall study spend (estimate):** **≈ $6.70** — Cosmos TPU ≈ $3.40 (Spot, all attempts), Qwen TPU ≈ $1.31 (≈29 min Spot from driver log), Cosmos H100 Modal ≈ $2.03 (BF16+FP8 server_ready + sweep walls × $5.73/h container). Estimates from logs/JSON × list prices, not a billing export.

## Pricing tiers (list, Nov 5, 2026)

$/1M = hourly ÷ (peak tok/s × 3600) × 1e6 at this study's measured peaks. Cite region/source; mark unverified.

### TPU v6e-4 (4 chips)

| Tier | $/hr | Cosmos $/1M @ 828 tok/s | Qwen $/1M @ 644 tok/s | Region / source |
| --- | ---: | ---: | ---: | --- |
| Spot | $2.684 | $0.90 | $1.16 | us-east1 Americas Spot $0.671112/chip-h · [TPU pricing](https://cloud.google.com/tpu/pricing) / catalog SKU `9A7C-D787-1EFD` |
| Flex-start / DWS | $5.40 | $1.81 | $2.33 | $1.35/chip-h · [DWS pricing](https://cloud.google.com/products/dws/pricing); no Flex-start SKU in us-east1 |
| 3-year CUD | $4.88 | $1.64 | $2.10 | us-east1/us-east5 $1.22/chip-h · [TPU pricing](https://cloud.google.com/tpu/pricing) Commitment column |
| 1-year CUD | $7.56 | $2.53 | $3.26 | us-east1/us-east5 $1.89/chip-h · same page |
| On-demand | $10.80 | $3.62 | $4.66 | us-east1 $2.70/chip-h · SKU `446F-AA1E-245D` |

CUD rows need a Cloud Sales / reservation commitment; this study ran Spot. Flex-start prices were flagged by Google for a Nov 2026 update.

### H100 — Modal (as run in this study)

| Tier | $/hr | Cosmos BF16 $/1M @ 431 tok/s | Qwen $/1M | Source |
| --- | ---: | ---: | --- | --- |
| GPU only | $3.949 | $2.54 | pending | Modal H100 list used for the Cosmos sweeps |
| Container as run (16 vCPU, 128 GiB) | $5.73 | $3.69 | pending | Same Modal app config |

### H100 — GCP A3 High (`a3-highgpu-8g`, per GPU = machine ÷ 8, us-central1)

| Tier | $/GPU-hr | Cosmos BF16 $/1M @ 431 tok/s | Qwen $/1M | Source |
| --- | ---: | ---: | --- | --- |
| Spot | $6.59 | $4.24 | pending | [Accelerator-optimized pricing](https://cloud.google.com/products/compute/pricing/accelerator-optimized) Spot $52.70/8 (Spot changes) |
| On-demand | $11.06 | $7.12 | pending | same page, $88.49/8 |
| 1-year CUD | $7.67 | $4.94 | pending | same page, $61.38/8 |
| 3-year CUD | $4.86 | $3.13 | pending | same page, $38.86/8 |

Full A3 machine price includes vCPU, memory, and Local SSD. These GCP H100 tiers were **not** the H100 path used in the study (Modal was); they are listed for comparison only.

## Results: Cosmos3-Super

| | TPU v6e-4, BF16 | 1x H100, BF16 | 1x H100, FP8 (reference) |
| --- | --- | --- | --- |
| Peak output throughput | **828 tok/s** at concurrency 64 | 431 tok/s at concurrency 32 | 953 tok/s at concurrency 128 |
| Time to first token, p50, concurrency 64 | 2.0 s | 12.3 s | 1.8 s |
| Price per hour | $2.68 Spot | $3.95 (GPU only) | $3.95 (GPU only) |
| Cost per 1M output tokens | **$0.90** | $2.54 | $1.15 |
| Structured fields matching H100 BF16 | **92.9%** | reference | 73.8% |

The v6e-4 has 128 GB of HBM, so with 65 GB of weights its KV cache holds about 120 concurrent requests. One H100 holds about 24 in BF16 and queues the rest, so its throughput stops rising after concurrency 32.

Getting capacity was harder than getting the software to work. Three Spot TPU VMs were preempted within 16 minutes, and on-demand v6e-4 was unavailable in every zone we tried. A GKE Spot node pool in `us-east1-d` came up in about 8 minutes and ran the full sweep without being preempted. The TPU time for the whole exercise cost about $3.40.

## Results: Qwen3.8-27B (TPU v6e only, H100 pending)

| Concurrency | TPU v6e-4 BF16, tok/s | TTFT p50 | Per-token p50 | 1x H100, BF16 |
| --- | --- | --- | --- | --- |
| 1 | 78 | 0.13 s | 12.0 ms | pending |
| 8 | 238 | 0.56 s | 13.8 ms | pending |
| 16 | 581 | 0.79 s | 17.9 ms | pending |
| 32 | 591 | 2.10 s | 42.2 ms | pending |
| 64 | 568 | 3.34 s | 104.3 ms | pending |
| 128 | **644** | 3.52 s | 195.2 ms | pending |

The TPU peaks at 644 output tok/s at concurrency 128, which is $1.16 per 1M output tokens at the $2.68/h Spot price. Prompts were 1,492 tokens, and all 768 requests succeeded. Only the 16 full-attention layers hold a KV cache, and vLLM reported 565,703 tokens of TPU KV cache, so memory never limited the sweep. The server was ready 431 s after start, of which 236 s was TorchTPU compilation. Requests disable thinking with `chat_template_kwargs: {enable_thinking: false}` so every response is 150 tokens of report.

The H100 BF16 sweep for this model has not been run yet. There are no H100 throughput, cost or output-agreement numbers for Qwen3.8-27B until it is. Raw data is in `benchmark/results/qwen38/`.

## Repository layout

```
benchmark/
  stage.sh                 assembles the flat kit the drivers expect at /tmp/bench
  client/                  bench_client.py, prompt.txt, the image list and fetch_images.sh
  pkgs/                    NVIDIA's transformers-cosmos3 and vllm-cosmos3 plugins (OpenMDW-1.1),
                           vendored from cosmos-framework at commit 98c35ed
  tpu-gke/                 GKE pod spec, a resumable Spot driver, and a Spot vs Flex-start race script
  tpu-vm/                  tpu_remote.sh and a driver for Cloud TPU API VMs
  h100-modal/              modal_app.py for the H100 side
  tools/compare_quality.py compares greedy outputs between backends
  results/                 raw sweep JSON for every backend (outputs are in the `samples` field)
site/                      the study website (Vite, React, Tailwind, shadcn/ui, Recharts)
```

## Reproduce

You need a GCP project with Spot TPU v6e quota in a zone that has stock, `gcloud`, `kubectl`, the `aws` CLI (to fetch the public test images), and a Modal account for the H100 side.

```bash
bash benchmark/stage.sh                      # builds /tmp/bench and downloads 64 Argoverse 2 frames

export PROJECT=your-project ZONE=us-east1-d
gcloud container clusters create cosmos-spot --project=$PROJECT --location=$ZONE \
  --node-locations=$ZONE --machine-type=e2-medium --num-nodes=1
gcloud container node-pools create tpu --project=$PROJECT --location=$ZONE --cluster=cosmos-spot \
  --node-locations=$ZONE --machine-type=ct6e-standard-4t --num-nodes=1 --spot
gcloud container clusters get-credentials cosmos-spot --project=$PROJECT --location=$ZONE

bash /tmp/bench/k8s/drive_gke_resumable.sh gke_${PROJECT}_${ZONE}_cosmos-spot v6e-4-bf16
gcloud container clusters delete cosmos-spot --project=$PROJECT --location=$ZONE --quiet

cd /tmp/bench && modal run modal_app.py --mode download && modal run modal_app.py --variant bf16

python benchmark/tools/compare_quality.py benchmark/results/result_h100_bf16.json \
  benchmark/results/result_v6e-4-bf16.json
```

A Spot v6e-4 costs about $2.68 an hour, and one TPU sweep fits in under an hour, including startup. Delete the cluster when you are done.

## Running the site locally

```bash
cd site
npm install
npm run dev        # http://localhost:5717
```

The `Deploy site` workflow builds `site/` and publishes it to the `gh-pages` branch (legacy GitHub Pages source) on every push to `main`.

## Caveats

- There was one run per backend, with one workload shape: a single image, 1,457 prompt tokens for Cosmos3-Super or 1,492 for Qwen3.8-27B, and 150 output tokens.
- Qwen3.8-27B has TPU v6e results only; its H100 comparison is pending.
- Quality is measured as agreement with H100 BF16, not accuracy against ground truth, and only covers the first 150 tokens of each report.
- The comparison is a four-chip TPU slice against one GPU, so cost per token is the fairer headline than raw speed.
- Prices are list prices on Nov 5, 2026; Spot and Flex-start change often.

Test images come from Argoverse 2 (CC BY-NC-SA 4.0). The models are [nvidia/Cosmos3-Super](https://huggingface.co/nvidia/Cosmos3-Super) (OpenMDW-1.1) and [Qwen/Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B).
