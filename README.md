# TPU v6e vs H100: serving Cosmos3-Super

A TPU Builders study. We served NVIDIA's Cosmos3-Super Reasoner, a 33B vision-language model, on a 4-chip Cloud TPU v6e with vLLM TorchTPU and on a single NVIDIA H100 with vLLM. Both ran in BF16 with the same plugin, flags, images, prompt and load generator.

**Site:** https://ykirpichev.github.io/tpu-vs-h100-llm-bench/ walks through the setup, the method, the results and the lessons.

## Results

| | TPU v6e-4, BF16 | 1x H100, BF16 | 1x H100, FP8 (reference) |
| --- | --- | --- | --- |
| Peak output throughput | **828 tok/s** at concurrency 64 | 431 tok/s at concurrency 32 | 953 tok/s at concurrency 128 |
| Time to first token, p50, concurrency 64 | 2.0 s | 12.3 s | 1.8 s |
| Price per hour | $2.68 Spot | $3.95 (GPU only) | $3.95 (GPU only) |
| Cost per 1M output tokens | **$0.90** | $2.54 | $1.15 |
| Structured fields matching H100 BF16 | **92.9%** | reference | 73.8% |

The v6e-4 has 128 GB of HBM, so with 65 GB of weights its KV cache holds about 120 concurrent requests. One H100 holds about 24 in BF16 and queues the rest, so its throughput stops rising after concurrency 32.

Getting capacity was harder than getting the software to work. Three Spot TPU VMs were preempted within 16 minutes, and on-demand v6e-4 was unavailable in every zone we tried. A GKE Spot node pool in `us-east1-d` came up in about 8 minutes and ran the full sweep without being preempted. The TPU time for the whole exercise cost about $3.40.

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

The `Deploy site` workflow builds `site/` and publishes it to GitHub Pages on every push to `main`.

## Caveats

- There was one run per backend, with one workload shape: a single image, 1,457 prompt tokens and 150 output tokens.
- Quality is measured as agreement with H100 BF16, not accuracy against ground truth, and only covers the first 150 tokens of each report.
- The comparison is a four-chip TPU slice against one GPU, so cost per token is the fairer headline than raw speed.
- Prices are list prices on Nov 5, 2026.

Test images come from Argoverse 2 (CC BY-NC-SA 4.0). The model is [nvidia/Cosmos3-Super](https://huggingface.co/nvidia/Cosmos3-Super) (OpenMDW-1.1).
