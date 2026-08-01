import { describe, it, expect } from "vitest";
import { buildExternalId, parseRemittanceFields } from "./transaction-parse";
import type { EnableBankingTransaction } from "./enable-banking";

// Minimal factory for a transaction, overridable per test.
function tx(overrides: Partial<EnableBankingTransaction> = {}): EnableBankingTransaction {
  return {
    transaction_amount: { amount: "12.34", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    ...overrides,
  };
}

describe("buildExternalId", () => {
  it("prefers the explicit transaction_id when present", () => {
    expect(buildExternalId(tx({ transaction_id: "TX-1", entry_reference: "ER-1" }))).toBe("TX-1");
  });

  it("falls back to entry_reference when transaction_id is absent", () => {
    expect(buildExternalId(tx({ entry_reference: "ER-1" }))).toBe("ER-1");
  });

  it("returns null when there is no id and no date to anchor a hash", () => {
    expect(buildExternalId(tx())).toBeNull();
  });

  it("derives a stable 32-char hash from core fields when no id is provided", () => {
    const t = tx({ booking_date: "2026-03-01", remittance_information: ["COMPRA SUPERMERCADO"] });
    const id = buildExternalId(t);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    // Deterministic: same input → same id
    expect(buildExternalId(t)).toBe(id);
  });

  it("produces different hashes when a core field changes", () => {
    const base = tx({ booking_date: "2026-03-01", remittance_information: ["A"] });
    const diffAmount = tx({ booking_date: "2026-03-01", remittance_information: ["A"], transaction_amount: { amount: "99.99", currency: "EUR" } });
    const diffDate = tx({ booking_date: "2026-03-02", remittance_information: ["A"] });
    expect(buildExternalId(diffAmount)).not.toBe(buildExternalId(base));
    expect(buildExternalId(diffDate)).not.toBe(buildExternalId(base));
  });

  it("uses value_date when booking_date is missing", () => {
    expect(buildExternalId(tx({ value_date: "2026-03-01" }))).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("parseRemittanceFields", () => {
  it("returns nulls for an empty array", () => {
    expect(parseRemittanceFields([])).toEqual({ description: null, remittanceInfo: null });
  });

  it("returns nulls when all entries are blank", () => {
    expect(parseRemittanceFields(["   ", ""])).toEqual({ description: null, remittanceInfo: null });
  });

  it("treats a single chunk as the description with no remittanceInfo", () => {
    expect(parseRemittanceFields(["BIZUM RECIBIDO"])).toEqual({
      description: "BIZUM RECIBIDO",
      remittanceInfo: null,
    });
  });

  it("splits a single '//'-separated string into subtitle + title", () => {
    expect(parseRemittanceFields(["ADEUDO A SU CARGO//N 2026065 GC RE OCTOPUS"])).toEqual({
      description: "N 2026065 GC RE OCTOPUS",
      remittanceInfo: "ADEUDO A SU CARGO",
    });
  });

  it("handles the array format the same way as the '//' format", () => {
    expect(parseRemittanceFields(["ADEUDO A SU CARGO", "N 2026065 GC RE OCTOPUS"])).toEqual({
      description: "N 2026065 GC RE OCTOPUS",
      remittanceInfo: "ADEUDO A SU CARGO",
    });
  });

  it("joins 3+ chunks into the description, keeping chunk[0] as remittanceInfo", () => {
    expect(parseRemittanceFields(["TRANSFERENCIA", "DE JUAN", "CONCEPTO ALQUILER"])).toEqual({
      description: "DE JUAN CONCEPTO ALQUILER",
      remittanceInfo: "TRANSFERENCIA",
    });
  });

  it("collapses internal whitespace", () => {
    expect(parseRemittanceFields(["  PAGO   TARJETA  //  MERCADONA   SL  "])).toEqual({
      description: "MERCADONA SL",
      remittanceInfo: "PAGO TARJETA",
    });
  });
});
