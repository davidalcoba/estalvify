import { describe, it, expect } from "vitest";
import { detectRecurringSuggestions, suggestionKey, type TxForDetection } from "./detect";

function monthly(
  descriptor: string,
  amount: number,
  day: number,
  months: string[],
  categoryId: string | null = null
): TxForDetection[] {
  return months.map((m) => ({
    date: `${m}-${String(day).padStart(2, "0")}`,
    amount,
    direction: "DEBIT" as const,
    descriptor,
    categoryId,
  }));
}

const MONTHS = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

describe("suggestionKey", () => {
  it("strips invoice numbers so one merchant is one key", () => {
    expect(suggestionKey("ADEUDO O2 FIBRA FACTURA 2026-07-1234")).toBe(
      suggestionKey("ADEUDO O2 FIBRA FACTURA 2026-06-9876")
    );
  });
});

describe("detectRecurringSuggestions", () => {
  it("proposes a stable monthly charge with its window, category and median amount", () => {
    const txs = [
      ...monthly("GIMNASIO METROPOLITAN", 49.9, 4, MONTHS.slice(0, 5), "gym"),
      { date: "2026-07-05", amount: 52.9, direction: "DEBIT" as const, descriptor: "GIMNASIO METROPOLITAN", categoryId: "gym" },
    ];
    const [s] = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(s.cadence).toBe("MONTHLY");
    expect(s.expectedAmount).toBeCloseTo(49.9, 2);
    expect(s.windowFromDay).toBe(4);
    expect(s.windowToDay).toBe(5);
    expect(s.categoryId).toBe("gym");
    expect(s.occurrences).toBe(6);
  });

  it("accepts varying bills within tolerance (facturas pueden variar)", () => {
    const txs = MONTHS.map((m, i) => ({
      date: `${m}-15`,
      amount: 60 + i * 4, // 60..80, all within ±30% of the median
      direction: "DEBIT" as const,
      descriptor: "ENDESA ENERGIA XXI",
      categoryId: null,
    }));
    const result = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(result).toHaveLength(1);
  });

  it("rejects frequent merchants — the supermarket is not a series", () => {
    const txs: TxForDetection[] = [];
    for (const m of MONTHS) {
      for (const d of [2, 6, 11, 17, 23, 27]) {
        txs.push({
          date: `${m}-${String(d).padStart(2, "0")}`,
          amount: 45,
          direction: "DEBIT",
          descriptor: "MERCADONA BARCELONA",
          categoryId: "food",
        });
      }
    }
    expect(
      detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] })
    ).toHaveLength(0);
  });

  it("needs at least three occurrences", () => {
    const txs = monthly("NUEVO SEGURO DENTAL", 22, 10, MONTHS.slice(0, 2));
    expect(
      detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] })
    ).toHaveLength(0);
  });

  it("skips merchants already covered by a series matcher and dismissed keys", () => {
    const txs = [
      ...monthly("ADEUDO NETFLIX SERVICES", 12.99, 15, MONTHS),
      ...monthly("SPOTIFY SUBSCRIPTION", 10.99, 3, MONTHS),
    ];
    const result = detectRecurringSuggestions(txs, {
      existingMatchers: ["netflix"],
      dismissedKeys: [suggestionKey("SPOTIFY SUBSCRIPTION")],
    });
    expect(result).toHaveLength(0);
  });

  it("classifies a bimonthly utility", () => {
    const txs = ["2026-01-10", "2026-03-11", "2026-05-09", "2026-07-10"].map((date) => ({
      date,
      amount: 85,
      direction: "DEBIT" as const,
      descriptor: "AGUAS DE BARCELONA",
      categoryId: null,
    }));
    const [s] = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(s.cadence).toBe("BIMONTHLY");
  });

  it("detects income too and sorts by amount", () => {
    const txs = [
      ...monthly("GIMNASIO METROPOLITAN", 49.9, 4, MONTHS),
      ...MONTHS.map((m) => ({
        date: `${m}-28`,
        amount: 2253,
        direction: "CREDIT" as const,
        descriptor: "NOMINA EN DIEZ SL",
        categoryId: "salary",
      })),
    ];
    const result = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(result[0].direction).toBe("CREDIT");
    expect(result[0].expectedAmount).toBe(2253);
    expect(result).toHaveLength(2);
  });

  it("names a suggestion after the merchant when the sync extracted one", () => {
    const txs = monthly("PAGO DE ADEUDO DIRECTO SEPA ENDESA ENERGIA", 61.4, 9, MONTHS).map(
      (t) => ({ ...t, merchant: "Endesa Energía" })
    );
    const [s] = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(s.displayName).toBe("Endesa Energía");
  });

  it("strips the bank's operation prefix when there is no merchant to fall back on", () => {
    // Without this the suggestion is offered as "PAGO DE ADEUDO DIRECTO SEPA …",
    // and the name is the one field the accept flow does not invite editing.
    const txs = monthly("PAGO DE ADEUDO DIRECTO SEPA ENDESA ENERGIA", 61.4, 9, MONTHS);
    const [s] = detectRecurringSuggestions(txs, { existingMatchers: [], dismissedKeys: [] });
    expect(s.displayName).toBe("ENDESA ENERGIA");
  });
});
