import { describe, it, expect } from "vitest";
import {
  looksLikeTransfer,
  monthTransferActivity,
  netSavingsChange,
} from "./savings";

describe("looksLikeTransfer", () => {
  it("matches the bank's TRASPASO wording on either descriptor", () => {
    expect(
      looksLikeTransfer({
        direction: "CREDIT",
        amount: 1000,
        description: null,
        remittanceInfo: "TRASPASO",
      })
    ).toBe(true);
    expect(
      looksLikeTransfer({
        direction: "CREDIT",
        amount: 1000,
        description: "TRASPASO DESDE CUENTA DAVID ALCOBA CASARES",
        remittanceInfo: null,
      })
    ).toBe(true);
  });

  it("trusts a TRANSFER categorization even without the wording", () => {
    expect(
      looksLikeTransfer({
        direction: "CREDIT",
        amount: 50,
        description: "BIZUM INTERNO",
        remittanceInfo: null,
        categoryKind: "TRANSFER",
      })
    ).toBe(true);
  });

  it("ignores ordinary rows", () => {
    expect(
      looksLikeTransfer({
        direction: "DEBIT",
        amount: 20,
        description: "MERCADONA",
        remittanceInfo: "PAGO CON TARJETA EN SUPERMERCADOS",
      })
    ).toBe(false);
  });
});

describe("monthTransferActivity", () => {
  it("separates churn from real inflow — July's reactive transfers", () => {
    // July on Estalvis: 1000 + 475 + 100 + 100 moved OUT to cover Despeses,
    // 800 moved in. Transfers ran, but the account bled.
    const activity = monthTransferActivity([
      { direction: "DEBIT", amount: 1000, description: null, remittanceInfo: "TRASPASO" },
      { direction: "DEBIT", amount: 475, description: null, remittanceInfo: "TRASPASO" },
      { direction: "DEBIT", amount: 100, description: null, remittanceInfo: "TRASPASO" },
      { direction: "DEBIT", amount: 100, description: null, remittanceInfo: "TRASPASO" },
      { direction: "CREDIT", amount: 800, description: null, remittanceInfo: "TRASPASO" },
      { direction: "DEBIT", amount: 60, description: "GASOLINERA", remittanceInfo: null },
    ]);
    expect(activity.transferredIn).toBe(800);
    expect(activity.transferredOut).toBe(1675);
    expect(activity.executed).toBe(true);
  });

  it("no transfers means not executed", () => {
    expect(monthTransferActivity([]).executed).toBe(false);
  });
});

describe("netSavingsChange", () => {
  it("is the balance delta, not the transfer sum", () => {
    expect(netSavingsChange(46265, 45390)).toBe(-875);
  });

  it("is null when a snapshot is missing", () => {
    expect(netSavingsChange(null, 46265)).toBeNull();
    expect(netSavingsChange(46265, null)).toBeNull();
  });
});
