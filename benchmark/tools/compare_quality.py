"""Compare greedy outputs (the `samples` field) between two bench_client result files."""

import difflib
import json
import re
import sys


def fields(text):
    out = {}
    for line in text.splitlines():
        m = re.match(r"\s*-\s*([^:]{2,60}):\s*(.+)", line)
        if m:
            out[m.group(1).strip().lower()] = m.group(2).strip().lower().rstrip(".")
    return out


def compare(ref_path, cand_path):
    ref = json.load(open(ref_path))["samples"]
    cand = json.load(open(cand_path))["samples"]
    keys = sorted(set(ref) & set(cand))
    exact = sim = 0
    f_total = f_same = 0
    prefix = []
    for k in keys:
        a, b = ref[k], cand[k]
        exact += a == b
        sim += difflib.SequenceMatcher(None, a, b).ratio()
        n = 0
        while n < min(len(a), len(b)) and a[n] == b[n]:
            n += 1
        prefix.append(n / max(1, len(a)))
        fa, fb = fields(a), fields(b)
        for key in set(fa) & set(fb):
            f_total += 1
            f_same += fa[key] == fb[key]
    return {
        "ref": ref_path,
        "cand": cand_path,
        "images": len(keys),
        "exact_match": f"{exact}/{len(keys)}",
        "mean_char_similarity": round(sim / len(keys), 3),
        "mean_identical_prefix_frac": round(sum(prefix) / len(prefix), 3),
        "field_agreement": f"{f_same}/{f_total} ({100 * f_same / max(1, f_total):.1f}%)",
    }


if __name__ == "__main__":
    ref = sys.argv[1]
    for cand in sys.argv[2:]:
        print(json.dumps(compare(ref, cand)))
