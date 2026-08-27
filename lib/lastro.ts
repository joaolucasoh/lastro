import { z } from "zod";

export type Currency = "USD" | "EUR" | "GBP" | "BRL";
export type ContractStatus = "ativo" | "encerrado";
export type PaymentStatus = "previsto" | "recebido";
export type BillingType = "mensal" | "hora";

export type Agency = {
  id: string;
  name: string;
  country: string;
  status: "ativa" | "encerrada";
  colorHex: string;
  notes?: string;
};

export type Client = {
  id: string;
  name: string;
  notes?: string;
};

export type Contract = {
  id: string;
  agencyId: string;
  clientId?: string;
  countryRegion: string;
  billingType: BillingType;
  currency: Currency;
  monthlyRate: number;
  hourlyRate?: number;
  estimatedMonthlyHours?: number;
  fxRateRef?: number;
  monthlyRateBrlRef: number;
  startedAt: string;
  endedAt?: string;
  status: ContractStatus;
};

export type Payment = {
  id: string;
  contractId?: string;
  agencyId: string;
  referenceMonth: string;
  amountBrl: number;
  amountOriginal?: number;
  currencyOriginal?: Currency;
  fxRate?: number;
  receivedAt?: string;
  status: PaymentStatus;
  notes?: string;
};

export const months = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
] as const;

export const currencySymbols: Record<Currency, string> = {
  USD: "US$",
  EUR: "€",
  GBP: "£",
  BRL: "R$"
};

export const agencySchema = z.object({
  name: z.string().min(2),
  country: z.string().min(2),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
});

export const contractSchema = z.object({
  agencyId: z.string().min(1),
  clientName: z.string().optional(),
  countryRegion: z.string().min(2),
  billingType: z.enum(["mensal", "hora"]),
  currency: z.enum(["USD", "EUR", "GBP", "BRL"]),
  monthlyRate: z.number().nonnegative(),
  hourlyRate: z.number().nonnegative().optional(),
  estimatedMonthlyHours: z.number().nonnegative().optional(),
  fxRateRef: z.number().nonnegative().optional(),
  monthlyRateBrlRef: z.number().nonnegative(),
  startedAt: z.string().min(10),
  endedAt: z.string().optional()
});

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseBrazilianMoney(input: string) {
  const cleaned = input
    .replace(/\u00a0/g, " ")
    .replace(/R\$|US\$|€|£/gi, "")
    .replace(/\s/g, "")
    .trim();

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function formatCurrency(value: number, currency: Currency) {
  if (currency === "BRL") return formatBRL(value);
  return `${currencySymbols[currency]} ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)}`;
}

export function contractSourceRate(contract: Contract) {
  if (contract.billingType === "hora") {
    return (contract.hourlyRate ?? 0) * (contract.estimatedMonthlyHours ?? 0);
  }
  return contract.monthlyRate;
}

export function contractBrlReference(contract: Contract) {
  if (contract.monthlyRateBrlRef > 0) return contract.monthlyRateBrlRef;
  const sourceAmount = contractSourceRate(contract);
  if (contract.currency === "BRL") return sourceAmount;
  return sourceAmount * (contract.fxRateRef ?? 0);
}

export function formatContractRate(contract: Contract) {
  if (contract.billingType === "hora") {
    const hours = contract.estimatedMonthlyHours ?? 0;
    return {
      primary: `${formatCurrency(contract.hourlyRate ?? 0, contract.currency)}/h`,
      secondary: `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(hours)} h/mês estimadas`,
      monthlyReference: contractBrlReference(contract)
    };
  }
  return {
    primary: formatCurrency(contract.monthlyRate, contract.currency),
    secondary: "valor fixo mensal",
    monthlyReference: contract.monthlyRateBrlRef
  };
}

export function monthDate(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

export function isContractActiveInMonth(contract: Contract, year: number, monthIndex: number) {
  const current = monthDate(year, monthIndex);
  const started = contract.startedAt.slice(0, 7) + "-01";
  const ended = contract.endedAt ? contract.endedAt.slice(0, 7) + "-01" : undefined;
  return started <= current && (!ended || ended >= current);
}

export function contractAnnualTotal(contract: Contract, payments: Payment[], year: number) {
  return months.reduce((total, _month, index) => total + paymentFor(contract.id, payments, year, index), 0);
}

export function paymentFor(contractId: string, payments: Payment[], year: number, monthIndex: number) {
  const referenceMonth = monthDate(year, monthIndex);
  return payments
    .filter((payment) => payment.contractId === contractId && payment.referenceMonth === referenceMonth)
    .reduce((total, payment) => total + payment.amountBrl, 0);
}

export function fxVariance(contract: Contract, amountBrl: number) {
  if (contract.currency === "BRL" || contractSourceRate(contract) <= 0 || amountBrl <= 0) return null;
  const expected = contractBrlReference(contract);
  if (expected <= 0) return null;
  const diff = amountBrl - expected;
  return {
    diff,
    percent: expected === 0 ? 0 : diff / expected
  };
}

export type ImportPreview = {
  rows: number;
  createdAgencies: string[];
  payments: Array<{ agencyName: string; monthIndex: number; amount: number }>;
  discarded: string[];
};

export function parseAnnualRevenueCsv(csv: string): ImportPreview {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: 0, createdAgencies: [], payments: [], discarded: ["CSV vazio"] };

  const delimiter = lines.some((line) => line.includes(";")) ? ";" : ",";
  const header = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase());
  const monthIndexes = header.map((cell, index) => ({ cell, index })).filter(({ cell }) => months.includes(cell as (typeof months)[number]));
  const discarded: string[] = [];

  if (monthIndexes.length === 0) {
    return { rows: lines.length - 1, createdAgencies: [], payments: [], discarded: ["Cabeçalho de meses não encontrado"] };
  }

  const agencyNames = new Set<string>();
  const payments: ImportPreview["payments"] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    const first = cells[0];
    if (!first || /^total/i.test(first)) {
      discarded.push(first || "linha sem agência");
      continue;
    }
    agencyNames.add(first);
    for (const month of monthIndexes) {
      const amount = parseBrazilianMoney(cells[month.index] ?? "");
      if (amount > 0) {
        payments.push({ agencyName: first, monthIndex: months.indexOf(month.cell as (typeof months)[number]), amount });
      }
    }
  }

  return {
    rows: Math.max(lines.length - 1, 0),
    createdAgencies: Array.from(agencyNames),
    payments,
    discarded
  };
}

export const seedAgencies: Agency[] = [
  { id: "ag_worknomads", name: "WorkNomads", country: "Bulgária", status: "ativa", colorHex: "#14b8a6" },
  { id: "ag_starbucks", name: "Starbucks", country: "Brasil", status: "ativa", colorHex: "#22c55e" },
  { id: "ag_yld", name: "YLD", country: "Reino Unido", status: "ativa", colorHex: "#f59e0b" },
  { id: "ag_turnkey", name: "TurnKey", country: "USA", status: "ativa", colorHex: "#60a5fa" }
];

export const seedClients: Client[] = [
  { id: "cl_fintech", name: "Fintech Client" },
  { id: "cl_starbucks", name: "Starbucks Brasil" },
  { id: "cl_retail", name: "Retail Client" }
];

export const seedContracts: Contract[] = [
  {
    id: "ct_worknomads_fintech",
    agencyId: "ag_worknomads",
    clientId: "cl_fintech",
    countryRegion: "Bulgária, Europe",
    billingType: "mensal",
    currency: "EUR",
    monthlyRate: 4000,
    fxRateRef: 6,
    monthlyRateBrlRef: 24000,
    startedAt: "2024-10-01",
    status: "ativo"
  },
  {
    id: "ct_starbucks_hourly",
    agencyId: "ag_starbucks",
    clientId: "cl_starbucks",
    countryRegion: "Brasil",
    billingType: "hora",
    currency: "BRL",
    monthlyRate: 0,
    hourlyRate: 215,
    estimatedMonthlyHours: 160,
    monthlyRateBrlRef: 34400,
    startedAt: "2026-01-01",
    status: "ativo"
  },
  {
    id: "ct_yld_retail",
    agencyId: "ag_yld",
    clientId: "cl_retail",
    countryRegion: "UK/Europe",
    billingType: "mensal",
    currency: "GBP",
    monthlyRate: 3740,
    fxRateRef: 7.5,
    monthlyRateBrlRef: 28050,
    startedAt: "2024-01-01",
    endedAt: "2025-06-30",
    status: "encerrado"
  },
  {
    id: "ct_turnkey",
    agencyId: "ag_turnkey",
    countryRegion: "USA",
    billingType: "mensal",
    currency: "USD",
    monthlyRate: 4400,
    fxRateRef: 5.5,
    monthlyRateBrlRef: 24200,
    startedAt: "2025-07-01",
    status: "ativo"
  }
];

export const seedPayments: Payment[] = [
  { id: "pay_1", contractId: "ct_worknomads_fintech", agencyId: "ag_worknomads", referenceMonth: "2026-01-01", amountBrl: 33620, status: "recebido", fxRate: 6.47 },
  { id: "pay_2", contractId: "ct_worknomads_fintech", agencyId: "ag_worknomads", referenceMonth: "2026-02-01", amountBrl: 31980, status: "recebido", fxRate: 6.15 },
  { id: "pay_starbucks_1", contractId: "ct_starbucks_hourly", agencyId: "ag_starbucks", referenceMonth: "2026-01-01", amountBrl: 34400, status: "recebido" },
  { id: "pay_3", contractId: "ct_turnkey", agencyId: "ag_turnkey", referenceMonth: "2026-01-01", amountBrl: 24640, status: "recebido", fxRate: 5.6 },
  { id: "pay_4", contractId: "ct_turnkey", agencyId: "ag_turnkey", referenceMonth: "2026-02-01", amountBrl: 23760, status: "previsto", fxRate: 5.4 }
];

export type DistributionKind = "dividendos" | "pro_labore" | "reembolso";

export type Distribution = {
  id: string;
  paidAt: string;
  referenceMonth: string;
  amount: number;
  kind: DistributionKind;
  sourceEntity: string;
  description?: string;
  notes?: string;
};

export type TaxSettings = {
  id: string;
  effectiveFrom: string;
  monthlyThreshold: number;
  irrfRate: number;
  irpfmAnnualThreshold: number;
  irpfmUpperBound: number;
  irpfmMaxRate: number;
};

export const defaultTaxSettings: TaxSettings = {
  id: "tax_2026",
  effectiveFrom: "2026-01-01",
  monthlyThreshold: 50000,
  irrfRate: 0.1,
  irpfmAnnualThreshold: 600000,
  irpfmUpperBound: 1200000,
  irpfmMaxRate: 0.1
};

export const seedDistributions: Distribution[] = [
  { id: "dist_1", paidAt: "2026-01-10", referenceMonth: "2026-01-01", amount: 50000, kind: "dividendos", sourceEntity: "Lastro Tecnologia", description: "Distribuição janeiro" },
  { id: "dist_2", paidAt: "2026-02-10", referenceMonth: "2026-02-01", amount: 67375, kind: "dividendos", sourceEntity: "Lastro Tecnologia", description: "Distribuição fevereiro" }
];

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function irrfDoMes(valoresDoMes: number[], cfg: TaxSettings = defaultTaxSettings) {
  const total = valoresDoMes.reduce((sum, value) => sum + value, 0);
  if (total <= cfg.monthlyThreshold) return { total, base: 0, imposto: 0 };
  return { total, base: total, imposto: round2(total * cfg.irrfRate) };
}

export function irrfBySourceMonth(distributions: Distribution[], sourceEntity: string, referenceMonth: string, cfg: TaxSettings = defaultTaxSettings) {
  const values = distributions
    .filter((item) => item.sourceEntity === sourceEntity && item.referenceMonth === referenceMonth)
    .map((item) => item.amount);
  return irrfDoMes(values, cfg);
}

export function irrfTotalForMonth(distributions: Distribution[], referenceMonth: string, cfg: TaxSettings = defaultTaxSettings) {
  const sources = Array.from(new Set(distributions.filter((item) => item.referenceMonth === referenceMonth).map((item) => item.sourceEntity)));
  return sources.reduce((sum, source) => sum + irrfBySourceMonth(distributions, source, referenceMonth, cfg).imposto, 0);
}

export function isDeadZoneAmount(amount: number, cfg: TaxSettings = defaultTaxSettings) {
  const upper = cfg.monthlyThreshold / (1 - cfg.irrfRate);
  return amount > cfg.monthlyThreshold && amount <= upper;
}

export function netDistributionAmount(amount: number, cfg: TaxSettings = defaultTaxSettings) {
  return amount - irrfDoMes([amount], cfg).imposto;
}

export function irpfmAnnualRate(annualIncome: number, cfg: TaxSettings = defaultTaxSettings) {
  if (annualIncome <= cfg.irpfmAnnualThreshold) return 0;
  if (annualIncome >= cfg.irpfmUpperBound) return cfg.irpfmMaxRate;
  return round2((annualIncome / 60000 - 10) / 100);
}

export function irrfSobreExcedenteLegado(totalDividendosMes: number, cfg: TaxSettings = defaultTaxSettings) {
  return round2(Math.max(totalDividendosMes - cfg.monthlyThreshold, 0) * cfg.irrfRate);
}

export function additionalIrrfForDistribution(previousDividendTotal: number, amount: number, cfg: TaxSettings = defaultTaxSettings) {
  const before = irrfDoMes([previousDividendTotal], cfg).imposto;
  const after = irrfDoMes([previousDividendTotal + amount], cfg).imposto;
  return round2(after - before);
}
