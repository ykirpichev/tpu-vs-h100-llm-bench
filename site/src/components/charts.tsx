import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { Level } from "@/data"
import { perMillion } from "@/pricing"

export const COLORS = {
  tpu: "#1a73e8",
  h100: "#5b8f00",
  fp8: "#9ca3af",
}

type Metric = "throughput" | "ttft" | "tpot"

const METRICS: Record<Metric, { keys: [string, string, string]; unit: string; label: string }> = {
  throughput: { keys: ["tpu", "h100", "h100fp8"], unit: "tok/s", label: "Output tokens per second" },
  ttft: { keys: ["tpuTtft", "h100Ttft", "h100fp8Ttft"], unit: "s", label: "Time to first token, p50 (seconds)" },
  tpot: { keys: ["tpuTpot", "h100Tpot", "h100fp8Tpot"], unit: "ms", label: "Time per output token, p50 (ms)" },
}

export function SweepChart({ metric, levels }: { metric: Metric; levels: Level[] }) {
  const m = METRICS[metric]
  const data = levels.map((l) => ({ ...l, label: String(l.concurrency) }))
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            label={{ value: "Concurrent requests", position: "insideBottom", offset: -14, fontSize: 12 }}
          />
          <YAxis tick={{ fontSize: 12 }} width={48} />
          <Tooltip
            formatter={(v, name) => [v == null ? "not run" : `${Number(v).toLocaleString()} ${m.unit}`, name]}
            labelFormatter={(l) => `Concurrency ${l}`}
          />
          <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey={m.keys[0]}
            name="TPU v6e-4, BF16"
            stroke={COLORS.tpu}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey={m.keys[1]}
            name="1x H100, BF16"
            stroke={COLORS.h100}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey={m.keys[2]}
            name="1x H100, FP8 (reference)"
            stroke={COLORS.fp8}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">{m.label}</p>
    </div>
  )
}

export type CostRow = { setup: string; short: string; hourly: number; tps: number; color: string; perM: number }

export const PRICES = {
  tpuSpot: 2.684448,
  tpuFlex: 5.4,
  tpuOnDemand: 10.8,
  tpuCud1y: 7.56,
  tpuCud3y: 4.88,
  h100Gpu: 3.949,
  h100Modal: 5.73,
}

export function costRowsFor(levels: Level[]): CostRow[] {
  const best = (k: "tpu" | "h100" | "h100fp8") => Math.max(0, ...levels.map((l) => l[k] ?? 0))
  const tpu = best("tpu")
  const h100 = best("h100")
  const fp8 = best("h100fp8")
  const rows = [
    { setup: "v6e-4 Spot (as run)", short: "v6e-4 Spot", hourly: PRICES.tpuSpot, tps: tpu, color: COLORS.tpu },
    { setup: "v6e-4 Flex-start / DWS", short: "v6e-4 Flex", hourly: PRICES.tpuFlex, tps: tpu, color: COLORS.tpu },
    { setup: "v6e-4 3-year CUD", short: "v6e-4 3y CUD", hourly: PRICES.tpuCud3y, tps: tpu, color: COLORS.tpu },
    { setup: "v6e-4 1-year CUD", short: "v6e-4 1y CUD", hourly: PRICES.tpuCud1y, tps: tpu, color: COLORS.tpu },
    { setup: "v6e-4 on-demand", short: "v6e-4 on-demand", hourly: PRICES.tpuOnDemand, tps: tpu, color: COLORS.tpu },
    { setup: "H100 BF16, GPU only (Modal)", short: "H100 BF16", hourly: PRICES.h100Gpu, tps: h100, color: COLORS.h100 },
    {
      setup: "H100 BF16, as run on Modal (16 vCPU, 128 GiB)",
      short: "H100 BF16 Modal",
      hourly: PRICES.h100Modal,
      tps: h100,
      color: COLORS.h100,
    },
    { setup: "H100 FP8, GPU only (reference)", short: "H100 FP8", hourly: PRICES.h100Gpu, tps: fp8, color: COLORS.fp8 },
  ]
  return rows.filter((r) => r.tps > 0).map((r) => ({ ...r, perM: perMillion(r.hourly, r.tps) }))
}

export function CostChart({ rows }: { rows: CostRow[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
          <YAxis type="category" dataKey="short" width={112} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)} per 1M output tokens`, "Cost"]} />
          <Bar dataKey="perM" radius={[0, 4, 4, 0]}>
            {rows.map((r) => (
              <Cell key={r.setup} fill={r.color} />
            ))}
            <LabelList dataKey="perM" position="right" formatter={(v) => `$${Number(v).toFixed(2)}`} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
