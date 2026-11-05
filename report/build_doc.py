"""Build the TPU vs H100 summary as a styled .docx (imported into Google Docs).

Usage: python3 report/build_doc.py [out_dir]   (default /tmp/report)
"""
import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "benchmark", "results")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/report"
os.makedirs(OUT, exist_ok=True)

BLUE = "1A73E8"
NAVY = "0B3D91"
GREEN = "5B8F00"
GREY = "9CA3AF"
INK = "202124"
MUTED = "5F6368"
LINE = "DADCE0"
TINT_BLUE = "E8F0FE"
TINT_GREEN = "E6F4EA"
TINT_RED = "FCE8E6"
TINT_AMBER = "FEF7E0"
ZEBRA = "F8F9FA"
FONT = "Arial"
HEAD_FONT = "Roboto"


def load(path):
    with open(os.path.join(RES, path)) as f:
        return {l["concurrency"]: l for l in json.load(f)["levels"]}


tpu = load("cosmos3/result_v6e-4-bf16.json")
h100 = load("cosmos3/result_h100_bf16.json")
fp8 = load("cosmos3/result_h100_fp8.json")
qwen_tpu = load("qwen38/result_qwen38-v6e-4-bf16.json")


def peak(levels):
    return max(l["out_tok_per_s"] for l in levels.values())


def per_m(price_h, tok_s):
    return price_h / (tok_s * 3600) * 1e6


# ---------- charts ----------
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.edgecolor": "#BDC1C6",
    "axes.labelcolor": "#3C4043",
    "xtick.color": "#5F6368",
    "ytick.color": "#5F6368",
    "axes.grid": True,
    "grid.color": "#EEF0F2",
    "grid.linewidth": 0.8,
})


def series(levels):
    xs = sorted(levels)
    return xs, [levels[x]["out_tok_per_s"] for x in xs]


def chart_throughput(path):
    fig, ax = plt.subplots(figsize=(4.6, 2.9), dpi=170)
    for lv, label, color, style in [
        (tpu, "TPU v6e-4 · BF16", "#" + BLUE, "-"),
        (h100, "H100 · BF16", "#" + GREEN, "-"),
        (fp8, "H100 · FP8 (reference)", "#" + GREY, "--"),
    ]:
        xs, ys = series(lv)
        ax.plot(xs, ys, style, color=color, lw=2.2, marker="o", ms=4, label=label)
    ax.set_xscale("log", base=2)
    ax.set_xticks([1, 8, 16, 32, 64, 128, 256])
    ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
    ax.set_xlabel("Concurrent requests")
    ax.set_ylabel("Output tokens / s")
    ax.set_ylim(0, 1050)
    ax.annotate("828", (64, tpu[64]["out_tok_per_s"]), xytext=(6, -13), textcoords="offset points",
                color="#" + BLUE, fontweight="bold", ha="left")
    ax.annotate("431", (32, h100[32]["out_tok_per_s"]), xytext=(0, -14), textcoords="offset points",
                color="#" + GREEN, fontweight="bold", ha="center")
    ax.legend(frameon=False, loc="upper left", fontsize=8)
    ax.set_title("Throughput vs load (Cosmos3-Super)", loc="left", fontsize=10, fontweight="bold", color="#202124")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_cost(path):
    rows = [
        ("v6e-4 Spot\n(BF16, as run)", per_m(2.684, peak(tpu)), "#" + BLUE),
        ("H100 FP8\n(GPU only, ref)", per_m(3.949, peak(fp8)), "#" + GREY),
        ("H100 BF16\n(GPU only)", per_m(3.949, peak(h100)), "#" + GREEN),
        ("v6e-4\non-demand", per_m(10.80, peak(tpu)), "#8AB4F8"),
    ]
    fig, ax = plt.subplots(figsize=(4.6, 2.9), dpi=170)
    labels = [r[0] for r in rows]
    vals = [r[1] for r in rows]
    bars = ax.barh(labels, vals, color=[r[2] for r in rows], height=0.6)
    ax.invert_yaxis()
    for b, v in zip(bars, vals):
        ax.text(v + 0.06, b.get_y() + b.get_height() / 2, f"${v:.2f}", va="center", fontweight="bold", color="#202124")
    ax.set_xlim(0, max(vals) * 1.25)
    ax.set_xlabel("USD per 1M output tokens (at peak throughput)")
    ax.grid(axis="y", visible=False)
    ax.set_title("Cost per million output tokens", loc="left", fontsize=10, fontweight="bold", color="#202124")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def quantize(path):
    from PIL import Image

    Image.open(path).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(path, optimize=True)


thr_png = os.path.join(OUT, "chart_throughput.png")
cost_png = os.path.join(OUT, "chart_cost.png")
chart_throughput(thr_png)
chart_cost(cost_png)
quantize(thr_png)
quantize(cost_png)


# ---------- docx helpers ----------
def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def cell_margins(cell, top=70, bottom=70, left=110, right=110):
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("start", left), ("end", right),
                      ("left", left), ("right", right)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tcPr.append(mar)


def borders(table, color=LINE, size=4, inside=True, outer=True):
    tblPr = table._tbl.tblPr
    b = OxmlElement("w:tblBorders")
    edges = []
    if outer:
        edges += ["top", "left", "bottom", "right"]
    if inside:
        edges += ["insideH", "insideV"]
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        if edge in edges:
            el.set(qn("w:val"), "single")
            el.set(qn("w:sz"), str(size))
            el.set(qn("w:color"), color)
        else:
            el.set(qn("w:val"), "nil")
        b.append(el)
    tblPr.append(b)


def left_bar(cell, color, size=24):
    tcPr = cell._tc.get_or_add_tcPr()
    tb = OxmlElement("w:tcBorders")
    for edge in ("top", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        tb.append(el)
    el = OxmlElement("w:left")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(size))
    el.set(qn("w:color"), color)
    tb.append(el)
    tcPr.append(tb)


def set_widths(table, inches):
    table.autofit = False
    tblPr = table._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(int(sum(inches) * 1440)))
    tblW.set(qn("w:type"), "dxa")
    for col, w in zip(table._tbl.tblGrid.findall(qn("w:gridCol")), inches):
        col.set(qn("w:w"), str(int(w * 1440)))
    for row in table.rows:
        for cell, w in zip(row.cells, inches):
            cell.width = Inches(w)


def run(p, text, bold=False, size=None, color=INK, italic=False, font=FONT):
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    r.font.name = font
    r._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    if size:
        r.font.size = Pt(size)
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r


def para(container, space_before=0, space_after=4, align=None, line=1.15):
    p = container.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if align:
        p.alignment = align
    return p


def rich(p, text, size=10, color=INK):
    """Render **bold** segments."""
    parts = text.split("**")
    for i, part in enumerate(parts):
        if part:
            run(p, part, bold=(i % 2 == 1), size=size, color=color)
    return p


def clear_cell(cell):
    cell.paragraphs[0]._element.getparent().remove(cell.paragraphs[0]._element)


def heading(doc, number, text):
    p = para(doc, space_before=12, space_after=4)
    p.paragraph_format.keep_with_next = True
    run(p, f"{number}  ", bold=True, size=13, color=BLUE, font=HEAD_FONT)
    run(p, text, bold=True, size=13, color=NAVY, font=HEAD_FONT)
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "D2E3FC")
    bdr.append(bottom)
    pPr.append(bdr)
    return p


def bullets(container, items, size=10, color=INK):
    for item in items:
        p = container.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.15
        rich(p, item, size=size, color=color)


def note(doc, text):
    p = para(doc, space_before=3, space_after=6)
    rich(p, text, size=8.5, color=MUTED)


def data_table(doc, header, rows, widths, highlight=None, tints=None, align_right_from=1):
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t, color=LINE, size=4, outer=False, inside=True)
    for j, h in enumerate(header):
        c = t.rows[0].cells[j]
        shade(c, NAVY)
        cell_margins(c)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        if j >= align_right_from:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run(p, h, bold=True, size=9, color="FFFFFF")
    for i, row in enumerate(rows, start=1):
        fill = (tints or {}).get(i - 1) or (ZEBRA if i % 2 == 0 else "FFFFFF")
        bold_row = highlight is not None and (i - 1) in highlight
        for j, val in enumerate(row):
            c = t.rows[i].cells[j]
            shade(c, fill)
            cell_margins(c)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            if j >= align_right_from:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if "**" in val:
                rich(p, val, size=9)
            else:
                run(p, val, bold=bold_row and j == 0, size=9)
    set_widths(t, widths)
    return t


def callout(doc, title, items, fill, bar, title_color):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]
    shade(c, fill)
    left_bar(c, bar)
    cell_margins(c, top=110, bottom=90, left=200, right=160)
    clear_cell(c)
    p = para(c, space_after=3)
    run(p, title, bold=True, size=10.5, color=title_color, font=HEAD_FONT)
    for item in items:
        p = c.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.15
        rich(p, item, size=9.5)
    set_widths(t, [7.1])
    return t


# ---------- document ----------
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.left_margin = sec.right_margin = Inches(0.7)
sec.top_margin = Inches(0.6)
sec.bottom_margin = Inches(0.6)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal.font.size = Pt(10)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

# Banner
banner = doc.add_table(rows=1, cols=1)
banner.alignment = WD_TABLE_ALIGNMENT.CENTER
bc = banner.rows[0].cells[0]
shade(bc, NAVY)
cell_margins(bc, top=200, bottom=180, left=260, right=260)
clear_cell(bc)
p = para(bc, space_after=2)
run(p, "TPU BUILDERS  ·  INFERENCE BENCHMARK", bold=True, size=8.5, color="8AB4F8", font=HEAD_FONT)
p = para(bc, space_after=4, line=1.0)
run(p, "TPU v6e-4 vs NVIDIA H100", bold=True, size=24, color="FFFFFF", font=HEAD_FONT)
p = para(bc, space_after=6, line=1.0)
run(p, "Serving Cosmos3-Super on vLLM: throughput, cost and output quality", size=12.5, color="D2E3FC", font=HEAD_FONT)
p = para(bc, space_after=0)
run(p, "Project tpu-builders-509006   ·   Nov 4–5, 2026 (PST)   ·   Prepared for Yury Kirpichev",
    size=8.5, color="AECBFA")
set_widths(banner, [7.1])
para(doc, space_after=4)

# KPI cards
kpis = [
    (f"{peak(tpu) / peak(h100):.1f}×", "peak throughput", "828 vs 431 tok/s, BF16"),
    (f"${per_m(2.684, peak(tpu)):.2f}", "per 1M output tokens", f"vs ${per_m(3.949, peak(h100)):.2f} on H100 BF16"),
    ("93%", "field agreement", "TPU vs H100 BF16 outputs"),
    ("≈ $3.40", "total TPU spend", "Spot, incl. 3 preemptions"),
]
kt = doc.add_table(rows=1, cols=4)
kt.alignment = WD_TABLE_ALIGNMENT.CENTER
borders(kt, color="FFFFFF", size=18, outer=False, inside=True)
for c, (big, label, sub) in zip(kt.rows[0].cells, kpis):
    shade(c, TINT_BLUE)
    cell_margins(c, top=120, bottom=110, left=120, right=120)
    clear_cell(c)
    p = para(c, space_after=0, align=WD_ALIGN_PARAGRAPH.CENTER, line=1.0)
    run(p, big, bold=True, size=20, color=BLUE, font=HEAD_FONT)
    p = para(c, space_after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, label, bold=True, size=9, color=NAVY)
    p = para(c, space_after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, sub, size=8, color=MUTED)
set_widths(kt, [1.775] * 4)
para(doc, space_after=4)

callout(doc, "Bottom line", [
    "**A 4-chip TPU v6e beats one H100 at matched precision (BF16):** 1.9× the peak throughput, "
    "with lower latency at every concurrency level up to 32.",
    f"**It is far cheaper per token:** ${per_m(2.684, peak(tpu)):.2f} per 1M output tokens on Spot v6e-4 vs "
    f"${per_m(3.949, peak(h100)):.2f} on H100 BF16. Even H100 in FP8 (${per_m(3.949, peak(fp8)):.2f}) costs more.",
    "**Quality matches:** 93% of structured fields agree with H100 BF16, and 9 of 24 outputs are identical "
    "word for word. H100's own FP8 run agrees with its BF16 run on only 74%.",
    "**Capacity is the hard part, not the software.** Spot TPU VMs were preempted three times and on-demand "
    "v6e-4 was unavailable everywhere we tried. GKE Spot in us-east1-d held a node for the whole run.",
], TINT_BLUE, BLUE, NAVY)

# 1. Setup
heading(doc, "01", "What was tested")
data_table(doc, ["", "TPU side", "H100 side"], [
    ["Model", "nvidia/Cosmos3-Super Reasoner (≈33B params, ≈65 GB BF16) via NVIDIA's vllm-cosmos3 plugin", "Same"],
    ["Hardware", "TPU v6e-4: 4 chips, 128 GB HBM · GKE Spot, us-east1-d", "1× H100 80 GB on Modal"],
    ["Serving stack", "vllm/vllm-torchtpu:v0.32.0 · tensor parallel 4", "vllm/vllm-openai:v0.32.0"],
    ["Precision", "BF16 (v6e has no FP8 hardware; NVIDIA validates this model in BF16)", "BF16 · FP8 shown as reference"],
    ["Workload", "64 Argoverse 2 camera frames (576×768) + driving scene-report prompt, 1,457 prompt tokens. "
                 "Greedy, exactly 150 output tokens. Closed-loop sweep at 1–128 concurrent requests.", "Same client and inputs"],
], [1.15, 3.85, 2.1], align_right_from=99)

# 2. Results with charts
heading(doc, "02", "Throughput, latency and cost")
ct = doc.add_table(rows=1, cols=2)
ct.alignment = WD_TABLE_ALIGNMENT.CENTER
for c, img in zip(ct.rows[0].cells, (thr_png, cost_png)):
    clear_cell(c)
    cell_margins(c, top=0, bottom=0, left=40, right=40)
    p = para(c, space_after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
    p.add_run().add_picture(img, width=Inches(3.45))
set_widths(ct, [3.55, 3.55])

levels = [1, 16, 32, 64, 128]


def tok(lv, c, mark_peak=False):
    if c not in lv:
        return "–"
    v = lv[c]["out_tok_per_s"]
    s = f"{v:,.0f}"
    return f"**{s} (peak)**" if mark_peak and v == peak(lv) else s


rows = []
for c in levels:
    rows.append([
        str(c), tok(tpu, c, True), tok(h100, c, True), tok(fp8, c, True),
        f"{tpu[c]['ttft_p50_s']:.2f} s  /  {h100[c]['ttft_p50_s']:.2f} s",
    ])
para(doc, space_after=2)
data_table(doc, ["Concurrency", "v6e-4 BF16 tok/s", "H100 BF16 tok/s", "H100 FP8 tok/s (ref)",
                 "Median TTFT  v6e / H100 BF16"], rows, [1.0, 1.35, 1.35, 1.45, 1.95],
           tints={3: TINT_GREEN})
note(doc, "**Why the TPU keeps scaling:** its KV cache holds ≈200k tokens (≈120 requests in flight). One H100 in BF16 "
          "holds ≈24 and queues the rest, so its throughput flattens at 32 and time to first token climbs to 36 s at 128.")

cost_rows = [
    ["**v6e-4 Spot (as run)**", "$2.68", f"**${per_m(2.684, peak(tpu)):.2f}**"],
    ["v6e-4 Flex-start (queued, not preemptible)", "$5.40", f"${per_m(5.40, peak(tpu)):.2f}"],
    ["v6e-4 on-demand", "$10.80", f"${per_m(10.80, peak(tpu)):.2f}"],
    ["H100 BF16 (GPU only / as billed on Modal)", "$3.95 / $5.73",
     f"${per_m(3.949, peak(h100)):.2f} / ${per_m(5.73, peak(h100)):.2f}"],
    ["H100 FP8, GPU only (reference)", "$3.95", f"${per_m(3.949, peak(fp8)):.2f}"],
]
data_table(doc, ["Setup", "Per hour", "Per 1M output tokens"], cost_rows, [3.9, 1.5, 1.7], tints={0: TINT_GREEN})

# 3. Quality
heading(doc, "03", "Output quality")
data_table(doc, ["Agreement with H100 BF16 (24 images)", "Identical outputs", "Text similarity", "Fields that agree"], [
    ["**TPU v6e-4, BF16**", "**9 / 24**", "0.90", "**93%**  (237 / 255)"],
    ["H100, FP8 (reference)", "1 / 24", "0.80", "74%  (172 / 233)"],
], [2.8, 1.35, 1.25, 1.7], tints={0: TINT_GREEN})
note(doc, "Measures agreement between backends, not accuracy against ground truth. With a 150-token cap only the first "
          "three report sections are compared.")

# 4. Capacity
heading(doc, "04", "Getting TPU capacity: what worked")
data_table(doc, ["Route", "Outcome"], [
    ["GKE Spot, 1-chip v6e smoke test (Singapore, Virginia, us-east1-d)",
     "Singapore stocked out; Virginia TPU quota is 0. **us-east1-d passed** (≈682 TFLOPS bf16 matmul)."],
    ["Cloud TPU API, Spot v6e-4 (us-east1-d, us-central1-b)", "Preempted 3 times after 4–16 minutes."],
    ["On-demand v6e-4 (TPU API in 13 zones, GKE in 5)", "No capacity anywhere at the time."],
    ["GKE Flex-start pool (us-central1)", "Queued 35 minutes, no node. v6e Flex-start is documented only in us-east5 and asia-northeast1."],
    ["**GKE Spot v6e-4 (us-east1-d)**", "**Node ready in ≈8 minutes, never preempted.** All 774 requests succeeded."],
], [2.9, 4.2], align_right_from=99, tints={1: TINT_RED, 2: TINT_RED, 3: TINT_AMBER, 4: TINT_GREEN})

# 5. Qwen follow-up
heading(doc, "05", "Follow-up in progress: Qwen3.8-27B")
q = qwen_tpu
callout(doc, "Same harness, second model (Nov 5)", [
    f"**TPU v6e-4 sweep complete:** {q[1]['out_tok_per_s']:.0f} tok/s at concurrency 1, "
    f"{q[16]['out_tok_per_s']:.0f} at 16, peak **{peak(q):.0f} tok/s** at 128, with 0 errors. "
    "BF16 weights and BF16 KV cache (565,703-token cache); server ready in 431 s.",
    "Spot v6e-4 was unavailable in us-east1-d for an hour and was preempted twice in europe-west4-a, so the sweep "
    "ran on an on-demand v6e-4 (≈20 minutes, ≈$4–5 including the Spot attempts).",
    "**H100 side pending** Modal access; cost and quality comparison will be added once it runs.",
], TINT_AMBER, "F9AB00", "8A5300")

# 6. Spend + recommendations
heading(doc, "06", "Spend, cleanup and recommendations")
bullets(doc, [
    "**Cosmos run TPU spend ≈ $3.40:** ≈$1.55 for three preempted Spot VMs and ≈$1.85 for the GKE Spot node. "
    "GKE cluster fees fall under the free tier. Every cluster created for testing was deleted.",
    "**Still open:** cosmos-ct6e4-flex-useast5a, a pending Flex-start VM created outside this run. "
    "It bills ≈$5.40/h if it starts; delete it if no longer needed.",
    "**Default to GKE Spot in us-east1-d** for v6e-4, with the resumable driver that continues from the last "
    "finished concurrency level after a preemption.",
    "**Cache TorchTPU compilation** on a persistent disk or GCS: compiling is ≈6.5 of the ≈12 minutes of startup "
    "and repeats after every preemption.",
    "**For uninterruptible runs use Flex-start** in us-east5 or asia-northeast1 (≈$5.40/h for v6e-4).",
    "**Next:** uncapped outputs scored for accuracy, video inputs, and v6e-8 or Ironwood vs H100/B200 in FP8.",
], size=9.5)

p = para(doc, space_before=8, space_after=0)
run(p, "Source data, scripts and raw JSON: benchmark kit repo (benchmark/results/) and the project agent store "
       "(internal/cosmos3-tpu-run/, internal/cosmos3-bench/).", size=8, color=MUTED, italic=True)

out = os.path.join(OUT, "tpu-vs-h100-report.docx")
doc.save(out)
print(out)
