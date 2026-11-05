#!/bin/bash
# Resumable GKE driver: bash drive_gke_resumable.sh <kube-context> <label> [model-profile]
#   model-profile: cosmos3 (default) or qwen38, from models/<profile>.sh in the staged kit.
# Runs one concurrency level at a time and copies each result off the pod, so a Spot
# preemption only loses the level in flight. On pod loss it re-creates the pod and resumes.
set -u
CTX=$1; LABEL=$2; PROFILE=${3:-cosmos3}
KIT=${KIT:-/tmp/bench}
TPU_IMAGE=${TPU_IMAGE:-vllm/vllm-torchtpu:v0.32.0}
LEVELS=${LEVELS:-"1 8 16 32 64 128"}
MAX_NUM_SEQS=${MAX_NUM_SEQS:-128}
MAX_BATCHED=${MAX_BATCHED:-4096}
# shellcheck source=/dev/null
source "$KIT/models/$PROFILE.sh"
OUT=$KIT/out/$LABEL; mkdir -p "$OUT"
K="kubectl --context $CTX"
ex() { $K exec bench-tpu -- bash -lc "$1"; }
log() { echo "$(date -u +%T) $*" | tee -a "$OUT/driver.log"; }
pod_ok() { [ "$($K get pod bench-tpu -o jsonpath='{.status.phase}' 2>/dev/null)" = "Running" ]; }
ready() { ex "curl -s -m 5 localhost:8000/v1/models" 2>/dev/null | grep -q "$SERVED_NAME"; }

cat > "$KIT/serve.sh" <<EOF
#!/bin/bash
export VLLM_ENGINE_READY_TIMEOUT_S=7200 VLLM_XLA_CACHE_PATH=/dev/shm/xla_cache ${TPU_ENV:-}
cd /bench
exec vllm serve $MODEL_DIR --served-model-name $SERVED_NAME $MODEL_ARGS \\
  --generation-config vllm --tensor-parallel-size 4 --max-model-len 4096 \\
  --limit-mm-per-prompt '{"image": 1, "video": 0}' --no-enable-prefix-caching --mm-processor-cache-gb 0 \\
  --max-num-seqs $MAX_NUM_SEQS --max-num-batched-tokens $MAX_BATCHED --gpu-memory-utilization 0.90 \\
  --async-scheduling --port 8000 ${EXTRA_SERVE_ARGS:-}
EOF
printf '%s' "$EXTRA_BODY" > "$KIT/extra_body.json"

bring_up() {
  if ! pod_ok; then
    $K delete pod bench-tpu --ignore-not-found --wait=true >/dev/null 2>&1
    sed "s#TPU_IMAGE#$TPU_IMAGE#" "$KIT/k8s/tpu-pod.yaml" | $K apply -f - >/dev/null
    log "pod requested ($TPU_IMAGE)"
    until pod_ok; do sleep 20; done
    log "pod running on $($K get pod bench-tpu -o jsonpath='{.spec.nodeName}')"
  fi
  if ! ready; then
    tar -C "$KIT" --exclude out --exclude k8s --exclude images -cf - . | $K exec -i bench-tpu -- bash -c 'mkdir -p /bench && tar -C /bench -xf -' || return 1
    if [ "$INSTALL_PLUGIN" = 1 ]; then
      ex "pip install -q --no-deps /bench/pkgs/transformers-cosmos3 /bench/pkgs/vllm-cosmos3" >/dev/null 2>&1 || return 1
    fi
    ex "pip install -q aiohttp 'huggingface_hub[hf_transfer]'" >/dev/null 2>&1 || return 1
    t0=$(date +%s)
    ex "HF_HUB_ENABLE_HF_TRANSFER=1 python -c \"from huggingface_hub import snapshot_download; snapshot_download('$MODEL_REPO', local_dir='$MODEL_DIR', max_workers=32, allow_patterns=$ALLOW_PATTERNS)\"" >/dev/null 2>&1 || return 1
    log "weights downloaded in $(( $(date +%s) - t0 )) s"
    ex "nohup bash /bench/serve.sh < /dev/null > /bench/vllm_tpu.log 2>&1 & disown" < /dev/null &
    sleep 15; kill $! 2>/dev/null
    log "serve started"
    t0=$(date +%s)
    until ready; do
      pod_ok || return 1
      if ex "grep -qE 'Traceback|EngineCore failed' /bench/vllm_tpu.log" 2>/dev/null; then
        sleep 10; ex "tail -120 /bench/vllm_tpu.log" > "$OUT/vllm_fail.log"; log "vllm failed, see vllm_fail.log"; exit 3
      fi
      sleep 30
    done
    log "server ready after $(( $(date +%s) - t0 )) s"
    $K cp bench-tpu:/bench/vllm_tpu.log "$OUT/vllm_tpu_startup.log" >/dev/null 2>&1
  fi
}

for c in $LEVELS; do
  [ -s "$OUT/level_$c.json" ] && continue
  until bring_up; do log "bring-up interrupted, retrying"; sleep 20; done
  log "level $c start"
  if ex "cd /bench && python bench_client.py --images /bench/img576 --prompt /bench/prompt.txt --concurrency $c --rounds 3 --label $LABEL --extra-body \"\$(cat /bench/extra_body.json)\" --out /bench/level_$c.json" > "$OUT/level_$c.stdout" 2>&1 \
     && $K cp bench-tpu:/bench/level_$c.json "$OUT/level_$c.json" >/dev/null 2>&1 && [ -s "$OUT/level_$c.json" ]; then
    log "level $c done: $(tail -1 "$OUT/level_$c.stdout" | cut -c1-200)"
  else
    log "level $c lost (pod state: $($K get pod bench-tpu -o jsonpath='{.status.phase}' 2>/dev/null))"
    rm -f "$OUT/level_$c.json"
    exec bash "$0" "$@"
  fi
done

python3 - "$OUT" "$LABEL" <<'EOF'
import json, sys, glob, os
out, label = sys.argv[1], sys.argv[2]
rep = {"backend": label, "levels": [], "samples": {}}
for f in sorted(glob.glob(os.path.join(out, "level_*.json")), key=lambda p: int(p.split("_")[-1][:-5])):
    d = json.load(open(f))
    rep["model"] = d.get("model"); rep["n_images"] = d.get("n_images"); rep["extra_body"] = d.get("extra_body")
    rep["levels"] += d["levels"]
    if d.get("samples"):
        rep["samples"] = d["samples"]
json.dump(rep, open(os.path.join(out, f"result_{label}.json"), "w"), indent=1)
print("merged", [(l["concurrency"], round(l["out_tok_per_s"], 1)) for l in rep["levels"]])
EOF
$K cp bench-tpu:/bench/vllm_tpu.log "$OUT/vllm_tpu.log" >/dev/null 2>&1
log "all levels done"
