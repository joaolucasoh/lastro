import assert from "node:assert/strict";
import test from "node:test";
import {
  contractBrlReference,
  isContractActiveInMonth,
  parseAnnualRevenueCsv,
  parseBrazilianMoney,
  seedContracts
} from "../lib/lastro.ts";

test("parseBrazilianMoney aceita formatos brasileiros e estrangeiros", () => {
  assert.equal(parseBrazilianMoney("R$ 36.799,99"), 36799.99);
  assert.equal(parseBrazilianMoney("36799,99"), 36799.99);
  assert.equal(parseBrazilianMoney("US$ 4.400,00"), 4400);
  assert.equal(parseBrazilianMoney("36799.99"), 36799.99);
});

test("contrato só fica editável dentro da vigência mensal", () => {
  const contract = seedContracts.find((item) => item.id === "ct_worknomads_fintech");
  assert.ok(contract);
  assert.equal(isContractActiveInMonth(contract, 2024, 8), false);
  assert.equal(isContractActiveInMonth(contract, 2024, 9), true);
});

test("importador da grade anual detecta meses e ignora totais", () => {
  const preview = parseAnnualRevenueCsv("Agência;janeiro;fevereiro\nWorkNomads;R$ 10.000,00;12000,50\nTotal;10000;12000");
  assert.deepEqual(preview.createdAgencies, ["WorkNomads"]);
  assert.equal(preview.payments.length, 2);
  assert.equal(preview.payments[1].amount, 12000.5);
  assert.equal(preview.discarded.length, 1);
});

test("contrato por hora em BRL calcula referência mensal por horas estimadas", () => {
  const contract = seedContracts.find((item) => item.id === "ct_starbucks_hourly");
  assert.ok(contract);
  assert.equal(contractBrlReference(contract), 34400);
});

import {
  defaultTaxSettings,
  irpfmAnnualRate,
  irrfBySourceMonth,
  irrfDoMes
} from "../lib/lastro.ts";

test("IRRF mensal segue o teto por total do mês", () => {
  assert.equal(irrfDoMes([50000], defaultTaxSettings).imposto, 0);
  assert.equal(irrfDoMes([50000.01], defaultTaxSettings).imposto, 5000);
  assert.equal(irrfDoMes([30000, 25000], defaultTaxSettings).imposto, 5500);
  assert.equal(irrfDoMes([67375], defaultTaxSettings).imposto, 6737.5);
  assert.equal(irrfDoMes([46931.4], defaultTaxSettings).imposto, 0);
});

test("IRRF soma todos os lançamentos e separa pagadoras", () => {
  assert.equal(irrfBySourceMonth([
    { id: "a", paidAt: "2026-01-01", referenceMonth: "2026-01-01", amount: 40000, kind: "dividendos", sourceEntity: "PJ 1" },
    { id: "b", paidAt: "2026-01-01", referenceMonth: "2026-01-01", amount: 20000, kind: "pro_labore", sourceEntity: "PJ 1" }
  ], "PJ 1", "2026-01-01").imposto, 6000);

  const distributions = [
    { id: "a", paidAt: "2026-01-01", referenceMonth: "2026-01-01", amount: 40000, kind: "dividendos" as const, sourceEntity: "PJ 1" },
    { id: "b", paidAt: "2026-01-01", referenceMonth: "2026-01-01", amount: 40000, kind: "reembolso" as const, sourceEntity: "PJ 2" }
  ];
  assert.equal(irrfBySourceMonth(distributions, "PJ 1", "2026-01-01").imposto, 0);
  assert.equal(irrfBySourceMonth(distributions, "PJ 2", "2026-01-01").imposto, 0);
});

test("IRPFM anual estima aliquota progressiva", () => {
  assert.equal(irpfmAnnualRate(600000), 0);
  assert.equal(irpfmAnnualRate(900000), 0.05);
  assert.equal(irpfmAnnualRate(1200000), 0.1);
});

import {
  additionalIrrfForDistribution,
  irrfSobreExcedenteLegado
} from "../lib/lastro.ts";

test("IRRF adicional recalcula sobre acumulado do mês", () => {
  assert.equal(additionalIrrfForDistribution(30000, 25000), 5500);
  assert.equal(additionalIrrfForDistribution(50000, 0.01), 5000);
});

test("comparador legado calcula apenas sobre excedente", () => {
  assert.equal(irrfSobreExcedenteLegado(67375), 1737.5);
  assert.equal(irrfDoMes([67375]).imposto - irrfSobreExcedenteLegado(67375), 5000);
});
