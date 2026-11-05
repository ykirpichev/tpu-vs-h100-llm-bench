/** List prices as of Nov 5, 2026. $/1M uses each model's measured peak output tok/s. */

export type PeakKey = "cosmosTpu" | "cosmosH100" | "cosmosFp8" | "qwenTpu"

export const PEAKS: Record<PeakKey, number> = {
  cosmosTpu: 828.434,
  cosmosH100: 431.467,
  cosmosFp8: 953.068,
  qwenTpu: 644.426,
}

export type PriceTier = {
  id: string
  group: "tpu" | "h100-modal" | "h100-gcp"
  label: string
  hourly: number
  unit: string
  region: string
  source: string
  verified: boolean
  note?: string
}

/** Per v6e-4 (4 chips) or per 1x H100 where noted. */
export const TIERS: PriceTier[] = [
  {
    id: "tpu-spot",
    group: "tpu",
    label: "TPU v6e Spot",
    hourly: 2.684448,
    unit: "v6e-4 / h ($0.671112 / chip-h)",
    region: "us-east1 (Americas Spot SKU)",
    source: "https://cloud.google.com/tpu/pricing · Cloud Billing catalog SKU 9A7C-D787-1EFD",
    verified: true,
  },
  {
    id: "tpu-od",
    group: "tpu",
    label: "TPU v6e on-demand",
    hourly: 10.8,
    unit: "v6e-4 / h ($2.70 / chip-h)",
    region: "us-east1",
    source: "https://cloud.google.com/tpu/pricing · SKU 446F-AA1E-245D",
    verified: true,
  },
  {
    id: "tpu-flex",
    group: "tpu",
    label: "TPU v6e Flex-start (DWS)",
    hourly: 5.4,
    unit: "v6e-4 / h ($1.35 / chip-h)",
    region: "SKU regions (e.g. us-central1, us-east5); no Flex-start SKU in us-east1",
    source: "https://cloud.google.com/products/dws/pricing · DWS Defined Duration V6e",
    verified: true,
    note: "List = account price on 2026-11-05. Google flagged Flex-start prices for a Nov 2026 update.",
  },
  {
    id: "tpu-cud1y",
    group: "tpu",
    label: "TPU v6e 1-year CUD",
    hourly: 7.56,
    unit: "v6e-4 / h ($1.89 / chip-h)",
    region: "us-east1 / us-east5",
    source: "https://cloud.google.com/tpu/pricing (1-year Commitment column, Trillium)",
    verified: true,
    note: "Requires a commitment via Cloud Sales / reservations; not used in this study.",
  },
  {
    id: "tpu-cud3y",
    group: "tpu",
    label: "TPU v6e 3-year CUD",
    hourly: 4.88,
    unit: "v6e-4 / h ($1.22 / chip-h)",
    region: "us-east1 / us-east5",
    source: "https://cloud.google.com/tpu/pricing (3-year Commitment column, Trillium)",
    verified: true,
    note: "Requires a commitment via Cloud Sales / reservations; not used in this study.",
  },
  {
    id: "modal-gpu",
    group: "h100-modal",
    label: "H100 Modal (GPU only)",
    hourly: 3.949,
    unit: "1x H100 / h",
    region: "Modal",
    source: "Modal H100 list price used in this study's H100 runs",
    verified: true,
  },
  {
    id: "modal-full",
    group: "h100-modal",
    label: "H100 Modal (as run)",
    hourly: 5.73,
    unit: "1x H100 + 16 vCPU + 128 GiB / h",
    region: "Modal",
    source: "Modal container as configured for the Cosmos3-Super H100 sweeps",
    verified: true,
  },
  {
    id: "gcp-a3-od",
    group: "h100-gcp",
    label: "GCP A3 High H100 on-demand",
    hourly: 11.06125,
    unit: "per GPU-h (a3-highgpu-8g / 8)",
    region: "us-central1",
    source: "https://cloud.google.com/products/compute/pricing/accelerator-optimized ($88.490000119 / 8)",
    verified: true,
    note: "Full machine price includes vCPU, memory, and Local SSD, allocated per GPU.",
  },
  {
    id: "gcp-a3-spot",
    group: "h100-gcp",
    label: "GCP A3 High H100 Spot",
    hourly: 6.587557589,
    unit: "per GPU-h (a3-highgpu-8g / 8)",
    region: "us-central1",
    source: "https://cloud.google.com/products/compute/pricing/accelerator-optimized (Spot $52.700460712 / 8)",
    verified: true,
    note: "Spot prices change; figure is the public list on 2026-11-05.",
  },
  {
    id: "gcp-a3-1y",
    group: "h100-gcp",
    label: "GCP A3 High H100 1-year CUD",
    hourly: 7.672959279,
    unit: "per GPU-h (a3-highgpu-8g / 8)",
    region: "us-central1",
    source: "https://cloud.google.com/products/compute/pricing/accelerator-optimized ($61.383674231 / 8)",
    verified: true,
  },
  {
    id: "gcp-a3-3y",
    group: "h100-gcp",
    label: "GCP A3 High H100 3-year CUD",
    hourly: 4.858047899,
    unit: "per GPU-h (a3-highgpu-8g / 8)",
    region: "us-central1",
    source: "https://cloud.google.com/products/compute/pricing/accelerator-optimized ($38.864383195 / 8)",
    verified: true,
  },
]

export function perMillion(hourly: number, tokPerSec: number): number {
  return Math.round((hourly / (tokPerSec * 3600)) * 1e6 * 100) / 100
}

export function fmtMoney(n: number, digits = 2): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** Study spend estimates from driver logs / result wall times × list prices. */
export const STUDY_SPEND = {
  cosmosTpu: { usd: 3.4, label: "≈ $3.40", detail: "Cosmos3-Super Spot v6e-4, all attempts (site estimate)" },
  qwenTpu: {
    usd: 1.31,
    label: "≈ $1.31",
    detail: "Qwen3.8-27B GKE Spot pod ≈29 min × $2.684/h (driver log 18:20–18:49)",
  },
  h100Modal: {
    usd: 2.03,
    label: "≈ $2.03",
    detail:
      "Cosmos3 H100 BF16+FP8 active time (server_ready + sweep walls) × Modal $5.73/h container; excludes weight download",
  },
  total: { usd: 6.74, label: "≈ $6.70", detail: "Sum of the three estimates above; labeled estimate, not a billing export" },
} as const
