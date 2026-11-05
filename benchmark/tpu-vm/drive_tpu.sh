#!/bin/bash
# Local driver: bash drive_tpu.sh <tpu-name> <zone> <label>
# Copies the kit, runs setup+serve, waits for the server, runs the sweep, and pulls results every minute.
set -u
NAME=$1; ZONE=$2; LABEL=$3
O="--project ${PROJECT:?set PROJECT to your GCP project id} --zone $ZONE --quiet"
OUT=/tmp/bench/out/$LABEL; mkdir -p "$OUT"
ssh_() { timeout 120 gcloud compute tpus tpu-vm ssh "$NAME" $O --command "$1" 2>&1 | grep -v -E '^(SSH:|Using ssh)'; }
state() { gcloud compute tpus tpu-vm describe "$NAME" $O --format='value(state)' 2>/dev/null; }
log() { echo "$(date -u +%T) $*"; }

cd /tmp && gcloud compute tpus tpu-vm scp --recurse bench "$NAME":~/ $O >/dev/null 2>&1 || { log "scp failed"; exit 1; }
ssh_ 'mkdir -p ~/xla_cache; tmux new-session -d -s bench "cd ~/bench && bash tpu_remote.sh setup > ~/bench/setup.log 2>&1 && bash tpu_remote.sh serve >> ~/bench/setup.log 2>&1; echo CHAIN_EXIT \$? >> ~/bench/setup.log"'
log "setup started"

while true; do
  sleep 30
  [ "$(state)" != "READY" ] && { log "TPU state $(state)"; exit 2; }
  r=$(ssh_ 'curl -s -m 5 localhost:8000/v1/models | head -c 60; grep -c Traceback ~/bench/vllm_tpu.log 2>/dev/null')
  echo "$r" | grep -q cosmos3 && break
  echo "$r" | grep -qE '^[1-9]' && { log "traceback in vllm log"; ssh_ 'tail -40 ~/bench/vllm_tpu.log' > "$OUT/vllm_fail.log"; exit 3; }
done
log "server ready"
ssh_ "tmux new-session -d -s run 'cd ~/bench && CONC=1,8,16,32,64,128 LABEL=$LABEL OUT=result_$LABEL.json bash tpu_remote.sh bench > ~/bench/bench.log 2>&1; echo BENCH_EXIT \$? >> ~/bench/bench.log'"
log "bench started"

while true; do
  sleep 60
  [ "$(state)" != "READY" ] && { log "TPU state $(state) during bench"; exit 2; }
  timeout 120 gcloud compute tpus tpu-vm scp "$NAME":~/bench/result_$LABEL.json "$NAME":~/bench/bench.log "$OUT/" $O >/dev/null 2>&1
  tail -1 "$OUT/bench.log" 2>/dev/null | cut -c1-160
  grep -q BENCH_EXIT "$OUT/bench.log" 2>/dev/null && break
done
timeout 120 gcloud compute tpus tpu-vm scp "$NAME":~/bench/vllm_tpu.log "$OUT/" $O >/dev/null 2>&1
log "bench done"
