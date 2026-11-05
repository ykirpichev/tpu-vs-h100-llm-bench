"""Closed-loop concurrency sweep against an OpenAI-compatible vLLM server.

Same client, images, prompt, and decoding settings on every backend.
Each concurrency level gets an unscored warmup pass first.
"""

import argparse
import asyncio
import base64
import glob
import json
import os
import statistics
import time

import aiohttp

MAX_TOKENS = 150


def load_inputs(image_dir, prompt_path):
    prompt = open(prompt_path).read()
    images = []
    for f in sorted(glob.glob(os.path.join(image_dir, "*.jpg"))):
        b64 = base64.b64encode(open(f, "rb").read()).decode()
        images.append((os.path.basename(f), f"data:image/jpeg;base64,{b64}"))
    return prompt, images


def body(model, prompt, image_url, extra=None):
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "max_tokens": MAX_TOKENS,
        "min_tokens": MAX_TOKENS,
        "temperature": 0.0,
        "seed": 0,
        "stream": True,
        "stream_options": {"include_usage": True},
        **(extra or {}),
    }


async def one(session, url, payload):
    t0 = time.perf_counter()
    ttft = None
    text = []
    usage = None
    async with session.post(url, json=payload) as r:
        if r.status != 200:
            return {"error": f"HTTP {r.status}: {(await r.text())[:300]}"}
        async for raw in r.content:
            line = raw.decode().strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            chunk = json.loads(data)
            if chunk.get("usage"):
                usage = chunk["usage"]
            for ch in chunk.get("choices", []):
                delta = ch.get("delta", {})
                piece = delta.get("content") or delta.get("reasoning_content") or delta.get("reasoning")
                if piece:
                    if ttft is None:
                        ttft = time.perf_counter() - t0
                    text.append(piece)
    t1 = time.perf_counter()
    n_out = usage["completion_tokens"] if usage else None
    return {
        "start": t0,
        "end": t1,
        "e2e": t1 - t0,
        "ttft": ttft,
        "prompt_tokens": usage["prompt_tokens"] if usage else None,
        "completion_tokens": n_out,
        "tpot": (t1 - t0 - ttft) / (n_out - 1) if ttft is not None and n_out and n_out > 1 else None,
        "text": "".join(text),
    }


async def run_level(url, model, prompt, images, conc, n_req, extra=None):
    queue = list(range(n_req))
    results = []
    timeout = aiohttp.ClientTimeout(total=3600)
    async with aiohttp.ClientSession(timeout=timeout, connector=aiohttp.TCPConnector(limit=0)) as s:

        async def worker():
            while queue:
                i = queue.pop(0)
                name, img = images[i % len(images)]
                res = await one(s, url, body(model, prompt, img, extra))
                res["image"] = name
                results.append(res)

        t0 = time.perf_counter()
        await asyncio.gather(*[worker() for _ in range(conc)])
        wall = time.perf_counter() - t0
    return results, wall


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def summarize(results, wall, conc):
    ok = [r for r in results if "error" not in r and r["ttft"] is not None]
    errs = [r["error"] for r in results if "error" in r]
    out_tok = sum(r["completion_tokens"] for r in ok)
    ttft = [r["ttft"] for r in ok]
    tpot = [r["tpot"] for r in ok if r["tpot"] is not None]
    return {
        "concurrency": conc,
        "requests": len(results),
        "ok": len(ok),
        "errors": len(errs),
        "error_sample": errs[:3],
        "wall_s": wall,
        "req_per_s": len(ok) / wall,
        "out_tok_per_s": out_tok / wall,
        "mean_prompt_tokens": statistics.mean(r["prompt_tokens"] for r in ok) if ok else None,
        "mean_completion_tokens": out_tok / len(ok) if ok else None,
        "ttft_mean_s": statistics.mean(ttft) if ttft else None,
        "ttft_p50_s": pct(ttft, 50) if ttft else None,
        "ttft_p99_s": pct(ttft, 99) if ttft else None,
        "tpot_mean_ms": 1000 * statistics.mean(tpot) if tpot else None,
        "tpot_p50_ms": 1000 * pct(tpot, 50) if tpot else None,
        "tpot_p99_ms": 1000 * pct(tpot, 99) if tpot else None,
    }


async def wait_ready(base, timeout_s):
    t0 = time.time()
    async with aiohttp.ClientSession() as s:
        while time.time() - t0 < timeout_s:
            try:
                async with s.get(base + "/v1/models") as r:
                    if r.status == 200:
                        return (await r.json())["data"][0]["id"]
            except Exception:
                pass
            await asyncio.sleep(5)
    raise TimeoutError("server not ready")


async def main_async(a):
    prompt, images = load_inputs(a.images, a.prompt)
    model = await wait_ready(a.base, a.ready_timeout)
    url = a.base + "/v1/chat/completions"
    extra = json.loads(a.extra_body) if a.extra_body else None
    report = {"backend": a.label, "model": model, "n_images": len(images), "extra_body": extra, "levels": [], "samples": {}}
    for conc in [int(c) for c in a.concurrency.split(",")]:
        n_req = max(a.min_requests, a.rounds * conc)
        await run_level(url, model, prompt, images, conc, conc, extra)  # unscored warmup
        res, wall = await run_level(url, model, prompt, images, conc, n_req, extra)
        summ = summarize(res, wall, conc)
        print(json.dumps(summ), flush=True)
        report["levels"].append(summ)
        if conc == 1:
            report["samples"] = {r["image"]: r["text"] for r in res if "text" in r}
        json.dump(report, open(a.out, "w"), indent=1)
        if summ["errors"] > 0.05 * summ["requests"]:
            print("stopping sweep: error rate above 5%", flush=True)
            break
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://127.0.0.1:8000")
    p.add_argument("--images", required=True)
    p.add_argument("--prompt", required=True)
    p.add_argument("--concurrency", default="1,8,16,32,64,128")
    p.add_argument("--rounds", type=int, default=3)
    p.add_argument("--min-requests", type=int, default=24)
    p.add_argument("--label", default="backend")
    p.add_argument("--out", default="result.json")
    p.add_argument("--ready-timeout", type=int, default=3600)
    p.add_argument("--extra-body", default=None, help='JSON merged into every request, e.g. {"chat_template_kwargs": {"enable_thinking": false}}')
    a = p.parse_args()
    asyncio.run(main_async(a))


if __name__ == "__main__":
    main()
