import { describe, it, expect } from "vitest";
import { findDuplicateGroups, type DuplicateInput } from "./duplicates";

function tx(overrides: Partial<DuplicateInput> = {}): DuplicateInput {
  return {
    id: "t1",
    bankAccountId: "acc-1",
    accountName: "Main",
    amount: 49.9,
    direction: "DEBIT",
    valueDate: "2026-08-01",
    description: "COMPRA NETFLIX 1234",
    remittanceInfo: null,
    ...overrides,
  };
}

describe("findDuplicateGroups", () => {
  it("clusters two identical charges a day apart", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", valueDate: "2026-08-01" }),
      tx({ id: "b", valueDate: "2026-08-02" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      bankAccountId: "acc-1",
      accountName: "Main",
      merchantKey: "NETFLIX",
      amount: 49.9,
      count: 2,
      firstDate: "2026-08-01",
      lastDate: "2026-08-02",
      spanDays: 1,
      transactionIds: ["a", "b"],
    });
  });

  it("groups by the normalized merchant key, not the raw descriptor", () => {
    // The real shape of a double charge: same merchant, different operation
    // reference and a bank prefix on only one of them. One cluster, not two
    // singletons. (Digits and prefixes are what normalizeMerchantKey drops —
    // extra *words* are not, so "NETFLIX" and "NETFLIX COM" stay apart.)
    const groups = findDuplicateGroups([
      tx({ id: "a", description: "COMPRA NETFLIX 1234 05/01" }),
      tx({ id: "b", description: "NETFLIX 9988 06/01" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 2, merchantKey: "NETFLIX" });
  });

  it("leaves a lone charge alone", () => {
    expect(findDuplicateGroups([tx()])).toEqual([]);
  });

  it("does not pair charges further apart than the window", () => {
    expect(
      findDuplicateGroups([
        tx({ id: "a", valueDate: "2026-08-01" }),
        tx({ id: "b", valueDate: "2026-08-10" }),
      ])
    ).toEqual([]);
  });

  it("chains a run instead of splitting it into overlapping pairs", () => {
    // Days 1, 3, 5: each gap is inside the window, so it is one run of three.
    const groups = findDuplicateGroups([
      tx({ id: "a", valueDate: "2026-08-01" }),
      tx({ id: "b", valueDate: "2026-08-03" }),
      tx({ id: "c", valueDate: "2026-08-05" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      count: 3,
      spanDays: 4,
      transactionIds: ["a", "b", "c"],
    });
  });

  it("splits a bucket when a gap exceeds the window", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", valueDate: "2026-08-01" }),
      tx({ id: "b", valueDate: "2026-08-02" }),
      tx({ id: "c", valueDate: "2026-08-20" }),
      tx({ id: "d", valueDate: "2026-08-21" }),
    ]);
    expect(groups.map((g) => g.transactionIds)).toEqual([
      ["c", "d"],
      ["a", "b"],
    ]);
  });

  it("keeps different amounts, accounts and directions apart", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", amount: 49.9 }),
      tx({ id: "b", amount: 49.91 }), // one cent apart
      tx({ id: "c", bankAccountId: "acc-2" }),
      tx({ id: "d", direction: "CREDIT" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("ignores charges below the noise floor", () => {
    const rows = [
      tx({ id: "a", amount: 1.5, valueDate: "2026-08-01" }),
      tx({ id: "b", amount: 1.5, valueDate: "2026-08-01" }),
    ];
    expect(findDuplicateGroups(rows)).toEqual([]);
    expect(findDuplicateGroups(rows, { minAmount: 1 })).toHaveLength(1);
  });

  it("reports a small duplicate — the floor is cents, not euros", () => {
    // The whole point of a low floor: a €4 charge taken twice is as wrong as a
    // €40 one, and a comfortable threshold hid it with nothing saying so.
    const groups = findDuplicateGroups([
      tx({ id: "a", amount: 4, valueDate: "2026-08-01" }),
      tx({ id: "b", amount: 4, valueDate: "2026-08-01" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ amount: 4, count: 2 });
  });

  it("uses the magnitude, so a bank that signs its debits still clusters", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", amount: -49.9, valueDate: "2026-08-01" }),
      tx({ id: "b", amount: -49.9, valueDate: "2026-08-02" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amount).toBe(49.9);
  });

  it("ignores rows with no usable descriptor", () => {
    expect(
      findDuplicateGroups([
        tx({ id: "a", description: null, remittanceInfo: null }),
        tx({ id: "b", description: null, remittanceInfo: null }),
        // Digits only — normalizeMerchantKey strips them, leaving nothing.
        tx({ id: "c", description: "1234 5678" }),
        tx({ id: "d", description: "1234 5678" }),
      ])
    ).toEqual([]);
  });

  it("falls back to remittanceInfo when there is no description", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", description: null, remittanceInfo: "RECIBO GYM MADRID" }),
      tx({ id: "b", description: null, remittanceInfo: "RECIBO GYM MADRID" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].merchantKey).toBe("GYM MADRID");
  });

  it("cannot mistake a weekly subscription for a duplicate", () => {
    // 7 days is the shortest cadence the app recognises; the window is 3.
    expect(
      findDuplicateGroups([
        tx({ id: "a", valueDate: "2026-08-01" }),
        tx({ id: "b", valueDate: "2026-08-08" }),
        tx({ id: "c", valueDate: "2026-08-15" }),
      ])
    ).toEqual([]);
  });

  it("returns the newest cluster first", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", valueDate: "2026-08-01" }),
      tx({ id: "b", valueDate: "2026-08-01" }),
      tx({ id: "c", amount: 80, valueDate: "2026-08-19", description: "COMPRA ZARA" }),
      tx({ id: "d", amount: 80, valueDate: "2026-08-19", description: "COMPRA ZARA" }),
    ]);
    expect(groups.map((g) => g.lastDate)).toEqual(["2026-08-19", "2026-08-01"]);
  });

  it("accepts full ISO timestamps and normalizes them to dates", () => {
    const groups = findDuplicateGroups([
      tx({ id: "a", valueDate: "2026-08-01T00:00:00.000Z" }),
      tx({ id: "b", valueDate: "2026-08-02T00:00:00.000Z" }),
    ]);
    expect(groups[0]).toMatchObject({ firstDate: "2026-08-01", lastDate: "2026-08-02" });
  });
});
