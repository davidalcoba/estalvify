import { describe, it, expect } from "vitest";
import {
  isCashWithdrawal,
  isCardSettlement,
  traceabilityForMonth,
} from "./traceability";

describe("classifiers", () => {
  it("matches the bank's ATM wording", () => {
    expect(
      isCashWithdrawal(null, "RET. EFECTIVO A DEBITO CON TARJ. EN CAJERO. AUT.")
    ).toBe(true);
    expect(isCashWithdrawal("RETIRADA EN CAJERO BBVA", null)).toBe(true);
    expect(isCashWithdrawal("MERCADONA", "PAGO CON TARJETA")).toBe(false);
  });

  it("matches the monthly card settlement wording", () => {
    expect(isCardSettlement(null, "ADEUDO MENSUAL DE TARJETA")).toBe(true);
    expect(isCardSettlement("NETFLIX", null)).toBe(false);
  });
});

describe("traceabilityForMonth", () => {
  it("computes the untracked share (~7% real case)", () => {
    const t = traceabilityForMonth([
      { amount: 380, description: null, remittanceInfo: "RET. EFECTIVO A DEBITO CON TARJ. EN CAJERO. AUT." },
      { amount: 188, description: null, remittanceInfo: "ADEUDO MENSUAL DE TARJETA" },
      { amount: 7500, description: "REST OF THE MONTH", remittanceInfo: null },
    ]);
    expect(t.cashWithdrawn).toBe(380);
    expect(t.cardSettled).toBe(188);
    expect(t.untracked).toBe(568);
    expect(t.untrackedRatio).toBeCloseTo(568 / 8068, 3);
  });

  it("categorized split lines shrink the untracked amount", () => {
    const t = traceabilityForMonth([
      {
        amount: 380,
        description: null,
        remittanceInfo: "RET. EFECTIVO EN CAJERO",
        categorizedSplitTotal: 300,
      },
      { amount: 620, description: "SHOPS", remittanceInfo: null },
    ]);
    expect(t.explained).toBe(300);
    expect(t.untracked).toBe(80);
  });

  it("a split can never explain more than the row itself", () => {
    const t = traceabilityForMonth([
      {
        amount: 100,
        description: null,
        remittanceInfo: "RET. EFECTIVO EN CAJERO",
        categorizedSplitTotal: 150,
      },
    ]);
    expect(t.untracked).toBe(0);
  });

  it("zero spend gives a zero ratio", () => {
    expect(traceabilityForMonth([]).untrackedRatio).toBe(0);
  });
});
