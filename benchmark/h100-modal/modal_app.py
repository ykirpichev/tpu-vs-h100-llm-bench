"""H100 side of the benchmark on Modal.

modal run modal_app.py --model cosmos3 --mode download
modal run modal_app.py --model cosmos3 --variant bf16      # or fp8
modal run modal_app.py --model qwen38 --mode download
modal run modal_app.py --model qwen38 --variant bf16
"""

import json
import os
import subprocess
import sys
import time

import modal

APP = "llm-h100-bench"
HERE = os.path.dirname(os.path.abspath(__file__))

PROFILES = {
    "cosmos3": {
        "repo": "nvidia/Cosmos3-Super",
        "dir": "/weights/Cosmos3-Super",
        "served": "cosmos3-super-reasoner",
        "patterns": ["*.json", "*.txt", "*.jinja", "transformer/*", "vision_encoder/*", "text_tokenizer/*"],
        "model_args": ["--hf-overrides", json.dumps({"architectures": ["Cosmos3ReasonerForConditionalGeneration"]})],
        "extra_body": None,
        "label": "h100",
    },
    "qwen38": {
        "repo": "Qwen/Qwen3.8-27B",
        "dir": "/weights/Qwen3.8-27B",
        "served": "qwen3.8-27b",
        "patterns": ["*.json", "*.txt", "*.jinja", "*.safetensors"],
        "model_args": [],
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
        "label": "qwen38-h100",
    },
}

vol = modal.Volume.from_name("llm-bench-weights", create_if_missing=True)
app = modal.App(APP)

dl_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub[hf_transfer]>=0.34")

gpu_image = (
    modal.Image.from_registry(
        "vllm/vllm-openai:v0.32.0",
        setup_dockerfile_commands=["RUN ln -sf $(command -v python3) /usr/local/bin/python || true"],
    )
    .entrypoint([])
    .add_local_dir(os.path.join(HERE, "pkgs"), "/pkgs", copy=True)
    .run_commands("pip install --no-deps /pkgs/transformers-cosmos3 /pkgs/vllm-cosmos3", "pip install aiohttp")
    .add_local_dir(HERE, "/bench", ignore=["images", "*.json", "*.log", "__pycache__", "logs.txt", "pkgs", "out", "results", "k8s"])
)


@app.function(image=dl_image, volumes={"/weights": vol}, timeout=3 * 3600, cpu=8, memory=16384)
def download(repo: str, local_dir: str, patterns: list[str]):
    from huggingface_hub import snapshot_download

    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    t0 = time.time()
    snapshot_download(repo, local_dir=local_dir, allow_patterns=patterns, max_workers=16)
    vol.commit()
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(local_dir) for f in fs)
    return {"seconds": time.time() - t0, "bytes": size}


@app.function(
    image=gpu_image,
    gpu="H100",
    volumes={"/weights": vol},
    timeout=3 * 3600,
    memory=131072,
    cpu=16,
)
def bench(model_dir: str, served: str, server_args: list[str], label: str, concurrency: str,
          extra_body: dict | None = None, rounds: int = 3):
    t0 = time.time()
    log = open("/tmp/vllm.log", "w")
    proc = subprocess.Popen(["vllm", "serve", model_dir, "--served-model-name", served, *server_args],
                            stdout=log, stderr=subprocess.STDOUT)
    try:
        import urllib.request

        while True:
            if proc.poll() is not None:
                raise RuntimeError("vllm exited:\n" + open("/tmp/vllm.log").read()[-6000:])
            try:
                urllib.request.urlopen("http://127.0.0.1:8000/v1/models", timeout=5)
                break
            except Exception:
                time.sleep(5)
            if time.time() - t0 > 5400:
                raise TimeoutError(open("/tmp/vllm.log").read()[-6000:])
        ready_s = time.time() - t0
        cmd = [sys.executable, "/bench/bench_client.py", "--images", "/bench/img576", "--prompt", "/bench/prompt.txt",
               "--concurrency", concurrency, "--rounds", str(rounds), "--label", label, "--out", "/tmp/result.json"]
        if extra_body:
            cmd += ["--extra-body", json.dumps(extra_body)]
        subprocess.run(cmd, check=True)
        res = json.load(open("/tmp/result.json"))
        res["server_ready_s"] = ready_s
        res["server_args"] = server_args
        res["vllm_log_tail"] = open("/tmp/vllm.log").read()[-8000:]
        res["nvidia_smi"] = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.used,memory.total", "--format=csv"],
                                           capture_output=True, text=True).stdout
        return res
    finally:
        proc.terminate()
        try:
            proc.wait(30)
        except Exception:
            proc.kill()


SHARED_ARGS = [
    "--generation-config", "vllm",
    "--max-model-len", "4096",
    "--limit-mm-per-prompt", json.dumps({"image": 1, "video": 0}),
    "--no-enable-prefix-caching",
    "--mm-processor-cache-gb", "0",
    "--async-scheduling",
    "--port", "8000",
]

VARIANTS = {
    "bf16": ["--gpu-memory-utilization", "0.95", "--max-num-seqs", "128", "--max-num-batched-tokens", "8192"],
    "fp8": ["--quantization", "fp8", "--gpu-memory-utilization", "0.95", "--max-num-seqs", "256",
            "--max-num-batched-tokens", "8192"],
}


@app.local_entrypoint()
def main(model: str = "cosmos3", mode: str = "bench", variant: str = "bf16",
         concurrency: str = "1,8,16,32,64,128", rounds: int = 3):
    p = PROFILES[model]
    if mode == "download":
        print(download.remote(p["repo"], p["dir"], p["patterns"]))
        return
    label = f"{p['label']}-{variant}"
    res = bench.remote(p["dir"], p["served"], p["model_args"] + SHARED_ARGS + VARIANTS[variant], label,
                       concurrency, p["extra_body"], rounds)
    out = f"result_{label}.json"
    json.dump(res, open(out, "w"), indent=1)
    for lvl in res["levels"]:
        print(json.dumps({k: lvl[k] for k in ("concurrency", "ok", "errors", "out_tok_per_s", "req_per_s", "ttft_p50_s", "tpot_p50_ms")}))
    print("ready_s", res["server_ready_s"], "->", out)
