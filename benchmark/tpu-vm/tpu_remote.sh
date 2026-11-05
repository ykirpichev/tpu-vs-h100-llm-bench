#!/bin/bash
# Runs on the TPU VM. Usage: bash tpu_remote.sh <stage>
#   setup  : pull image, start container, install Cosmos3 plugin, download weights to /dev/shm
#   serve  : start vllm serve (TP=4) in the background
#   bench  : run the sweep client inside the container
set -euo pipefail
IMAGE=${IMAGE:-vllm/vllm-torchtpu:v0.32.0}
# vllm-torchtpu applies its Qwen3-VL TPU patches when the model path contains "qwen3vl".
MODEL_DIR=/dev/shm/cosmos3-super-qwen3vl
MAX_NUM_SEQS=${MAX_NUM_SEQS:-128}
MAX_BATCHED=${MAX_BATCHED:-4096}

case "$1" in
setup)
  sudo docker pull -q "$IMAGE"
  sudo docker rm -f vt >/dev/null 2>&1 || true
  sudo docker run -d --name vt --privileged --net host --shm-size 16g \
    -v /dev/shm:/dev/shm -v "$HOME/bench:/bench" -v "$HOME/xla_cache:/xla_cache" \
    --entrypoint sleep "$IMAGE" infinity
  sudo docker exec vt bash -lc "pip install -q --no-deps /bench/pkgs/transformers-cosmos3 /bench/pkgs/vllm-cosmos3 && pip install -q aiohttp 'huggingface_hub[hf_transfer]' && \
    python -c 'import vllm,vllm_torchtpu,torch_tpu;print(vllm.__version__, torch_tpu.__version__ if hasattr(torch_tpu,\"__version__\") else \"\")'"
  sudo docker exec -e HF_HUB_ENABLE_HF_TRANSFER=1 vt python -c "
import time; from huggingface_hub import snapshot_download; t=time.time()
snapshot_download('nvidia/Cosmos3-Super', local_dir='$MODEL_DIR', max_workers=32,
  allow_patterns=['*.json','*.txt','*.jinja','transformer/*','vision_encoder/*','text_tokenizer/*'])
print('download_s', round(time.time()-t,1))"
  du -sh "$MODEL_DIR"
  ;;
serve)
  sudo docker exec -d -e VLLM_XLA_CACHE_PATH=/xla_cache -e VLLM_ENGINE_READY_TIMEOUT_S=7200 vt bash -lc "
    vllm serve $MODEL_DIR --served-model-name cosmos3-super-reasoner \
      --hf-overrides '{\"architectures\": [\"Cosmos3ReasonerForConditionalGeneration\"]}' \
      --generation-config vllm --tensor-parallel-size 4 --max-model-len 4096 \
      --limit-mm-per-prompt '{\"image\": 1, \"video\": 0}' --no-enable-prefix-caching --mm-processor-cache-gb 0 \
      --max-num-seqs $MAX_NUM_SEQS --max-num-batched-tokens $MAX_BATCHED --gpu-memory-utilization 0.90 \
      --async-scheduling --port 8000 ${EXTRA_ARGS:-} > /bench/vllm_tpu.log 2>&1"
  echo started
  ;;
bench)
  sudo docker exec vt python /bench/bench_client.py --images /bench/img576 --prompt /bench/prompt.txt \
    --concurrency "${CONC:-1,8,16,32,64,128}" --rounds "${ROUNDS:-3}" --label "${LABEL:-v6e-4}" --out "/bench/${OUT:-result_tpu.json}"
  ;;
esac
