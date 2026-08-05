import { describe, it, expect } from "vitest";
import { extractMerchant } from "./merchant";

describe("extractMerchant", () => {
  const cases: [string, string][] = [
    ["PAGO CON TARJETA UBER *ONE MEMBERSHIP", "UBER ONE MEMBERSHIP"],
    [
      "PAGO CON TARJETA METRO BARCELONA BARCELONA ES PAGO CON TARJETA EN TRANSPORTE Y ALQUILER DE VEHICULOS",
      "METRO BARCELONA",
    ],
    ["PAGO CON TARJETA RING STANDARD PLAN", "RING STANDARD PLAN"],
    ["OTROS BBVA PLAN ESTARSEGURO", "BBVA PLAN ESTARSEGURO"],
    ["AMORTIZACIÓN PRÉSTAMO 0182-0205-99-0830244220", "AMORTIZACIÓN PRÉSTAMO"],
    [
      "PAGO DE ADEUDO DIRECTO SEPA N 2026215001497364 AFA TEIXIDORES DE GRACIA",
      "AFA TEIXIDORES DE GRACIA",
    ],
    ["COMERCIO EDIFICACION E INDUSTRIA S.L.", "COMERCIO EDIFICACION E INDUSTRIA S.L."],
  ];

  for (const [raw, expected] of cases) {
    it(`"${raw.slice(0, 40)}…" -> "${expected}"`, () => {
      expect(extractMerchant(raw)).toBe(expected);
    });
  }

  it("falls back to remittanceInfo, then null", () => {
    expect(extractMerchant("", "NETFLIX")).toBe("NETFLIX");
    expect(extractMerchant(null, null)).toBeNull();
    expect(extractMerchant("   ")).toBeNull();
  });
});
