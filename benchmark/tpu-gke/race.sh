#!/bin/bash
# Waits for a TPU node on either the Flex-start (us-central1) or Spot (us-east1-d) cluster,
# deletes the losing TPU pool, then runs the resumable benchmark on the winner.
set -u
P=${PROJECT:?set PROJECT to your GCP project id}
PROFILE=${PROFILE:-cosmos3}; LABEL=${LABEL:-v6e-4-bf16}
FLEX=gke_${P}_us-central1-b_cosmos-flex
SPOT=gke_${P}_us-east1-d_cosmos-spot
log() { echo "$(date -u +%T) $*"; }
tpu_ready() { kubectl --context "$1" get nodes -l cloud.google.com/gke-tpu-accelerator=tpu-v6e-slice -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True; }

until gcloud container clusters describe cosmos-spot --project $P --zone us-east1-d --format='value(status)' 2>/dev/null | grep -q RUNNING; do
  tpu_ready "$FLEX" && break
  sleep 20
done
gcloud container clusters get-credentials cosmos-spot --project $P --zone us-east1-d >/dev/null 2>&1
gcloud container clusters get-credentials cosmos-flex --project $P --zone us-central1-b >/dev/null 2>&1

while true; do
  if tpu_ready "$FLEX"; then WIN=flex; break; fi
  if tpu_ready "$SPOT"; then WIN=spot; break; fi
  sleep 20
done
log "winner: $WIN"
kill_cluster() {
  ( until ! gcloud container clusters describe "$1" --project $P --zone "$2" >/dev/null 2>&1; do
      gcloud container clusters delete "$1" --project $P --zone "$2" --quiet --async >/dev/null 2>&1; sleep 30
    done; log "cluster $1 gone" ) &
}
if [ "$WIN" = flex ]; then
  kubectl --context "$SPOT" delete pod bench-tpu --ignore-not-found >/dev/null 2>&1
  kill_cluster cosmos-spot us-east1-d
  bash /tmp/bench/k8s/drive_gke_resumable.sh "$FLEX" "$LABEL" "$PROFILE"
else
  kubectl --context "$FLEX" delete pod bench-tpu --ignore-not-found >/dev/null 2>&1
  kill_cluster cosmos-flex us-central1-b
  bash /tmp/bench/k8s/drive_gke_resumable.sh "$SPOT" "$LABEL" "$PROFILE"
fi
