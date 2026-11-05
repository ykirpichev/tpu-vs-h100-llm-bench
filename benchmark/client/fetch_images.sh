#!/bin/bash
# One ring_front_center frame (middle of each log) from the first 64 Argoverse 2 sensor val logs,
# resized to 576x768. Public S3, no signup. Dataset license: CC BY-NC-SA 4.0.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p images img576
aws s3 ls --no-sign-request s3://argoverse/datasets/av2/sensor/val/ | awk '{print $2}' | head -64 > logs.txt
i=0
while read -r l; do
  l=${l%/}; p="s3://argoverse/datasets/av2/sensor/val/$l/sensors/cameras/ring_front_center/"
  mapfile -t jp < <(aws s3 ls --no-sign-request "$p" | awk '{print $4}' | grep '\.jpg$' | sort)
  f=${jp[$(( ${#jp[@]} / 2 ))]}
  aws s3 cp --no-sign-request --quiet "$p$f" "images/$(printf %03d $i)_${l:0:8}_$f"
  i=$((i+1))
done < logs.txt
python3 -c "
from PIL import Image;import glob,os
for f in sorted(glob.glob('images/*.jpg')):
    Image.open(f).convert('RGB').resize((576,768),Image.BICUBIC).save('img576/'+os.path.basename(f),quality=90)"
