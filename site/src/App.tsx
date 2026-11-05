import { useState, type ReactNode } from "react"
import { ArrowUpRight, Check, Copy, Cpu, DollarSign, Gauge, ShieldCheck } from "lucide-react"

import { CostChart, SweepChart, costRowsFor } from "@/components/charts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { REPO_URL } from "@/config"
import { results, type Example } from "@/data"
import { MODELS, type ModelInfo } from "@/models"

const NAV = [
  ["results", "Results"],
  ["setup", "Setup"],
  ["method", "Method"],
  ["capacity", "Getting a TPU"],
  ["reproduce", "Reproduce"],
  ["lessons", "Lessons"],
] as const

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-12 sm:py-16">
      <p className="text-sm font-medium tracking-wide text-blue-700 uppercase">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  )
}

function Code({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="overflow-hidden rounded-lg border bg-neutral-950 text-neutral-100">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
        <span>{title ?? "shell"}</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-neutral-100"
          onClick={() => {
            navigator.clipboard?.writeText(children).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Stat({ icon, value, label, detail }: { icon: ReactNode; value: string; label: string; detail: string }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function fmt(v: number | null, digits = 0) {
  return v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function ExampleViewer({ examples }: { examples: Example[] }) {
  const [i, setI] = useState(0)
  const ex = examples[Math.min(i, examples.length - 1)]
  if (!ex) return null
  const refLines = new Set(ex.h100.split("\n"))
  const panes: { title: string; text: string | null; color: string }[] = [
    { title: "H100, BF16 (reference)", text: ex.h100, color: "border-t-[#5b8f00]" },
    { title: "TPU v6e-4, BF16", text: ex.tpu, color: "border-t-[#1a73e8]" },
    ...(ex.fp8 ? [{ title: "H100, FP8", text: ex.fp8, color: "border-t-neutral-400" }] : []),
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Same image, same prompt, greedy decoding</CardTitle>
        <CardDescription>
          Lines that differ from the H100 BF16 output are highlighted. Outputs stop at 150 tokens by design.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {examples.map((e, idx) => (
            <Button key={e.file} size="sm" variant={idx === i ? "default" : "outline"} onClick={() => setI(idx)}>
              {e.tpu === e.h100 ? `Frame ${e.file.slice(0, 3)}: TPU identical to H100` : `Frame ${e.file.slice(0, 3)}: TPU differs`}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <figure className="space-y-2">
          <img
            src={`${import.meta.env.BASE_URL}examples/${ex.file}`}
            alt={`Argoverse 2 front-camera frame ${ex.source}`}
            className="w-full rounded-md border"
            loading="lazy"
          />
          <figcaption className="text-xs break-all text-muted-foreground">
            Argoverse 2 sensor val, ring_front_center, {ex.source}
          </figcaption>
        </figure>
        <div className={`grid gap-3 ${panes.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {panes.map((p) => (
            <div key={p.title} className={`rounded-md border border-t-4 ${p.color} bg-neutral-50`}>
              <p className="border-b px-3 py-2 text-xs font-medium">{p.title}</p>
              <div className="max-h-96 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-snug whitespace-pre-wrap">
                {(p.text ?? "").split("\n").map((line, n) => (
                  <div
                    key={n}
                    className={line && !refLines.has(line) && p.text !== ex.h100 ? "bg-amber-100 text-amber-950" : ""}
                  >
                    {line || "\u00a0"}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const timeline = [
  {
    when: "12:13 – 1:01 AM",
    what: "Three Spot TPU VMs through the Cloud TPU API (us-east1-d twice, us-central1-b)",
    outcome: "Each was preempted after 4 to 16 minutes. One reached a ready server first.",
    tone: "bad",
  },
  {
    when: "1:02 – 2:15 AM",
    what: "On-demand v6e-4: Cloud TPU API in 13 zones, then GKE in 5 zones",
    outcome: "No capacity, quota 0, or a permission error everywhere.",
    tone: "bad",
  },
  {
    when: "2:28 – 3:12 AM",
    what: "GKE Flex-start node pool in us-central1",
    outcome: "Queued with no node. Deleted once Spot won.",
    tone: "warn",
  },
  {
    when: "2:58 – 3:50 AM",
    what: "GKE Spot node pool, ct6e-standard-4t in us-east1-d",
    outcome: "Node Ready in about 8 minutes, never preempted. Full sweep ran, 774/774 requests OK.",
    tone: "good",
  },
] as const

function parsePct(s: string | undefined) {
  const m = s?.match(/\(([\d.]+)%\)/)
  return m ? Number(m[1]) : null
}

function ModelSwitch({ value, onChange }: { value: ModelInfo["id"]; onChange: (v: ModelInfo["id"]) => void }) {
  const ids = (Object.keys(MODELS) as ModelInfo["id"][]).filter((id) => results[id])
  return (
    <div className="inline-flex rounded-lg border bg-neutral-50 p-1" role="tablist" aria-label="Model">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === id ? "bg-white text-neutral-900 shadow-sm" : "text-muted-foreground hover:text-neutral-900"
          }`}
        >
          {MODELS[id].short}
        </button>
      ))}
    </div>
  )
}

const SPEND: Record<ModelInfo["id"], string> = { cosmos3: "≈ $3.40", qwen38: "QWEN_SPEND" }

export default function App() {
  const available = (Object.keys(MODELS) as ModelInfo["id"][]).filter((id) => results[id])
  const [modelId, setModelId] = useState<ModelInfo["id"]>(available.includes("qwen38") ? "qwen38" : "cosmos3")
  const model = MODELS[modelId]
  const data = results[modelId]
  const levels = data.levels
  const costRows = costRowsFor(levels)
  const peakTpu = Math.max(...levels.map((l) => l.tpu ?? 0))
  const peakH100 = Math.max(...levels.map((l) => l.h100 ?? 0))
  const peakFp8 = Math.max(0, ...levels.map((l) => l.h100fp8 ?? 0))
  const tpuSpot = costRows.find((r) => r.short === "v6e-4 Spot")
  const h100Gpu = costRows.find((r) => r.short === "H100 BF16")
  const agreeTpu = parsePct(data.quality.tpu.field_agreement)
  const agreeFp8 = parsePct(data.quality.fp8?.field_agreement)
  const peakAt = (k: "tpu" | "h100" | "h100fp8", v: number) => levels.find((l) => l[k] === v)?.concurrency

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2 font-semibold">
            <Cpu className="size-5 text-blue-700" />
            <span className="hidden sm:inline">TPU Builders</span>
            <span className="text-muted-foreground">/ TPU v6e vs H100</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="hover:text-neutral-900">
                {label}
              </a>
            ))}
          </nav>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <GithubMark className="size-4" />
              Source
            </Button>
          </a>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-12 pb-8 sm:pt-20">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Benchmark study</Badge>
            <Badge variant="secondary">Nov 4 – 5, 2026</Badge>
            <Badge variant="secondary">vLLM 0.32 · TorchTPU</Badge>
            <Badge variant="secondary">{available.length} models</Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Serving vision-language models on a TPU v6e-4, and how it compares with an H100
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-pretty text-muted-foreground">
            We ran the same models, the same vLLM server, the same images and prompt, and the same load generator on a
            4-chip Cloud TPU v6e and on a single NVIDIA H100, for two models with very different architectures: the dense
            Cosmos3-Super Reasoner and the hybrid linear-attention Qwen3.8-27B. This page explains the setup, how we kept
            the comparison fair, what we measured, and what we learned getting TPU capacity.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Showing results for</span>
            <ModelSwitch value={modelId} onChange={setModelId} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<Gauge className="size-4" />}
              label="Peak throughput, TPU vs H100"
              value={`${(peakTpu / peakH100).toFixed(1)}x`}
              detail={`${fmt(peakTpu)} vs ${fmt(peakH100)} output tok/s, both BF16`}
            />
            <Stat
              icon={<DollarSign className="size-4" />}
              label="Cost per 1M output tokens"
              value={tpuSpot ? `$${tpuSpot.perM.toFixed(2)}` : "–"}
              detail={`v6e-4 Spot, vs $${h100Gpu?.perM.toFixed(2)} on H100 (GPU only)`}
            />
            <Stat
              icon={<ShieldCheck className="size-4" />}
              label="Output agreement"
              value={agreeTpu != null ? `${Math.round(agreeTpu)}%` : "–"}
              detail={
                agreeFp8 != null
                  ? `of structured fields match H100 BF16; H100 FP8 manages ${Math.round(agreeFp8)}%`
                  : "of structured fields match H100 BF16"
              }
            />
            <Stat icon={<Cpu className="size-4" />} label="TPU spend for this model" value={SPEND[modelId]} detail="Spot v6e-4 time, all attempts" />
          </div>
        </section>

        <Separator />

        <Section id="results" eyebrow={`Results · ${model.short}`} title="Throughput and latency across a concurrency sweep">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-muted-foreground">
              Each point is a closed-loop run: <em>c</em> requests in flight at all times, each generating exactly 150
              tokens from a {data.promptTokens ? fmt(data.promptTokens) : "≈1,450"}-token image + text prompt. Throughput is
              total output tokens divided by wall-clock time.
            </p>
            <ModelSwitch value={modelId} onChange={setModelId} />
          </div>
          <Card>
            <CardContent>
              <Tabs defaultValue="throughput">
                <TabsList>
                  <TabsTrigger value="throughput">Throughput</TabsTrigger>
                  <TabsTrigger value="ttft">Time to first token</TabsTrigger>
                  <TabsTrigger value="tpot">Per-token latency</TabsTrigger>
                </TabsList>
                <TabsContent value="throughput" className="pt-4">
                  <SweepChart metric="throughput" levels={levels} />
                </TabsContent>
                <TabsContent value="ttft" className="pt-4">
                  <SweepChart metric="ttft" levels={levels} />
                </TabsContent>
                <TabsContent value="tpot" className="pt-4">
                  <SweepChart metric="tpot" levels={levels} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concurrency</TableHead>
                  <TableHead className="text-right">v6e-4 tok/s</TableHead>
                  <TableHead className="text-right">H100 BF16 tok/s</TableHead>
                  <TableHead className="text-right">H100 FP8 tok/s</TableHead>
                  <TableHead className="text-right">TTFT p50, v6e-4 / H100 BF16</TableHead>
                  <TableHead className="text-right">Per-token p50, v6e-4 / H100 BF16</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels
                  .filter((l) => l.tpu != null || l.h100 != null)
                  .map((l) => (
                    <TableRow key={l.concurrency}>
                      <TableCell className="font-medium">{l.concurrency}</TableCell>
                      <TableCell className={`text-right ${l.tpu === peakTpu ? "font-semibold text-blue-700" : ""}`}>
                        {fmt(l.tpu)}
                      </TableCell>
                      <TableCell className={`text-right ${l.h100 === peakH100 ? "font-semibold text-[#5b8f00]" : ""}`}>
                        {fmt(l.h100)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(l.h100fp8)}</TableCell>
                      <TableCell className="text-right">
                        {fmt(l.tpuTtft, 2)} s / {fmt(l.h100Ttft, 2)} s
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(l.tpuTpot, 1)} ms / {fmt(l.h100Tpot, 1)} ms
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Peaks: v6e-4 {fmt(peakTpu)} tok/s at concurrency {peakAt("tpu", peakTpu)}; H100 BF16 {fmt(peakH100)} tok/s at{" "}
            {peakAt("h100", peakH100)}
            {peakFp8 > 0 ? `; H100 FP8 ${fmt(peakFp8)} tok/s at ${peakAt("h100fp8", peakFp8)}` : ""}.
          </p>

          {(model.scaling.body.length > 0 || model.h100Edge.body.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {[model.scaling, model.h100Edge]
                .filter((c) => c.body.length > 0)
                .map((c) => (
                  <Card key={c.title}>
                    <CardHeader>
                      <CardTitle>{c.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      {c.body.map((b) => (
                        <p key={b}>{b}</p>
                      ))}
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}

          <h3 className="pt-6 text-xl font-semibold">Cost per million output tokens</h3>
          <p className="max-w-3xl text-muted-foreground">
            Hourly price divided by each setup's best measured throughput. Prices are list prices on the day of the run.
          </p>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardContent>
                <CostChart rows={costRows} />
              </CardContent>
            </Card>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setup</TableHead>
                    <TableHead className="text-right">Per hour</TableHead>
                    <TableHead className="text-right">Per 1M tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRows.map((r) => (
                    <TableRow key={r.setup}>
                      <TableCell className="whitespace-normal">{r.setup}</TableCell>
                      <TableCell className="text-right">${r.hourly.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">${r.perM.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <h3 className="pt-6 text-xl font-semibold">Output quality</h3>
          <p className="max-w-3xl text-muted-foreground">
            We compared the greedy outputs for {data.quality.tpu.images} frames against H100 BF16. "Field agreement"
            parses the <code className="rounded bg-neutral-100 px-1">- Field: value</code> lines of the scene report and
            checks whether both backends wrote the same value. This measures agreement between backends, not accuracy
            against ground truth.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compared with H100 BF16</TableHead>
                  <TableHead className="text-right">Identical outputs</TableHead>
                  <TableHead className="text-right">Character similarity</TableHead>
                  <TableHead className="text-right">Identical prefix</TableHead>
                  <TableHead className="text-right">Field agreement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "TPU v6e-4, BF16", q: data.quality.tpu, strong: true },
                  ...(data.quality.fp8 ? [{ name: "H100, FP8", q: data.quality.fp8, strong: false }] : []),
                ].map(({ name, q, strong }) => (
                  <TableRow key={name}>
                    <TableCell className={strong ? "font-medium" : ""}>{name}</TableCell>
                    <TableCell className={`text-right ${strong ? "font-semibold" : ""}`}>
                      {q.exact_match.replace("/", " / ")}
                    </TableCell>
                    <TableCell className="text-right">{q.mean_char_similarity.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{(q.mean_identical_prefix_frac * 100).toFixed(1)}%</TableCell>
                    <TableCell className={`text-right ${strong ? "font-semibold" : ""}`}>{q.field_agreement}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ExampleViewer key={modelId} examples={data.examples} />
        </Section>

        <Separator />

        <Section id="setup" eyebrow="Setup" title="Two serving stacks, two models">
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.values(MODELS) as ModelInfo[])
              .filter((m) => results[m.id])
              .map((m) => (
                <Card key={m.id}>
                  <CardHeader>
                    <CardTitle>
                      <a className="underline" href={`https://huggingface.co/${m.hf}`} target="_blank" rel="noreferrer">
                        {m.name}
                      </a>
                    </CardTitle>
                    <CardDescription>{m.summary}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Architecture</dt>
                      <dd>{m.architecture}</dd>
                      <dt className="text-muted-foreground">Weights</dt>
                      <dd>{m.weights}</dd>
                      <dt className="text-muted-foreground">Model flags</dt>
                      <dd className="break-all">
                        <code>{m.modelArgs || "none"}</code>
                      </dd>
                      <dt className="text-muted-foreground">Request</dt>
                      <dd className="break-all">
                        <code>{m.requestExtra ?? "default chat template"}</code>
                      </dd>
                      {m.plugin && (
                        <>
                          <dt className="text-muted-foreground">Plugin</dt>
                          <dd>{m.plugin}</dd>
                        </>
                      )}
                    </dl>
                  </CardContent>
                </Card>
              ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-t-4 border-t-[#1a73e8]">
              <CardHeader>
                <CardTitle>TPU side</CardTitle>
                <CardDescription>Google Kubernetes Engine, Spot</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Hardware</dt>
                  <dd>TPU v6e-4 (Trillium): 4 chips, 2x2 topology, 128 GB HBM</dd>
                  <dt className="text-muted-foreground">Node</dt>
                  <dd>
                    <code>ct6e-standard-4t</code> Spot pool, us-east1-d
                  </dd>
                  <dt className="text-muted-foreground">Image</dt>
                  <dd>
                    <code>TPU_IMAGE_LABEL</code>
                  </dd>
                  <dt className="text-muted-foreground">Parallelism</dt>
                  <dd>Tensor parallel 4</dd>
                  <dt className="text-muted-foreground">Batching</dt>
                  <dd>max-num-seqs 128, max-num-batched-tokens 4096, memory utilization 0.90</dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>$0.671 per chip-hour Spot = $2.68/h</dd>
                </dl>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-[#5b8f00]">
              <CardHeader>
                <CardTitle>H100 side</CardTitle>
                <CardDescription>Modal serverless GPU</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Hardware</dt>
                  <dd>1x NVIDIA H100 80 GB</dd>
                  <dt className="text-muted-foreground">Container</dt>
                  <dd>16 vCPU, 128 GiB RAM, weights on a Modal Volume</dd>
                  <dt className="text-muted-foreground">Image</dt>
                  <dd>
                    <code>vllm/vllm-openai:v0.32.0</code>
                  </dd>
                  <dt className="text-muted-foreground">Parallelism</dt>
                  <dd>Single GPU</dd>
                  <dt className="text-muted-foreground">Batching</dt>
                  <dd>max-num-seqs 128 (256 for FP8), max-num-batched-tokens 8192, memory utilization 0.95</dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>$3.95/h GPU only, $5.73/h with the container as run</dd>
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Serving flags shared by both sides and both models</CardTitle>
              <CardDescription>
                Prefix caching and the multimodal processor cache are off so every request does full prefill work. Only
                the model path and the model-specific flags above change between models.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Code title={`vllm serve (TPU variant, ${model.short})`}>{`vllm serve ${model.serveTarget} \\
  --served-model-name ${modelId === "cosmos3" ? "cosmos3-super-reasoner" : "qwen3.8-27b"} \\${
    model.modelArgs ? `\n  ${model.modelArgs} \\` : ""
  }
  --generation-config vllm --max-model-len 4096 \\
  --limit-mm-per-prompt '{"image": 1, "video": 0}' \\
  --no-enable-prefix-caching --mm-processor-cache-gb 0 --async-scheduling \\
  --tensor-parallel-size 4 --max-num-seqs 128 --max-num-batched-tokens 4096 \\
  --gpu-memory-utilization 0.90 --port 8000`}</Code>
            </CardContent>
          </Card>

          <Card className="border-amber-300 bg-amber-50/60">
            <CardHeader>
              <CardTitle>Gotchas we hit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <strong>Cosmos3: the model directory name matters on TPU.</strong> vllm-torchtpu applies its Qwen3-VL TPU
                patches only when the model path or architecture name contains{" "}
                <code className="rounded bg-amber-100 px-1">qwen3vl</code>. Cosmos3's architecture name does not, so the
                weights are downloaded to <code className="rounded bg-amber-100 px-1">/dev/shm/cosmos3-super-qwen3vl</code>.
              </p>
              <p>
                <strong>Qwen3.8: turn thinking off for a fixed-length benchmark.</strong> Its chat template thinks by
                default, which would spend the 150-token budget on reasoning text. Requests pass{" "}
                <code className="rounded bg-amber-100 px-1">{`chat_template_kwargs: {enable_thinking: false}`}</code>.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Separator />

        <Section id="method" eyebrow="Method" title="Keeping the comparison fair">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "Same precision",
                "BF16 on both. TPU v6e has no FP8 hardware and NVIDIA validates this model only in BF16. H100 FP8 is shown as a reference, not as the comparison.",
              ],
              [
                "Same server and plugin",
                "vLLM 0.32.0 on both, with the same vendored vllm-cosmos3 plugin and the same model override and serving flags.",
              ],
              [
                "Same workload",
                "64 Argoverse 2 front-camera frames resized to 576x768, cycled in order, with one fixed 1,015-token scene-report prompt.",
              ],
              [
                "Fixed output length",
                "Greedy decoding (temperature 0, seed 0) with min_tokens = max_tokens = 150, so every request produces exactly 150 tokens.",
              ],
              [
                "Same load generator",
                "bench_client.py: streaming /v1/chat/completions, closed loop. Each level has an unscored warmup of c requests, then max(24, 3c) scored requests.",
              ],
              [
                "Best-vs-best cost",
                "Each setup is priced at its own best throughput level, so neither side is penalized for a concurrency it handles badly.",
              ],
            ].map(([t, d]) => (
              <Card key={t}>
                <CardHeader>
                  <CardTitle className="text-base">{t}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Metrics</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>Output throughput: total generated tokens / scored wall-clock seconds.</li>
                <li>Time to first token (TTFT): from request send to first streamed token, p50 and p99.</li>
                <li>Per-token latency: (end-to-end − TTFT) / (tokens − 1), p50 and p99.</li>
                <li>Quality: exact match, character similarity, identical-prefix length and field agreement vs H100 BF16.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Separator />

        <Section id="capacity" eyebrow="Getting a TPU" title="Capacity was the hard part, not the software">
          <p className="max-w-3xl text-muted-foreground">
            The serving stack worked the first time a node stayed up. Getting a 4-chip v6e slice that stayed up took most
            of the night. Times are Pacific, Nov 5, 2026.
          </p>
          <ol className="relative space-y-4 border-l-2 border-neutral-200 pl-6">
            {timeline.map((t) => (
              <li key={t.when} className="relative">
                <span
                  className={`absolute top-1.5 -left-[31px] size-3.5 rounded-full border-2 border-white ${
                    t.tone === "good" ? "bg-green-600" : t.tone === "warn" ? "bg-amber-500" : "bg-red-500"
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground">{t.when}</p>
                <p className="font-medium">{t.what}</p>
                <p className="text-sm text-muted-foreground">{t.outcome}</p>
              </li>
            ))}
          </ol>
          <Card>
            <CardHeader>
              <CardTitle>Making Spot survivable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <code>race.sh</code> waited on both a Flex-start cluster and a Spot cluster, kept whichever produced a TPU
                node first, and deleted the other. <code>drive_gke_resumable.sh</code> runs one concurrency level at a
                time and copies each result off the pod, so a preemption only loses the level in flight; on pod loss it
                recreates the pod and resumes.
              </p>
              <p>
                Server start took about 12 minutes, of which about 6.5 were TorchTPU compilation. Persisting the compile
                cache to a disk or GCS would make each preemption restart much cheaper.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Separator />

        <Section id="reproduce" eyebrow="Reproduce" title="Run it yourself">
          <p className="max-w-3xl text-muted-foreground">
            Everything is in the{" "}
            <a className="underline" href={`${REPO_URL}/tree/main/benchmark`} target="_blank" rel="noreferrer">
              benchmark/
            </a>{" "}
            folder of the repository. You need a GCP project with Spot TPU v6e quota in a zone that has stock, the{" "}
            <code>gcloud</code> and <code>kubectl</code> CLIs, and for the H100 side a Modal account.
          </p>
          <Code title="1. Stage the kit (downloads the 64 test frames from public S3)">{`git clone ${REPO_URL}.git && cd tpu-vs-h100-llm-bench
bash benchmark/stage.sh          # assembles /tmp/bench`}</Code>
          <Code title="2. Create a GKE cluster with a Spot v6e-4 node pool">{`export PROJECT=your-project ZONE=us-east1-d
gcloud container clusters create cosmos-spot --project=$PROJECT --location=$ZONE \\
  --node-locations=$ZONE --machine-type=e2-medium --num-nodes=1
gcloud container node-pools create tpu --project=$PROJECT --location=$ZONE \\
  --cluster=cosmos-spot --node-locations=$ZONE \\
  --machine-type=ct6e-standard-4t --num-nodes=1 --spot
gcloud container clusters get-credentials cosmos-spot --project=$PROJECT --location=$ZONE`}</Code>
          <Code title="3. Run the resumable TPU sweep, then delete the cluster">{`bash /tmp/bench/k8s/drive_gke_resumable.sh \\
  gke_\${PROJECT}_\${ZONE}_cosmos-spot v6e-4-bf16
# results: /tmp/bench/out/v6e-4-bf16/result_v6e-4-bf16.json
gcloud container clusters delete cosmos-spot --project=$PROJECT --location=$ZONE --quiet`}</Code>
          <Code title="4. Run the H100 side on Modal">{`cd /tmp/bench
modal run modal_app.py --mode download       # 129 GB of shards into a Modal Volume
modal run modal_app.py --variant bf16        # writes result_h100_bf16.json
modal run modal_app.py --variant fp8         # optional reference`}</Code>
          <Code title="5. Compare outputs">{`python benchmark/tools/compare_quality.py \\
  benchmark/results/result_h100_bf16.json \\
  benchmark/results/result_v6e-4-bf16.json benchmark/results/result_h100_fp8.json`}</Code>
          <p className="text-sm text-muted-foreground">
            A Spot v6e-4 costs about $2.68/h; the full TPU run (node up, weights, compile, sweep) fits in under an hour.
            Always delete the cluster when the sweep finishes.
          </p>
        </Section>

        <Separator />

        <Section id="lessons" eyebrow="Lessons" title="Takeaways for TPU builders">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [
                "Prefer GKE Spot over bare Spot TPU VMs",
                "In our run, GKE Spot in us-east1-d delivered a node in ~8 minutes and held it for the whole job, while three Cloud TPU API Spot VMs were each preempted within 16 minutes.",
              ],
              [
                "Design for preemption from the start",
                "Checkpoint results per step, detach long-running servers from kubectl exec, and make drivers idempotent so they resume instead of restart.",
              ],
              [
                "Cache compilation",
                "TorchTPU compilation is ~6.5 minutes of a ~12 minute start. Put the cache on a persistent disk or GCS before you rely on Spot.",
              ],
              [
                "Memory headroom is a TPU advantage for VLM serving",
                "128 GB across four chips leaves room for a 200k-token KV cache with a 65 GB model, which is what lets throughput keep scaling under load.",
              ],
              [
                "Check the model-path heuristics",
                "vllm-torchtpu keys some model-specific patches off the path or architecture name. Derived models may need a directory name that triggers them.",
              ],
              [
                "Compare at matched precision",
                "FP8 on H100 is faster but changes outputs noticeably on this model. Comparing TPU BF16 to GPU FP8 would mix a hardware question with a numerics question.",
              ],
            ].map(([t, d]) => (
              <Card key={t}>
                <CardHeader>
                  <CardTitle className="text-base">{t}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-neutral-50">
            <CardHeader>
              <CardTitle className="text-base">Limits of this study</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>One run per backend, one workload shape (single image, 1,457 prompt tokens, 150 output tokens).</li>
                <li>Outputs are capped at 150 tokens, so quality covers only the first three report sections.</li>
                <li>Quality is agreement with H100 BF16, not accuracy against ground truth.</li>
                <li>
                  A v6e-4 (four chips) is compared with one H100; the per-chip picture is different, and the cost per token
                  is the fairer headline.
                </li>
                <li>Prices are list prices on Nov 5, 2026 and change often, especially Spot.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>
      </main>

      <footer className="border-t bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Test images: Argoverse 2 (CC BY-NC-SA 4.0). Model: nvidia/Cosmos3-Super (OpenMDW-1.1). Built for TPU Builders.
          </p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-neutral-900">
            Source and raw data <ArrowUpRight className="size-4" />
          </a>
        </div>
      </footer>
    </div>
  )
}
