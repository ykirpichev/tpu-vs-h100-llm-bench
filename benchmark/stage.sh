#!/bin/bash
# Assembles the flat kit the drivers expect at /tmp/bench:
#   /tmp/bench/{bench_client.py,prompt.txt,img576/,pkgs/,models/,tpu_remote.sh,modal_app.py}
#   /tmp/bench/k8s/{tpu-pod.yaml,drive_gke_resumable.sh,race.sh}
# Usage: bash benchmark/stage.sh   (downloads the 64 test images on first run; needs the aws CLI and Pillow)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DEST=${DEST:-/tmp/bench}
mkdir -p "$DEST/k8s"
cp "$HERE"/client/{bench_client.py,prompt.txt,image-list.txt,fetch_images.sh} "$DEST/"
cp -r "$HERE/pkgs" "$DEST/"
cp "$HERE"/tpu-vm/tpu_remote.sh "$HERE"/h100-modal/modal_app.py "$DEST/"
cp "$HERE"/tpu-gke/{tpu-pod.yaml,drive_gke_resumable.sh,race.sh} "$DEST/k8s/"
cp -r "$HERE/models" "$DEST/"
if [ "$(ls "$DEST/img576" 2>/dev/null | wc -l)" -lt 64 ]; then
  (cd "$DEST" && bash fetch_images.sh)
fi
echo "kit staged in $DEST"
