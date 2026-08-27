"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Moon,
  Plus,
  Search,
  Sun,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Agency,
  BillingType,
  Client,
  Contract,
  Currency,
  Distribution,
  Payment,
  TaxSettings,
  contractAnnualTotal,
  contractBrlReference,
  contractSchema,
  defaultTaxSettings,
  formatBRL,
  formatContractRate,
  fxVariance,
  irrfBySourceMonth,
  irrfSobreExcedenteLegado,
  irrfTotalForMonth,
  isContractActiveInMonth,
  isDeadZoneAmount,
  makeId,
  monthDate,
  months,
  parseAnnualRevenueCsv,
  parseBrazilianMoney,
  paymentFor,
  seedAgencies,
  seedClients,
  seedContracts,
  seedDistributions,
  seedPayments
} from "@/lib/lastro";

type ImportState = ReturnType<typeof parseAnnualRevenueCsv> | null;
type Screen = "dashboard" | "contratos" | "fontes" | "gastos" | "extratos" | "saidas" | "importacao";
type FiscalMonthStatus = "pending" | "invoice_requested" | "tax_paid";
type RecurringStatus = "ativo" | "inativo";
type ManualIncomeSource = { id: string; name: string; monthlyAmount: number; status: RecurringStatus; notes?: string };
type ExpensePaymentMethod = "cartao" | "boleto" | "pix" | "debito_automatico" | "transferencia" | "dinheiro" | "outro";
type ExpenseCategory = "moradia" | "alimentacao" | "educacao" | "saude" | "lazer" | "assinatura" | "impostos" | "taxas" | "transporte" | "seguros" | "servicos" | "familia" | "outros";
type FixedExpense = { id: string; name: string; monthlyAmount: number; status: RecurringStatus; paymentMethod?: ExpensePaymentMethod; category?: ExpenseCategory; notes?: string };
type IncomeSourceSummary = { id: string; name: string; kind: "contract" | "manual"; monthlyAmount: number; annualAmount: number; status: RecurringStatus; detail: string };
type LastroBackup = { version: 1; exportedAt: string; agencies: Agency[]; clients: Client[]; contracts: Contract[]; payments: Payment[]; distributions?: Distribution[]; taxSettings?: TaxSettings; fiscalStatuses?: Record<string, FiscalMonthStatus>; manualIncomeSources?: ManualIncomeSource[]; fixedExpenses?: FixedExpense[] };

const storageKey = "lastro:v1";
const swatches = ["#14b8a6", "#f59e0b", "#60a5fa", "#f97316", "#a78bfa", "#22c55e"];
const fiscalStatusOrder: FiscalMonthStatus[] = ["pending", "invoice_requested", "tax_paid"];
const fiscalStatusLabel: Record<FiscalMonthStatus, string> = {
  pending: "Não solicitada",
  invoice_requested: "Nota solicitada",
  tax_paid: "Imposto pago"
};
const seedManualIncomeSources: ManualIncomeSource[] = [{ id: "income_rent", name: "Aluguel", monthlyAmount: 0, status: "ativo" }];
const expensePaymentMethods: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "cartao", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "Pix" },
  { value: "debito_automatico", label: "Débito automático" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" }
];
const expenseCategories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "moradia", label: "Moradia" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "educacao", label: "Educação" },
  { value: "saude", label: "Saúde" },
  { value: "lazer", label: "Lazer" },
  { value: "assinatura", label: "Assinatura" },
  { value: "impostos", label: "Impostos" },
  { value: "taxas", label: "Taxas" },
  { value: "transporte", label: "Transporte" },
  { value: "seguros", label: "Seguros" },
  { value: "servicos", label: "Serviços" },
  { value: "familia", label: "Família" },
  { value: "outros", label: "Outros" }
];
const expensePaymentMethodLabel = Object.fromEntries(expensePaymentMethods.map((item) => [item.value, item.label])) as Record<ExpensePaymentMethod, string>;
const expenseCategoryLabel = Object.fromEntries(expenseCategories.map((item) => [item.value, item.label])) as Record<ExpenseCategory, string>;

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [screen, setScreen] = useState<Screen>("contratos");
  const [year, setYear] = useState(2026);
  const [agencies, setAgencies] = useState<Agency[]>(seedAgencies);
  const [clients, setClients] = useState<Client[]>(seedClients);
  const [contracts, setContracts] = useState<Contract[]>(seedContracts);
  const [payments, setPayments] = useState<Payment[]>(seedPayments);
  const [distributions, setDistributions] = useState<Distribution[]>(seedDistributions);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(defaultTaxSettings);
  const [fiscalStatuses, setFiscalStatuses] = useState<Record<string, FiscalMonthStatus>>({});
  const [manualIncomeSources, setManualIncomeSources] = useState<ManualIncomeSource[]>(seedManualIncomeSources);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [incomeForm, setIncomeForm] = useState({ name: "", monthlyAmount: "" });
  const [expenseForm, setExpenseForm] = useState({ name: "", monthlyAmount: "", paymentMethod: "cartao" as ExpensePaymentMethod, category: "outros" as ExpenseCategory });
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportState>(null);
  const [filter, setFilter] = useState("");
  const [distributionForm, setDistributionForm] = useState({ sourceEntity: "Sheijo Tecnologia", paidAt: "2026-01-10", referenceMonth: "2026-01-01", amount: "", description: "" });
  const [contractForm, setContractForm] = useState({
    agencyName: seedAgencies[0]?.name ?? "",
    clientName: "",
    countryRegion: "",
    billingType: "mensal" as BillingType,
    currency: "USD" as Currency,
    monthlyRate: "",
    hourlyRate: "",
    estimatedMonthlyHours: "",
    fxRateRef: "",
    monthlyRateBrlRef: "",
    startedAt: "2026-01-01",
    endedAt: ""
  });
  const storageReady = useRef(false);

  function applyBackup(parsed: LastroBackup) {
    if (Array.isArray(parsed.agencies)) setAgencies(parsed.agencies);
    if (Array.isArray(parsed.clients)) setClients(parsed.clients);
    if (Array.isArray(parsed.contracts)) setContracts(parsed.contracts);
    if (Array.isArray(parsed.payments)) setPayments(parsed.payments);
    if (Array.isArray(parsed.distributions)) setDistributions(parsed.distributions);
    if (parsed.taxSettings) setTaxSettings(parsed.taxSettings);
    if (parsed.fiscalStatuses) setFiscalStatuses(parsed.fiscalStatuses);
    if (Array.isArray(parsed.manualIncomeSources)) setManualIncomeSources(parsed.manualIncomeSources);
    if (Array.isArray(parsed.fixedExpenses)) setFixedExpenses(parsed.fixedExpenses);
  }

  function currentBackup(): LastroBackup {
    return { version: 1, exportedAt: new Date().toISOString(), agencies, clients, contracts, payments, distributions, taxSettings, fiscalStatuses, manualIncomeSources, fixedExpenses };
  }

  async function persistBackup(backup: LastroBackup) {
    window.localStorage.setItem(storageKey, JSON.stringify(backup));
    try {
      await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup)
      });
    } catch {
      // Local storage keeps the app usable if the local server API is temporarily unavailable.
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      let localBackup: LastroBackup | null = null;
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          localBackup = JSON.parse(raw) as LastroBackup;
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }

      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        const result = (await response.json()) as { state?: LastroBackup | null };
        if (cancelled) return;
        if (result.state) {
          applyBackup(result.state);
        } else if (localBackup) {
          applyBackup(localBackup);
          await persistBackup(localBackup);
        }
      } catch {
        if (!cancelled && localBackup) applyBackup(localBackup);
      } finally {
        if (!cancelled) storageReady.current = true;
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady.current) return;
    void persistBackup(currentBackup());
  }, [agencies, clients, contracts, payments, distributions, taxSettings, fiscalStatuses, manualIncomeSources, fixedExpenses]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear(), 2026]);
    contracts.forEach((contract) => {
      years.add(Number(contract.startedAt.slice(0, 4)));
      if (contract.endedAt) years.add(Number(contract.endedAt.slice(0, 4)));
    });
    payments.forEach((payment) => years.add(Number(payment.referenceMonth.slice(0, 4))));
    return Array.from(years).filter(Boolean).sort((a, b) => b - a);
  }, [contracts, payments]);

  const contractsForYear = useMemo(
    () =>
      contracts
        .filter((contract) => months.some((_month, index) => isContractActiveInMonth(contract, year, index)))
        .filter((contract) => {
          const agency = agencies.find((item) => item.id === contract.agencyId);
          const client = clients.find((item) => item.id === contract.clientId);
          return `${agency?.name} ${client?.name} ${contract.countryRegion}`.toLowerCase().includes(filter.toLowerCase());
        }),
    [agencies, clients, contracts, filter, year]
  );

  const yearTotal = useMemo(
    () => contractsForYear.reduce((total, contract) => total + contractAnnualTotal(contract, payments, year), 0),
    [contractsForYear, payments, year]
  );

  const monthTotals = useMemo(
    () =>
      months.map((_month, index) =>
        contractsForYear.reduce((total, contract) => total + paymentFor(contract.id, payments, year, index), 0)
      ),
    [contractsForYear, payments, year]
  );

  const activeManualIncomeMonthlyTotal = useMemo(
    () => manualIncomeSources.filter((source) => source.status === "ativo").reduce((total, source) => total + source.monthlyAmount, 0),
    [manualIncomeSources]
  );

  const fixedMonthlyTotal = useMemo(
    () => fixedExpenses.filter((expense) => expense.status === "ativo").reduce((total, expense) => total + expense.monthlyAmount, 0),
    [fixedExpenses]
  );

  const incomeMonthTotals = useMemo(
    () => monthTotals.map((total) => total + activeManualIncomeMonthlyTotal),
    [activeManualIncomeMonthlyTotal, monthTotals]
  );

  const incomeYearTotal = useMemo(
    () => incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0),
    [incomeMonthTotals]
  );

  const incomeSourceSummaries = useMemo<IncomeSourceSummary[]>(() => {
    const contractSources = contractsForYear.map((contract) => {
      const agency = agencies.find((item) => item.id === contract.agencyId);
      const client = clients.find((item) => item.id === contract.clientId);
      return {
        id: "contract_" + contract.id,
        name: agency?.name ?? "Contrato",
        kind: "contract" as const,
        monthlyAmount: contractBrlReference(contract),
        annualAmount: contractAnnualTotal(contract, payments, year),
        status: contract.status === "ativo" ? "ativo" as const : "inativo" as const,
        detail: client?.name ? "Contrato · " + client.name : "Contrato"
      };
    });
    const manualSources = manualIncomeSources.map((source) => ({
      id: "manual_" + source.id,
      name: source.name,
      kind: "manual" as const,
      monthlyAmount: source.monthlyAmount,
      annualAmount: source.status === "ativo" ? source.monthlyAmount * 12 : 0,
      status: source.status,
      detail: "Manual"
    }));
    return [...contractSources, ...manualSources];
  }, [agencies, clients, contractsForYear, manualIncomeSources, payments, year]);

  function normalizeContract(contract: Contract) {
    const next = { ...contract };
    if (next.billingType === "mensal") {
      next.hourlyRate = undefined;
      next.estimatedMonthlyHours = undefined;
    }
    return next;
  }

  function contractAutoBrlReference(contract: Contract) {
    const sourceAmount = contract.billingType === "hora" ? (contract.hourlyRate ?? 0) * (contract.estimatedMonthlyHours ?? 0) : contract.monthlyRate;
    if (contract.currency === "BRL") return sourceAmount;
    return sourceAmount * (contract.fxRateRef ?? 0);
  }

  function ensureAgency(name: string, country = "A revisar") {
    const trimmed = name.trim();
    if (trimmed.length < 2) return null;
    const existing = agencies.find((agency) => agency.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const agency: Agency = {
      id: makeId("ag"),
      name: trimmed,
      country,
      status: "ativa",
      colorHex: swatches[agencies.length % swatches.length]
    };
    setAgencies((current) => [...current, agency]);
    return agency;
  }

  function addContract() {
    const agency = ensureAgency(contractForm.agencyName, contractForm.countryRegion || "A revisar");
    if (!agency) return;
    const parsed = contractSchema.safeParse({
      ...contractForm,
      agencyId: agency.id,
      monthlyRate: parseBrazilianMoney(contractForm.monthlyRate),
      hourlyRate: contractForm.hourlyRate ? parseBrazilianMoney(contractForm.hourlyRate) : undefined,
      estimatedMonthlyHours: contractForm.estimatedMonthlyHours ? Number(contractForm.estimatedMonthlyHours.replace(",", ".")) : undefined,
      fxRateRef: contractForm.fxRateRef ? parseBrazilianMoney(contractForm.fxRateRef) : undefined,
      monthlyRateBrlRef: parseBrazilianMoney(contractForm.monthlyRateBrlRef),
      endedAt: contractForm.endedAt || undefined
    });
    if (!parsed.success) return;

    let clientId: string | undefined;
    const clientName = parsed.data.clientName?.trim();
    if (clientName) {
      const existing = clients.find((client) => client.name.toLowerCase() === clientName.toLowerCase());
      clientId = existing?.id ?? makeId("cl");
      if (!existing) setClients((current) => [...current, { id: clientId as string, name: clientName }]);
    }

    setContracts((current) => [
      ...current,
      normalizeContract({
        id: makeId("ct"),
        agencyId: agency.id,
        clientId,
        countryRegion: parsed.data.countryRegion,
        billingType: parsed.data.billingType,
        currency: parsed.data.currency,
        monthlyRate: parsed.data.billingType === "mensal" ? parsed.data.monthlyRate : 0,
        hourlyRate: parsed.data.billingType === "hora" ? parsed.data.hourlyRate : undefined,
        estimatedMonthlyHours: parsed.data.billingType === "hora" ? parsed.data.estimatedMonthlyHours : undefined,
        fxRateRef: parsed.data.currency === "BRL" ? undefined : parsed.data.fxRateRef,
        monthlyRateBrlRef: parsed.data.monthlyRateBrlRef > 0 ? parsed.data.monthlyRateBrlRef : contractAutoBrlReference({ ...parsed.data, id: "preview", agencyId: agency.id, countryRegion: parsed.data.countryRegion, monthlyRate: parsed.data.billingType === "mensal" ? parsed.data.monthlyRate : 0, hourlyRate: parsed.data.billingType === "hora" ? parsed.data.hourlyRate : undefined, estimatedMonthlyHours: parsed.data.billingType === "hora" ? parsed.data.estimatedMonthlyHours : undefined, fxRateRef: parsed.data.currency === "BRL" ? undefined : parsed.data.fxRateRef, monthlyRateBrlRef: 0, startedAt: parsed.data.startedAt, status: parsed.data.endedAt ? "encerrado" : "ativo" }),
        startedAt: parsed.data.startedAt,
        endedAt: parsed.data.endedAt,
        status: parsed.data.endedAt ? "encerrado" : "ativo"
      })
    ]);
    setContractForm({ ...contractForm, clientName: "", countryRegion: "", monthlyRate: "", hourlyRate: "", estimatedMonthlyHours: "", fxRateRef: "", monthlyRateBrlRef: "", endedAt: "" });
  }

  function updateContract(contractId: string, patch: Partial<Contract>) {
    setContracts((current) =>
      current.map((contract) => {
        if (contract.id !== contractId) return contract;
        const next = normalizeContract({ ...contract, ...patch });
        const shouldAutoReference =
          patch.monthlyRateBrlRef === undefined &&
          (patch.monthlyRate !== undefined || patch.hourlyRate !== undefined || patch.estimatedMonthlyHours !== undefined || patch.currency !== undefined || patch.fxRateRef !== undefined || patch.billingType !== undefined);
        return shouldAutoReference ? { ...next, fxRateRef: next.currency === "BRL" ? undefined : next.fxRateRef, monthlyRateBrlRef: contractAutoBrlReference(next) } : next;
      })
    );
    if (patch.agencyId) {
      setPayments((current) => current.map((payment) => (payment.contractId === contractId ? { ...payment, agencyId: patch.agencyId as string } : payment)));
    }
  }

  function updateContractAgencyName(contract: Contract, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentAgency = agencies.find((agency) => agency.id === contract.agencyId);
    const existing = agencies.find((agency) => agency.name.toLowerCase() === trimmed.toLowerCase());

    if (existing) {
      updateContract(contract.id, { agencyId: existing.id });
      return;
    }

    const agency: Agency = {
      id: makeId("ag"),
      name: trimmed,
      country: contract.countryRegion || currentAgency?.country || "A revisar",
      status: "ativa",
      colorHex: swatches[agencies.length % swatches.length]
    };
    setAgencies((current) => [...current, agency]);
    updateContract(contract.id, { agencyId: agency.id });
  }

  function updateContractMoney(contract: Contract, field: "monthlyRate" | "hourlyRate" | "fxRateRef" | "monthlyRateBrlRef", raw: string) {
    updateContract(contract.id, { [field]: parseBrazilianMoney(raw) } as Partial<Contract>);
  }

  function updateClientName(contract: Contract, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      updateContract(contract.id, { clientId: undefined });
      return;
    }
    if (contract.clientId) {
      setClients((current) => current.map((client) => (client.id === contract.clientId ? { ...client, name: trimmed } : client)));
      return;
    }
    const existing = clients.find((client) => client.name.toLowerCase() === trimmed.toLowerCase());
    const clientId = existing?.id ?? makeId("cl");
    if (!existing) setClients((current) => [...current, { id: clientId, name: trimmed }]);
    updateContract(contract.id, { clientId });
  }

  function toggleContractStatus(contract: Contract) {
    if (contract.status === "ativo") {
      updateContract(contract.id, { status: "encerrado", endedAt: new Date().toISOString().slice(0, 10) });
      return;
    }
    updateContract(contract.id, { status: "ativo", endedAt: undefined });
  }

  function updateCell(contract: Contract, monthIndex: number, raw: string) {
    if (!isContractActiveInMonth(contract, year, monthIndex)) return;
    const referenceMonth = monthDate(year, monthIndex);
    const amountBrl = parseBrazilianMoney(raw);
    setPayments((current) => {
      const existing = current.find((payment) => payment.contractId === contract.id && payment.referenceMonth === referenceMonth);
      if (existing) return current.map((payment) => (payment.id === existing.id ? { ...payment, amountBrl, status: "recebido" } : payment));
      return [...current, { id: makeId("pay"), contractId: contract.id, agencyId: contract.agencyId, referenceMonth, amountBrl, status: "recebido" }];
    });
  }

  function addDistributionForMonth(monthIndex: number, raw: string) {
    const amount = parseBrazilianMoney(raw);
    const sourceEntity = "Sheijo Tecnologia";
    if (amount <= 0) return false;
    const referenceMonth = monthDate(year, monthIndex);
    setDistributions((current) => [
      ...current,
      {
        id: makeId("dist"),
        paidAt: referenceMonth,
        referenceMonth,
        amount,
        kind: "dividendos",
        sourceEntity,
        description: distributionForm.description.trim() || undefined
      }
    ]);
    setDistributionForm({ ...distributionForm, sourceEntity, amount: "", description: "" });
    return true;
  }

  function updateDistribution(id: string, patch: Partial<Distribution>) {
    setDistributions((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeDistribution(id: string) {
    setDistributions((current) => current.filter((item) => item.id !== id));
  }

  function exportBackup() {
    const backup = currentBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lastro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function restoreBackup(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as LastroBackup;
        if (!Array.isArray(parsed.agencies) || !Array.isArray(parsed.clients) || !Array.isArray(parsed.contracts) || !Array.isArray(parsed.payments)) return;
        applyBackup(parsed);
        void persistBackup(parsed);
      } catch {
        return;
      }
    };
    reader.readAsText(file);
  }

  function addManualIncomeSource() {
    const name = incomeForm.name.trim();
    const monthlyAmount = parseBrazilianMoney(incomeForm.monthlyAmount);
    if (!name || monthlyAmount <= 0) return;
    setManualIncomeSources((current) => [...current, { id: makeId("income"), name, monthlyAmount, status: "ativo" }]);
    setIncomeForm({ name: "", monthlyAmount: "" });
  }

  function updateManualIncomeSource(id: string, patch: Partial<ManualIncomeSource>) {
    setManualIncomeSources((current) => current.map((source) => (source.id === id ? { ...source, ...patch } : source)));
  }

  function addFixedExpense() {
    const name = expenseForm.name.trim();
    const monthlyAmount = parseBrazilianMoney(expenseForm.monthlyAmount);
    if (!name || monthlyAmount <= 0) return;
    setFixedExpenses((current) => [...current, { id: makeId("expense"), name, monthlyAmount, status: "ativo", paymentMethod: expenseForm.paymentMethod, category: expenseForm.category }]);
    setExpenseForm({ name: "", monthlyAmount: "", paymentMethod: expenseForm.paymentMethod, category: expenseForm.category });
  }

  function updateFixedExpense(id: string, patch: Partial<FixedExpense>) {
    setFixedExpenses((current) => current.map((expense) => (expense.id === id ? { ...expense, ...patch } : expense)));
  }

  function cycleFiscalStatus(monthIndex: number) {
    const key = monthDate(year, monthIndex);
    setFiscalStatuses((current) => {
      const currentStatus = current[key] ?? "pending";
      const nextStatus = fiscalStatusOrder[(fiscalStatusOrder.indexOf(currentStatus) + 1) % fiscalStatusOrder.length];
      return { ...current, [key]: nextStatus };
    });
  }

  function loadCsvFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      setPreview(parseAnnualRevenueCsv(text));
    };
    reader.readAsText(file);
  }

  function applyImport() {
    if (!preview) return;
    const createdMap = new Map(agencies.map((agency) => [agency.name.toLowerCase(), agency]));
    const newAgencies = [...agencies];
    const newContracts = [...contracts];
    const newPayments = [...payments];

    for (const name of preview.createdAgencies) {
      let agency = createdMap.get(name.toLowerCase());
      if (!agency) {
        agency = { id: makeId("ag"), name, country: "A revisar", status: "ativa", colorHex: swatches[newAgencies.length % swatches.length] };
        createdMap.set(name.toLowerCase(), agency);
        newAgencies.push(agency);
      }
      if (!newContracts.some((contract) => contract.agencyId === agency?.id)) {
        newContracts.push({ id: makeId("ct"), agencyId: agency.id, countryRegion: agency.country, billingType: "mensal", currency: "BRL", monthlyRate: 0, monthlyRateBrlRef: 0, startedAt: `${year}-01-01`, status: "ativo" });
      }
    }

    for (const imported of preview.payments) {
      const agency = createdMap.get(imported.agencyName.toLowerCase());
      const contract = agency ? newContracts.find((item) => item.agencyId === agency.id) : undefined;
      if (!agency || !contract) continue;
      const referenceMonth = monthDate(year, imported.monthIndex);
      const exists = newPayments.some((payment) => payment.contractId === contract.id && payment.referenceMonth === referenceMonth);
      if (!exists) newPayments.push({ id: makeId("pay"), agencyId: agency.id, contractId: contract.id, referenceMonth, amountBrl: imported.amount, status: "recebido", notes: "Importado da grade anual" });
    }

    setAgencies(newAgencies);
    setContracts(newContracts);
    setPayments(newPayments);
    setCsv("");
    setPreview(null);
    setScreen("extratos");
  }

  const titleByScreen: Record<Screen, string> = {
    dashboard: "Dashboard",
    contratos: "Contratos",
    fontes: "Fontes de renda",
    gastos: "Gastos fixos",
    extratos: "Extratos",
    saidas: "Saídas PJ → PF",
    importacao: "Importação"
  };

  return (
    <main className={theme === "light" ? "light min-h-screen" : "min-h-screen"}>
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-card/82 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BadgeDollarSign size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">Lastro</h1>
              <p className="text-xs text-muted-foreground">PJ internacional</p>
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <NavButton active={screen === "dashboard"} icon={<BadgeDollarSign size={16} />} label="Dashboard" onClick={() => setScreen("dashboard")} />
            <NavButton active={screen === "contratos"} icon={<BriefcaseBusiness size={16} />} label="Contratos" onClick={() => setScreen("contratos")} />
            <NavButton active={screen === "fontes"} icon={<BadgeDollarSign size={16} />} label="Fontes de renda" onClick={() => setScreen("fontes")} />
            <NavButton active={screen === "gastos"} icon={<FileSpreadsheet size={16} />} label="Gastos fixos" onClick={() => setScreen("gastos")} />
            <NavButton active={screen === "extratos"} icon={<FileSpreadsheet size={16} />} label="Extratos" onClick={() => setScreen("extratos")} />
            <NavButton active={screen === "saidas"} icon={<BadgeDollarSign size={16} />} label="Saídas PJ → PF" onClick={() => setScreen("saidas")} />
            <NavButton active={screen === "importacao"} icon={<Upload size={16} />} label="Importação" onClick={() => setScreen("importacao")} />
            <div className="px-3 pt-5 text-[11px] uppercase text-muted-foreground">Próximas fases</div>
            {["Cartões"].map((item) => (
              <button key={item} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-muted-foreground">
                {item}
                <span className="text-[10px] uppercase">em breve</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Fase 1</p>
              <h2 className="text-2xl font-semibold">{titleByScreen[screen]}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm" onClick={exportBackup}>Backup JSON</button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
                Restaurar
                <input className="hidden" type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} />
              </label>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Alternar tema">
                {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                {theme === "dark" ? "Escuro" : "Claro"}
              </button>
            </div>
          </header>

          {screen === "dashboard" && <Dashboard activeContracts={contracts.filter((contract) => contract.status === "ativo").length} contractsForYear={contractsForYear.length} fiscalStatuses={fiscalStatuses} fixedMonthlyTotal={fixedMonthlyTotal} incomeMonthTotals={incomeMonthTotals} incomeSources={incomeSourceSummaries} monthTotals={monthTotals} onFiscalStatusCycle={cycleFiscalStatus} preview={preview} year={year} yearTotal={incomeYearTotal} />}
          {screen === "contratos" && (
            <ContractsScreen
              agencies={agencies}
              clients={clients}
              contractForm={contractForm}
              contracts={contracts}
              onAddContract={addContract}
              onClientNameChange={updateClientName}
              onContractFormChange={setContractForm}
              onContractMoneyChange={updateContractMoney}
              onContractUpdate={updateContract}
              onContractAgencyNameChange={updateContractAgencyName}
              onToggleContractStatus={toggleContractStatus}
            />
          )}
          {screen === "fontes" && <IncomeSourcesScreen contractSources={incomeSourceSummaries.filter((source) => source.kind === "contract")} incomeForm={incomeForm} manualIncomeSources={manualIncomeSources} onAddIncome={addManualIncomeSource} onIncomeFormChange={setIncomeForm} onIncomeUpdate={updateManualIncomeSource} />}
          {screen === "gastos" && <FixedExpensesScreen expenseForm={expenseForm} fixedExpenses={fixedExpenses} fixedMonthlyTotal={fixedMonthlyTotal} onAddExpense={addFixedExpense} onExpenseFormChange={setExpenseForm} onExpenseUpdate={updateFixedExpense} />}
          {screen === "extratos" && (
            <StatementsScreen
              agencies={agencies}
              availableYears={availableYears}
              clients={clients}
              contractsForYear={contractsForYear}
              filter={filter}
              monthTotals={monthTotals}
              onCellUpdate={updateCell}
              onFilterChange={setFilter}
              onYearChange={setYear}
              payments={payments}
              year={year}
              yearTotal={yearTotal}
            />
          )}
          {screen === "saidas" && <TaxScreen distributions={distributions} form={distributionForm} onAddMonth={addDistributionForMonth} onFormChange={setDistributionForm} onRemove={removeDistribution} onTaxSettingsChange={setTaxSettings} onUpdate={updateDistribution} taxSettings={taxSettings} year={year} />}
          {screen === "importacao" && <ImportScreen csv={csv} onApplyImport={applyImport} onCsvChange={setCsv} onCsvFile={loadCsvFile} onPreview={() => setPreview(parseAnnualRevenueCsv(csv))} preview={preview} />}
        </section>
      </div>
    </main>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={onClick}>{icon}{label}</button>;
}

function Dashboard({ activeContracts, contractsForYear, fiscalStatuses, fixedMonthlyTotal, incomeMonthTotals, incomeSources, monthTotals, onFiscalStatusCycle, preview, year, yearTotal }: { activeContracts: number; contractsForYear: number; fiscalStatuses: Record<string, FiscalMonthStatus>; fixedMonthlyTotal: number; incomeMonthTotals: number[]; incomeSources: IncomeSourceSummary[]; monthTotals: number[]; onFiscalStatusCycle: (monthIndex: number) => void; preview: ImportState; year: number; yearTotal: number }) {
  const today = new Date();
  const monthsToAverage = year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : today.getMonth() + 1;
  const elapsedTotals = incomeMonthTotals.slice(0, Math.max(monthsToAverage, 1));
  const averageUntilCurrentMonth = monthsToAverage > 0 ? elapsedTotals.reduce((sum, value) => sum + value, 0) / monthsToAverage : 0;
  const bestMonthValue = Math.max(...incomeMonthTotals, 0);
  const chartMax = Math.max(bestMonthValue, 1);
  const monthlyBalance = averageUntilCurrentMonth - fixedMonthlyTotal;
  const activeIncomeSources = incomeSources.filter((source) => source.status === "ativo");
  const monthlyIncomeSourcesTotal = activeIncomeSources.reduce((sum, source) => sum + source.monthlyAmount, 0);
  const sourceMax = Math.max(...activeIncomeSources.map((source) => source.monthlyAmount), 1);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <Kpi title="Recebido no ano" value={formatBRL(yearTotal)} helper={String(contractsForYear) + " contratos + fontes manuais"} />
        <Kpi title="Contratos ativos" value={String(activeContracts)} helper="fontes automáticas" />
        <Kpi title="Média mensal" value={formatBRL(averageUntilCurrentMonth)} helper={monthsToAverage > 0 ? "jan a " + months[monthsToAverage - 1] : "ano futuro"} />
        <Kpi title="Sobra média" value={formatBRL(monthlyBalance)} helper="média mensal - gastos fixos" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-semibold">Recebimentos mensais</h3><p className="text-sm text-muted-foreground">Contratos do extrato + fontes manuais ativas em {year}.</p></div>
            <span className="rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground">{preview ? String(preview.payments.length) + " importações na prévia" : "sem prévia"}</span>
          </div>
          <div className="flex h-64 items-end gap-2 border-b border-border pb-3" onMouseLeave={() => setHoveredMonth(null)}>
            {incomeMonthTotals.map((total, index) => {
              const height = Math.max((total / chartMax) * 100, total > 0 ? 4 : 0);
              const isElapsed = monthsToAverage === 0 ? false : index < monthsToAverage;
              const isHovered = hoveredMonth === index;
              const hasHover = hoveredMonth !== null;
              const barClass = isElapsed ? "bg-primary" : "bg-muted-foreground/30";
              return (
                <button key={months[index]} className={("group flex min-w-0 flex-1 flex-col items-center gap-2 outline-none transition-opacity " + (hasHover && !isHovered ? "opacity-35" : "opacity-100"))} onMouseEnter={() => setHoveredMonth(index)} onFocus={() => setHoveredMonth(index)} type="button" aria-label={months[index] + ": " + formatBRL(total)}>
                  <div className={("relative flex h-52 w-full items-end rounded-sm bg-muted/50 px-1 transition-all " + (isHovered ? "ring-1 ring-primary" : ""))}>
                    {isHovered && <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-sm border border-border bg-card px-2 py-1 text-xs font-semibold tabular shadow-sm whitespace-nowrap">{months[index].slice(0, 3)}: {formatBRL(total)}</div>}
                    <div className={("w-full rounded-sm transition-all " + barClass + " " + (isHovered ? "brightness-125" : ""))} style={{ height: String(height) + "%" }} />
                  </div>
                  <span className={("text-[11px] uppercase " + (isHovered ? "font-semibold text-foreground" : "text-muted-foreground"))}>{months[index].slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <PreviewLine label="Contratos no extrato" value={formatBRL(monthTotals.reduce((sum, total) => sum + total, 0))} />
            <PreviewLine label="Média até agora" value={formatBRL(averageUntilCurrentMonth)} />
            <PreviewLine label="Gastos fixos/mês" value={formatBRL(fixedMonthlyTotal)} />
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-4"><h3 className="font-semibold">Fontes de renda</h3><p className="text-sm text-muted-foreground">Participação mensal das fontes ativas.</p></div>
          <div className="space-y-3">
            {activeIncomeSources.length === 0 ? <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma fonte ativa cadastrada.</div> : activeIncomeSources.map((source) => {
              const width = Math.max((source.monthlyAmount / sourceMax) * 100, source.monthlyAmount > 0 ? 4 : 0);
              return (
                <div key={source.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="font-medium">{source.name}</span><span className="tabular">{formatBRL(source.monthlyAmount)}</span></div>
                  <div className="h-2 overflow-hidden rounded-sm bg-muted"><div className={source.kind === "contract" ? "h-full bg-primary" : "h-full bg-amber"} style={{ width: String(width) + "%" }} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{source.detail}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-md border border-border p-3 text-sm">
            <PreviewLine label="Recebimento mensal" value={formatBRL(monthlyIncomeSourcesTotal)} />
            <PreviewLine label="Gastos fixos" value={formatBRL(fixedMonthlyTotal)} />
            <PreviewLine label="Sobra estimada" value={formatBRL(monthlyIncomeSourcesTotal - fixedMonthlyTotal)} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-4"><h3 className="font-semibold">Notas e impostos</h3><p className="text-sm text-muted-foreground">Clique no mês para avançar: sem cor, amarelo, verde.</p></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {months.map((month, index) => {
            const key = monthDate(year, index);
            const status = fiscalStatuses[key] ?? "pending";
            const className = status === "tax_paid" ? "border-primary bg-primary/20 text-foreground" : status === "invoice_requested" ? "border-amber bg-amber/20 text-foreground" : "border-border bg-background text-muted-foreground";
            return (
              <button key={month} className={"rounded-md border p-3 text-left transition hover:border-primary " + className} onClick={() => onFiscalStatusCycle(index)}>
                <span className="block text-xs font-semibold uppercase">{month.slice(0, 3)}</span>
                <span className="mt-1 block text-[11px]">{fiscalStatusLabel[status]}</span>
                <span className="mt-2 block text-xs font-semibold tabular">{formatBRL(incomeMonthTotals[index])}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function IncomeSourcesScreen(props: {
  contractSources: IncomeSourceSummary[];
  incomeForm: { name: string; monthlyAmount: string };
  manualIncomeSources: ManualIncomeSource[];
  onAddIncome: () => void;
  onIncomeFormChange: (value: { name: string; monthlyAmount: string }) => void;
  onIncomeUpdate: (id: string, patch: Partial<ManualIncomeSource>) => void;
}) {
  const activeManualTotal = props.manualIncomeSources.filter((source) => source.status === "ativo").reduce((sum, source) => sum + source.monthlyAmount, 0);
  const activeContractTotal = props.contractSources.filter((source) => source.status === "ativo").reduce((sum, source) => sum + source.monthlyAmount, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <Kpi title="Contratos ativos" value={formatBRL(activeContractTotal)} helper="fontes automáticas" />
        <Kpi title="Fontes manuais" value={formatBRL(activeManualTotal)} helper="aluguel e outras rendas" />
        <Kpi title="Total mensal" value={formatBRL(activeContractTotal + activeManualTotal)} helper="renda recorrente ativa" />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3"><h3 className="font-semibold">Adicionar fonte manual</h3><p className="text-sm text-muted-foreground">Use para aluguel, rendimentos e outras entradas recorrentes.</p></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="Nome da fonte" value={props.incomeForm.name} onChange={(event) => props.onIncomeFormChange({ ...props.incomeForm, name: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-right text-sm tabular" placeholder="Valor mensal" value={props.incomeForm.monthlyAmount} onChange={(event) => props.onIncomeFormChange({ ...props.incomeForm, monthlyAmount: event.target.value })} />
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={props.onAddIncome}><Plus size={16} /> Adicionar</button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Fontes de renda</h3><p className="text-sm text-muted-foreground">Contratos vêm sincronizados; fontes manuais podem ser ativadas ou pausadas.</p></div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Fonte</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">Mensal</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
            <tbody>
              {props.contractSources.map((source) => <tr key={source.id} className="border-t border-border"><td className="px-3 py-2"><div className="font-medium">{source.name}</div><div className="text-xs text-muted-foreground">{source.detail}</div></td><td className="px-3 py-2 text-muted-foreground">contrato</td><td className="px-3 py-2 text-right tabular">{formatBRL(source.monthlyAmount)}</td><td className="px-3 py-2"><span className="rounded-sm border border-border px-2 py-1 text-xs">{source.status}</span></td></tr>)}
              {props.manualIncomeSources.map((source) => <tr key={source.id} className="border-t border-border"><td className="px-3 py-2"><input className="h-8 w-full rounded-sm border border-border bg-background px-2" value={source.name} onChange={(event) => props.onIncomeUpdate(source.id, { name: event.target.value })} /></td><td className="px-3 py-2 text-muted-foreground">manual</td><td className="px-3 py-2 text-right"><input className="h-8 w-32 rounded-sm border border-border bg-background px-2 text-right tabular" value={source.monthlyAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => props.onIncomeUpdate(source.id, { monthlyAmount: parseBrazilianMoney(event.target.value) })} /></td><td className="px-3 py-2"><button className={source.status === "ativo" ? "h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground" : "h-8 rounded-md border border-border px-3 text-xs text-muted-foreground"} onClick={() => props.onIncomeUpdate(source.id, { status: source.status === "ativo" ? "inativo" : "ativo" })}>{source.status === "ativo" ? "Ativo" : "Reativar"}</button></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FixedExpensesScreen(props: {
  expenseForm: { name: string; monthlyAmount: string; paymentMethod: ExpensePaymentMethod; category: ExpenseCategory };
  fixedExpenses: FixedExpense[];
  fixedMonthlyTotal: number;
  onAddExpense: () => void;
  onExpenseFormChange: (value: { name: string; monthlyAmount: string; paymentMethod: ExpensePaymentMethod; category: ExpenseCategory }) => void;
  onExpenseUpdate: (id: string, patch: Partial<FixedExpense>) => void;
}) {
  const inactiveTotal = props.fixedExpenses.filter((expense) => expense.status === "inativo").reduce((sum, expense) => sum + expense.monthlyAmount, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <Kpi title="Gastos ativos" value={formatBRL(props.fixedMonthlyTotal)} helper="mensal recorrente" />
        <Kpi title="Gastos pausados" value={formatBRL(inactiveTotal)} helper="inativos" />
        <Kpi title="Itens cadastrados" value={String(props.fixedExpenses.length)} helper="controle mensal" />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3"><h3 className="font-semibold">Adicionar gasto fixo</h3><p className="text-sm text-muted-foreground">Compromissos recorrentes entram no dashboard como redutor da média mensal.</p></div>
        <div className="grid gap-2 lg:grid-cols-[1fr_12rem_12rem_14rem_auto]">
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="Nome do gasto" value={props.expenseForm.name} onChange={(event) => props.onExpenseFormChange({ ...props.expenseForm, name: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-right text-sm tabular" placeholder="Valor mensal" value={props.expenseForm.monthlyAmount} onChange={(event) => props.onExpenseFormChange({ ...props.expenseForm, monthlyAmount: event.target.value })} />
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={props.expenseForm.category} onChange={(event) => props.onExpenseFormChange({ ...props.expenseForm, category: event.target.value as ExpenseCategory })}>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={props.expenseForm.paymentMethod} onChange={(event) => props.onExpenseFormChange({ ...props.expenseForm, paymentMethod: event.target.value as ExpensePaymentMethod })}>{expensePaymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={props.onAddExpense}><Plus size={16} /> Adicionar</button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Gastos fixos</h3><p className="text-sm text-muted-foreground">Ative, pause e edite os custos mensais recorrentes.</p></div>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Gasto</th><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-left">Como é pago</th><th className="px-3 py-2 text-right">Mensal</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
            <tbody>
              {props.fixedExpenses.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nenhum gasto fixo cadastrado.</td></tr> : props.fixedExpenses.map((expense) => {
                const category = expense.category ?? "outros";
                const paymentMethod = expense.paymentMethod ?? "outro";
                return <tr key={expense.id} className="border-t border-border"><td className="px-3 py-2"><input className="h-8 w-full rounded-sm border border-border bg-background px-2" value={expense.name} onChange={(event) => props.onExpenseUpdate(expense.id, { name: event.target.value })} /></td><td className="px-3 py-2"><select className="h-8 w-40 rounded-sm border border-border bg-background px-2" value={category} onChange={(event) => props.onExpenseUpdate(expense.id, { category: event.target.value as ExpenseCategory })}>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td><td className="px-3 py-2"><select className="h-8 w-44 rounded-sm border border-border bg-background px-2" value={paymentMethod} onChange={(event) => props.onExpenseUpdate(expense.id, { paymentMethod: event.target.value as ExpensePaymentMethod })}>{expensePaymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td><td className="px-3 py-2 text-right"><input className="h-8 w-32 rounded-sm border border-border bg-background px-2 text-right tabular" value={expense.monthlyAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => props.onExpenseUpdate(expense.id, { monthlyAmount: parseBrazilianMoney(event.target.value) })} /></td><td className="px-3 py-2"><button className={expense.status === "ativo" ? "h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground" : "h-8 rounded-md border border-border px-3 text-xs text-muted-foreground"} onClick={() => props.onExpenseUpdate(expense.id, { status: expense.status === "ativo" ? "inativo" : "ativo" })}>{expense.status === "ativo" ? "Ativo" : "Reativar"}</button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ContractsScreen(props: {
  agencies: Agency[];
  clients: Client[];
  contractForm: {
    agencyName: string;
    clientName: string;
    countryRegion: string;
    billingType: BillingType;
    currency: Currency;
    monthlyRate: string;
    hourlyRate: string;
    estimatedMonthlyHours: string;
    fxRateRef: string;
    monthlyRateBrlRef: string;
    startedAt: string;
    endedAt: string;
  };
  contracts: Contract[];
  onAddContract: () => void;
  onClientNameChange: (contract: Contract, name: string) => void;
  onContractFormChange: (value: PropsContractForm) => void;
  onContractMoneyChange: (contract: Contract, field: "monthlyRate" | "hourlyRate" | "fxRateRef" | "monthlyRateBrlRef", raw: string) => void;
  onContractUpdate: (contractId: string, patch: Partial<Contract>) => void;
  onContractAgencyNameChange: (contract: Contract, name: string) => void;
  onToggleContractStatus: (contract: Contract) => void;
}) {
  const { agencies, clients, contractForm, contracts } = props;
  const sortedContracts = [...contracts].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ativo" ? -1 : 1;
    return contractBrlReference(b) - contractBrlReference(a);
  });
  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Adicionar contrato</h3>
          <CalendarDays size={17} className="text-muted-foreground" />
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="Agência" value={contractForm.agencyName} onChange={(event) => props.onContractFormChange({ ...contractForm, agencyName: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="Cliente final" value={contractForm.clientName} onChange={(event) => props.onContractFormChange({ ...contractForm, clientName: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="País/Região" value={contractForm.countryRegion} onChange={(event) => props.onContractFormChange({ ...contractForm, countryRegion: event.target.value })} />
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={contractForm.billingType} onChange={(event) => props.onContractFormChange({ ...contractForm, billingType: event.target.value as BillingType })}><option value="mensal">Mensal fixo</option><option value="hora">Por hora</option></select>
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={contractForm.currency} onChange={(event) => props.onContractFormChange({ ...contractForm, currency: event.target.value as Currency })}>{(["USD", "EUR", "GBP", "BRL"] as Currency[]).map((currency) => <option key={currency}>{currency}</option>)}</select>
          {contractForm.billingType === "mensal" ? <input className="h-9 rounded-md border border-border bg-background px-3 text-sm tabular" placeholder="Valor mensal" value={contractForm.monthlyRate} onChange={(event) => props.onContractFormChange({ ...contractForm, monthlyRate: event.target.value })} /> : <>
            <input className="h-9 rounded-md border border-border bg-background px-3 text-sm tabular" placeholder="Valor por hora" value={contractForm.hourlyRate} onChange={(event) => props.onContractFormChange({ ...contractForm, hourlyRate: event.target.value })} />
            <input className="h-9 rounded-md border border-border bg-background px-3 text-sm tabular" placeholder="Horas/mês" value={contractForm.estimatedMonthlyHours} onChange={(event) => props.onContractFormChange({ ...contractForm, estimatedMonthlyHours: event.target.value })} />
          </>}
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm tabular disabled:opacity-50" disabled={contractForm.currency === "BRL"} placeholder="Cotação" value={contractForm.fxRateRef} onChange={(event) => props.onContractFormChange({ ...contractForm, fxRateRef: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm tabular" placeholder="Ref. mensal em R$" value={contractForm.monthlyRateBrlRef} onChange={(event) => props.onContractFormChange({ ...contractForm, monthlyRateBrlRef: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" type="date" value={contractForm.startedAt} onChange={(event) => props.onContractFormChange({ ...contractForm, startedAt: event.target.value })} />
          <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" type="date" value={contractForm.endedAt} onChange={(event) => props.onContractFormChange({ ...contractForm, endedAt: event.target.value })} />
        </div>
        <button className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={props.onAddContract}><Plus size={16} /> Adicionar contrato</button>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Contratos cadastrados</h3><p className="text-sm text-muted-foreground">Editar aqui altera imediatamente o roster e as referências do extrato anual.</p></div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Agência</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">País/Região</th><th className="px-3 py-2 text-left">Modelo</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2 text-right">Cotação</th><th className="px-3 py-2 text-right">Ref. R$/mês</th><th className="px-3 py-2 text-left">Início</th><th className="px-3 py-2 text-left">Fim</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
            <tbody>{sortedContracts.map((contract) => {
              const agency = agencies.find((item) => item.id === contract.agencyId);
              const client = clients.find((item) => item.id === contract.clientId);
              return (
                <tr key={contract.id} className="border-t border-border">
                  <td className="px-3 py-2"><input className="h-8 w-44 rounded-sm border border-border bg-background px-2" defaultValue={agency?.name ?? ""} onBlur={(event) => props.onContractAgencyNameChange(contract, event.target.value)} /><ColorDot color={agency?.colorHex ?? "#94a3b8"} /></td>
                  <td className="px-3 py-2"><input className="h-8 w-44 rounded-sm border border-border bg-background px-2" defaultValue={client?.name ?? ""} onBlur={(event) => props.onClientNameChange(contract, event.target.value)} /></td>
                  <td className="px-3 py-2"><input className="h-8 w-40 rounded-sm border border-border bg-background px-2" defaultValue={contract.countryRegion} onBlur={(event) => props.onContractUpdate(contract.id, { countryRegion: event.target.value })} /></td>
                  <td className="px-3 py-2"><div className="flex gap-1"><select className="h-8 w-24 rounded-sm border border-border bg-background px-2" value={contract.billingType} onChange={(event) => props.onContractUpdate(contract.id, { billingType: event.target.value as BillingType })}><option value="mensal">mensal</option><option value="hora">hora</option></select><select className="h-8 w-20 rounded-sm border border-border bg-background px-2" value={contract.currency} onChange={(event) => props.onContractUpdate(contract.id, { currency: event.target.value as Currency })}>{(["USD", "EUR", "GBP", "BRL"] as Currency[]).map((currency) => <option key={currency}>{currency}</option>)}</select></div></td>
                  <td className="px-3 py-2 text-right"><input className="h-8 w-32 rounded-sm border border-border bg-background px-2 text-right tabular" defaultValue={(contract.billingType === "hora" ? contract.hourlyRate ?? 0 : contract.monthlyRate).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onBlur={(event) => props.onContractMoneyChange(contract, contract.billingType === "hora" ? "hourlyRate" : "monthlyRate", event.target.value)} /></td>
                  <td className="px-3 py-2 text-right"><input className="h-8 w-24 rounded-sm border border-border bg-background px-2 text-right tabular disabled:opacity-40" disabled={contract.billingType === "mensal"} defaultValue={String(contract.estimatedMonthlyHours ?? 0).replace(".", ",")} onBlur={(event) => props.onContractUpdate(contract.id, { estimatedMonthlyHours: Number(event.target.value.replace(",", ".")) || 0 })} /></td>
                  <td className="px-3 py-2 text-right"><input className="h-8 w-24 rounded-sm border border-border bg-background px-2 text-right tabular disabled:opacity-40" disabled={contract.currency === "BRL"} defaultValue={contract.fxRateRef ? contract.fxRateRef.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : ""} onBlur={(event) => props.onContractMoneyChange(contract, "fxRateRef", event.target.value)} /></td>
                  <td className="px-3 py-2 text-right"><input key={`${contract.id}-${contractBrlReference(contract)}`} className="h-8 w-32 rounded-sm border border-border bg-background px-2 text-right tabular" defaultValue={contractBrlReference(contract).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onBlur={(event) => props.onContractMoneyChange(contract, "monthlyRateBrlRef", event.target.value)} /></td>
                  <td className="px-3 py-2"><input className="h-8 rounded-sm border border-border bg-background px-2" type="date" value={contract.startedAt} onChange={(event) => props.onContractUpdate(contract.id, { startedAt: event.target.value })} /></td>
                  <td className="px-3 py-2"><input className="h-8 rounded-sm border border-border bg-background px-2" type="date" value={contract.endedAt ?? ""} onChange={(event) => props.onContractUpdate(contract.id, { endedAt: event.target.value || undefined, status: event.target.value ? "encerrado" : "ativo" })} /></td>
                  <td className="px-3 py-2"><button className={`h-8 rounded-md px-3 text-xs font-medium ${contract.status === "ativo" ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`} onClick={() => props.onToggleContractStatus(contract)}>{contract.status === "ativo" ? "Ativo" : "Reativar"}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type PropsContractForm = Parameters<typeof ContractsScreen>[0]["contractForm"];

function StatementsScreen(props: {
  agencies: Agency[];
  availableYears: number[];
  clients: Client[];
  contractsForYear: Contract[];
  filter: string;
  monthTotals: number[];
  onCellUpdate: (contract: Contract, monthIndex: number, raw: string) => void;
  onFilterChange: (value: string) => void;
  onYearChange: (value: number) => void;
  payments: Payment[];
  year: number;
  yearTotal: number;
}) {
  const maxAgencyNameLength = Math.max(
    10,
    ...props.contractsForYear.map((contract) => props.agencies.find((agency) => agency.id === contract.agencyId)?.name.length ?? 0)
  );
  const firstColumnWidth = `clamp(11rem, ${maxAgencyNameLength + 8}ch, 16rem)`;
  const contractColumnWidth = "10rem";
  const monthColumnWidth = "4.7rem";
  const totalColumnWidth = "7rem";

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div><h3 className="font-semibold">Extrato anual</h3><p className="text-sm text-muted-foreground">Escolha o ano corrente ou anos anteriores. O roster vem dos contratos e da vigência cadastrada.</p></div>
        <div className="flex flex-wrap gap-2">
          <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={props.year} onChange={(event) => props.onYearChange(Number(event.target.value))}>{props.availableYears.map((item) => <option key={item}>{item}</option>)}</select>
          <label className="flex h-9 min-w-64 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm"><Search size={16} className="text-muted-foreground" /><input className="w-full bg-transparent outline-none" placeholder="Filtrar agência, cliente ou país" value={props.filter} onChange={(event) => props.onFilterChange(event.target.value)} /></label>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted"><tr className="text-xs text-muted-foreground"><th className="sticky left-0 z-30 border-b border-r border-border bg-muted px-3 py-2 text-left" style={{ width: firstColumnWidth, minWidth: firstColumnWidth, maxWidth: firstColumnWidth }}>Agência | Cliente | País</th><th className="sticky z-30 border-b border-r border-border bg-muted px-3 py-2 text-right" style={{ left: firstColumnWidth, width: contractColumnWidth, minWidth: contractColumnWidth, maxWidth: contractColumnWidth }}>Contrato</th>{months.map((month) => <th key={month} className="border-b border-r border-border px-1.5 py-2 text-right capitalize" style={{ width: monthColumnWidth }}>{month.slice(0, 3)}</th>)}<th className="border-b border-border px-2 py-2 text-right" style={{ width: totalColumnWidth }}>Total anual</th></tr></thead>
          <tbody>
            {props.contractsForYear.length === 0 ? <tr><td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">Nenhum contrato vigente para este ano.</td></tr> : props.contractsForYear.map((contract) => {
              const agency = props.agencies.find((item) => item.id === contract.agencyId);
              const client = props.clients.find((item) => item.id === contract.clientId);
              const rate = formatContractRate(contract);
              return (
                <tr key={contract.id} className="border-b border-border">
                  <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-medium" style={{ width: firstColumnWidth, minWidth: firstColumnWidth, maxWidth: firstColumnWidth }}><div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: agency?.colorHex ?? "#94a3b8" }} /><span>{agency?.name ?? "Agência"}</span><span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{contract.status}</span></div><div className="mt-1 text-xs font-normal text-muted-foreground">{client?.name ?? "Sem cliente"} · {contract.countryRegion}</div></th>
                  <td className="sticky z-10 border-b border-r border-border bg-card px-2 py-2 text-right tabular" style={{ left: firstColumnWidth, width: contractColumnWidth, minWidth: contractColumnWidth, maxWidth: contractColumnWidth }}><div className="font-semibold">{rate.primary}</div><div className="text-[11px] text-muted-foreground">{rate.secondary} · {formatBRL(contractBrlReference(contract))}</div></td>
                  {months.map((month, index) => {
                    const active = isContractActiveInMonth(contract, props.year, index);
                    const amount = paymentFor(contract.id, props.payments, props.year, index);
                    const variance = fxVariance(contract, amount);
                    return (
                      <td key={month} className={`border-b border-r border-border px-1.5 py-1.5 text-right ${active ? "" : "hatch opacity-50"}`} style={active && amount > 0 ? { backgroundColor: `${agency?.colorHex ?? "#94a3b8"}24` } : undefined}>
                        <input className={`h-8 w-full rounded-sm border px-1 text-right text-xs tabular outline-none ${active ? "border-border bg-background/70 focus:border-primary" : "border-transparent bg-transparent"}`} disabled={!active} defaultValue={amount > 0 ? amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""} onBlur={(event) => props.onCellUpdate(contract, index, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                        {variance && <div className={`mt-0.5 text-[10px] ${variance.diff >= 0 ? "text-primary" : "text-danger"}`}>{variance.diff >= 0 ? "+" : ""}{formatBRL(variance.diff)}</div>}
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-2 py-2 text-right text-sm font-semibold tabular" style={{ width: totalColumnWidth }}>{formatBRL(contractAnnualTotal(contract, props.payments, props.year))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted font-semibold"><tr><td className="sticky left-0 z-20 border-t border-r border-border bg-muted px-3 py-2" style={{ width: firstColumnWidth, minWidth: firstColumnWidth, maxWidth: firstColumnWidth }}>Total mensal</td><td className="sticky z-20 border-t border-r border-border bg-muted px-2 py-2 text-right" style={{ left: firstColumnWidth, width: contractColumnWidth, minWidth: contractColumnWidth, maxWidth: contractColumnWidth }}>{formatBRL(props.yearTotal)}</td>{props.monthTotals.map((total, index) => <td key={months[index]} className="border-t border-r border-border px-1.5 py-2 text-right text-sm tabular" style={{ width: monthColumnWidth }}>{formatBRL(total)}</td>)}<td className="border-t border-border px-2 py-2 text-right text-sm tabular" style={{ width: totalColumnWidth }}>{formatBRL(props.yearTotal)}</td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}



function TaxScreen({
  distributions,
  form,
  onAddMonth,
  onFormChange,
  onRemove,
  onTaxSettingsChange,
  onUpdate,
  taxSettings,
  year
}: {
  distributions: Distribution[];
  form: { sourceEntity: string; paidAt: string; referenceMonth: string; amount: string; description: string };
  onAddMonth: (monthIndex: number, raw: string) => boolean;
  onFormChange: (value: { sourceEntity: string; paidAt: string; referenceMonth: string; amount: string; description: string }) => void;
  onRemove: (id: string) => void;
  onTaxSettingsChange: (value: TaxSettings) => void;
  onUpdate: (id: string, patch: Partial<Distribution>) => void;
  taxSettings: TaxSettings;
  year: number;
}) {
  const [simulatedAmount, setSimulatedAmount] = useState("60000");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const simulated = parseBrazilianMoney(simulatedAmount);
  const simulatedTax = irrfBySourceMonth([{ id: "sim", paidAt: monthDate(year, 0), referenceMonth: monthDate(year, 0), amount: simulated, kind: "dividendos", sourceEntity: "sim" }], "sim", monthDate(year, 0), taxSettings);
  const splitTax = irrfBySourceMonth([{ id: "sim_a", paidAt: monthDate(year, 0), referenceMonth: monthDate(year, 0), amount: Math.min(simulated, taxSettings.monthlyThreshold), kind: "dividendos", sourceEntity: "sim" }], "sim", monthDate(year, 0), taxSettings).imposto + irrfBySourceMonth([{ id: "sim_b", paidAt: monthDate(year, 1), referenceMonth: monthDate(year, 1), amount: Math.max(simulated - taxSettings.monthlyThreshold, 0), kind: "dividendos", sourceEntity: "sim" }], "sim", monthDate(year, 1), taxSettings).imposto;
  const currentDate = new Date();
  const currentMonthIndex = currentDate.getMonth();
  const currentReferenceMonth = monthDate(year, currentMonthIndex);
  const currentMonthRows = distributions.filter((item) => item.referenceMonth === currentReferenceMonth);
  const currentMonthTotal = currentMonthRows.reduce((sum, item) => sum + item.amount, 0);
  const currentMonthTax = irrfTotalForMonth(distributions, currentReferenceMonth, taxSettings);
  const progress = taxSettings.monthlyThreshold > 0 ? (currentMonthTotal / taxSettings.monthlyThreshold) * 100 : 0;
  const thresholdDelta = currentMonthTotal - taxSettings.monthlyThreshold;
  const meterMax = Math.max(taxSettings.monthlyThreshold * 2, 1);
  const meterProgress = Math.min((currentMonthTotal / meterMax) * 100, 100);
  const thresholdPosition = Math.min((taxSettings.monthlyThreshold / meterMax) * 100, 100);
  const hue = Math.max(0, Math.min(142 - progress * 1.42, 142));
  const meterColor = `hsl(${hue} 72% 46%)`;
  const annualEntryTotal = distributions.filter((item) => item.referenceMonth.startsWith(String(year))).reduce((sum, item) => sum + item.amount, 0);
  const annualIrrf = months.reduce((sum, _month, index) => sum + irrfTotalForMonth(distributions, monthDate(year, index), taxSettings), 0);

  function rowsForMonth(monthIndex: number) {
    const referenceMonth = monthDate(year, monthIndex);
    return distributions.filter((item) => item.referenceMonth === referenceMonth).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  }

  function addDraft(monthIndex: number) {
    const raw = drafts[monthIndex] ?? "";
    if (!raw.trim()) return;
    if (onAddMonth(monthIndex, raw)) setDrafts((current) => ({ ...current, [monthIndex]: "" }));
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <Kpi title="Entradas no mês" value={formatBRL(currentMonthTotal)} helper={`${months[currentMonthIndex]} de ${year}`} />
        <Kpi title="Imposto do mês" value={formatBRL(currentMonthTax)} helper="estimativa sobre lançamentos" />
        <Kpi title="IRRF acumulado no ano" value={formatBRL(annualIrrf)} helper="estimativa retida" />
        <Kpi title="Entradas no ano" value={formatBRL(annualEntryTotal)} helper="base estimada de imposto" />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-2 flex items-start justify-between gap-3 text-sm"><div><span>Semáforo de {months[currentMonthIndex]} de {year}</span><div className="mt-1 text-2xl font-semibold tabular">{formatBRL(currentMonthTotal)}</div></div><span className="tabular">{progress.toFixed(0)}% do teto</span></div>
        <div className="relative h-3 overflow-hidden rounded-sm bg-muted">
          <div className="h-full transition-all" style={{ width: String(meterProgress) + "%", backgroundColor: meterColor }} />
          <span className="absolute top-0 h-full w-px bg-foreground/70" style={{ left: String(thresholdPosition) + "%" }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span className={thresholdDelta > 0 ? "text-danger" : ""}>{thresholdDelta > 0 ? `${formatBRL(thresholdDelta)} acima do teto` : `${formatBRL(Math.abs(thresholdDelta))} até o teto`}</span><span>Teto {formatBRL(taxSettings.monthlyThreshold)}</span><span>{formatBRL(meterMax)}</span></div>
        {currentMonthTotal > taxSettings.monthlyThreshold && <p className="mt-2 text-sm text-danger">Acima do teto: o imposto é calculado sobre o total do mês, não sobre o excedente.</p>}
      </section>


      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4"><h3 className="font-semibold">Entradas da Sheijo Tecnologia em {year}</h3><p className="text-sm text-muted-foreground">Lance cada entrada na coluna do mês. Enter adiciona; valores existentes podem ser editados ou removidos.</p></div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1320px] table-fixed text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr><th colSpan={12} className="border-b border-border px-3 py-2 text-center text-foreground">ENTRADAS DA SHEIJO TECNOLOGIA</th></tr>
              <tr>{months.map((month) => <th key={month} className="border-r border-border px-2 py-2 text-center font-semibold uppercase last:border-r-0">{month.slice(0, 3)}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                {months.map((month, index) => {
                  const monthRows = rowsForMonth(index);
                  return (
                    <td key={month} className="h-56 align-top border-r border-border p-2 last:border-r-0">
                      <div className="space-y-1.5">
                        {monthRows.map((item) => (
                          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-1">
                            <input
                              aria-label={'Valor de ' + month}
                              className="h-8 min-w-0 rounded-sm border border-border bg-background px-2 text-right text-xs tabular outline-none focus:border-primary"
                              defaultValue={item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              onChange={(event) => onUpdate(item.id, { amount: parseBrazilianMoney(event.target.value) })}
                              onBlur={(event) => onUpdate(item.id, { amount: parseBrazilianMoney(event.target.value) })}
                              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                            />
                            <button className="h-8 w-7 rounded-sm border border-border text-xs text-muted-foreground hover:text-danger" onClick={() => onRemove(item.id)} aria-label="Remover saída">×</button>
                          </div>
                        ))}
                        <input
                          className="h-8 w-full rounded-sm border border-dashed border-border bg-background/70 px-2 text-right text-xs tabular outline-none placeholder:text-muted-foreground focus:border-primary"
                          placeholder="+ valor"
                          value={drafts[index] ?? ""}
                          onChange={(event) => setDrafts((current) => ({ ...current, [index]: event.target.value }))}
                          onBlur={() => addDraft(index)}
                          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
            <tfoot className="bg-muted font-semibold">
              <tr>{months.map((month, index) => { const rows = rowsForMonth(index); const total = rows.reduce((sum, item) => sum + item.amount, 0); return <td key={month} className="border-t border-r border-border px-2 py-2 text-center text-primary tabular last:border-r-0">{formatBRL(total)}</td>; })}</tr>
              <tr>{months.map((month, index) => <td key={month} className="border-r border-border px-2 py-1 text-center text-xs font-normal text-muted-foreground last:border-r-0">Imposto devido</td>)}</tr>
              <tr>{months.map((month, index) => { const irrf = irrfTotalForMonth(distributions, monthDate(year, index), taxSettings); return <td key={month} className={'border-r border-border px-2 py-2 text-center text-xs tabular last:border-r-0 ' + (irrf > 0 ? 'text-danger' : 'text-muted-foreground')}>{formatBRL(irrf)}</td>; })}</tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Grade fiscal resumida</h3>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2 text-right">Total lançado</th><th className="px-3 py-2 text-right">Imposto</th><th className="px-3 py-2 text-left">Alerta</th></tr></thead>
              <tbody>{months.map((month, index) => {
                const referenceMonth = monthDate(year, index);
                const rows = rowsForMonth(index);
                const total = rows.reduce((sum, item) => sum + item.amount, 0);
                const irrf = irrfTotalForMonth(distributions, referenceMonth, taxSettings);
                const deadZone = rows.some((item) => isDeadZoneAmount(irrfBySourceMonth(distributions, item.sourceEntity, referenceMonth, taxSettings).total, taxSettings));
                const rowClass = "border-t border-border " + (deadZone ? "bg-danger/10" : irrf > 0 ? "bg-amber/10" : "");
                return <tr key={month} className={rowClass}><td className="px-3 py-2 capitalize">{month}</td><td className="px-3 py-2 text-right tabular">{formatBRL(total)}</td><td className="px-3 py-2 text-right tabular">{formatBRL(irrf)}</td><td className="px-3 py-2 text-muted-foreground">{deadZone ? "faixa morta" : irrf > 0 ? "acima do teto" : ""}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold">Simulador</h3>
          <input className="mb-3 h-9 w-full rounded-md border border-border bg-background px-3 text-right text-sm tabular" value={simulatedAmount} onChange={(event) => setSimulatedAmount(event.target.value)} />
          <PreviewLine label="IRRF se tirar agora" value={formatBRL(simulatedTax.imposto)} />
          <PreviewLine label="Líquido agora" value={formatBRL(simulated - simulatedTax.imposto)} />
          <PreviewLine label="Economia dividindo em 50k + mês seguinte" value={formatBRL(Math.max(simulatedTax.imposto - splitTax, 0))} />
          <PreviewLine label="Planilha antiga sobre excedente" value={formatBRL(irrfSobreExcedenteLegado(simulated, taxSettings))} />
          <PreviewLine label="Diferença para regra correta" value={formatBRL(simulatedTax.imposto - irrfSobreExcedenteLegado(simulated, taxSettings))} />
          {isDeadZoneAmount(simulated, taxSettings) && <p className="mt-3 rounded-md border border-danger p-3 text-sm text-danger">Este valor cai na faixa morta: o líquido pode ficar menor do que retirar exatamente R$ 50.000,00.</p>}
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Configurações fiscais</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs text-muted-foreground">Teto mensal<input className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-right text-sm tabular" value={String(taxSettings.monthlyThreshold).replace(".", ",")} onChange={(event) => onTaxSettingsChange({ ...taxSettings, monthlyThreshold: parseBrazilianMoney(event.target.value) })} /></label>
          <label className="text-xs text-muted-foreground">Alíquota IRRF<input className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-right text-sm tabular" value={String(taxSettings.irrfRate * 100).replace(".", ",")} onChange={(event) => onTaxSettingsChange({ ...taxSettings, irrfRate: (Number(event.target.value.replace(",", ".")) || 0) / 100 })} /></label>
          <label className="text-xs text-muted-foreground">IRPFM início<input className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-right text-sm tabular" value={String(taxSettings.irpfmAnnualThreshold).replace(".", ",")} onChange={(event) => onTaxSettingsChange({ ...taxSettings, irpfmAnnualThreshold: parseBrazilianMoney(event.target.value) })} /></label>
          <label className="text-xs text-muted-foreground">IRPFM teto<input className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-right text-sm tabular" value={String(taxSettings.irpfmUpperBound).replace(".", ",")} onChange={(event) => onTaxSettingsChange({ ...taxSettings, irpfmUpperBound: parseBrazilianMoney(event.target.value) })} /></label>
        </div>
      </section>

      <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">Estimativa para planejamento pessoal. Não substitui orientação contábil. Confirme com seu contador antes de qualquer decisão fiscal.</p>
    </div>
  );
}

function ImportScreen({ csv, onApplyImport, onCsvChange, onCsvFile, onPreview, preview }: { csv: string; onApplyImport: () => void; onCsvChange: (value: string) => void; onCsvFile: (file?: File) => void; onPreview: () => void; preview: ImportState }) {
  return (
    <section className="grid gap-3 xl:grid-cols-[1fr_0.8fr]">
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Importador da grade anual</h3><Upload size={17} className="text-muted-foreground" /></div>
        <textarea className="min-h-44 w-full rounded-md border border-border bg-background p-3 text-sm tabular outline-none focus:border-primary" placeholder={"Cole CSV com cabeçalho: Agência;janeiro;fevereiro;..."} value={csv} onChange={(event) => onCsvChange(event.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-sm"><Upload size={16} /> Upload CSV<input className="hidden" type="file" accept=".csv,text/csv,text/plain" onChange={(event) => onCsvFile(event.target.files?.[0])} /></label><button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm" onClick={onPreview}><ChevronDown size={16} /> Pré-visualizar</button><button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!preview} onClick={onApplyImport}><Check size={16} /> Confirmar importação</button></div>
      </div>
      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Prévia</h3>
        {preview ? <div className="space-y-3 text-sm"><PreviewLine label="Linhas lidas" value={String(preview.rows)} /><PreviewLine label="Agências detectadas" value={String(preview.createdAgencies.length)} /><PreviewLine label="Pagamentos válidos" value={String(preview.payments.length)} /><PreviewLine label="Descartes" value={String(preview.discarded.length)} /><div className="rounded-md border border-border p-3"><p className="mb-2 text-xs uppercase text-muted-foreground">Amostra</p>{preview.payments.slice(0, 5).map((payment, index) => <div key={`${payment.agencyName}-${payment.monthIndex}-${index}`} className="flex justify-between border-t border-border py-1 first:border-t-0"><span>{payment.agencyName} · {months[payment.monthIndex]}</span><span className="tabular">{formatBRL(payment.amount)}</span></div>)}</div></div> : <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground"><AlertTriangle className="mb-2" size={18} />Nenhum dado falso será criado. Cole um CSV e rode a prévia antes de confirmar.</div>}
      </div>
    </section>
  );
}

function Kpi({ title, value, helper }: { title: string; value: string; helper: string }) {
  return <div className="rounded-md border border-border bg-card p-4"><p className="text-xs uppercase text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-semibold tabular">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div>;
}

function ColorDot({ color }: { color: string }) {
  return <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: color }} />;
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-border pb-2"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular">{value}</span></div>;
}
