// Extract a clean merchant name from a Spanish bank's raw descriptor.
//
// Bank text is noisy: a card payment reads "PAGO CON TARJETA <merchant> <city>
// ES PAGO CON TARJETA EN <category>", a SEPA debit "PAGO DE ADEUDO DIRECTO SEPA
// N <ref> <merchant>", a gateway splits a name with an asterisk ("UBER *ONE
// MEMBERSHIP"), and account/reference numbers trail everywhere. This strips the
// scaffolding down to the merchant, for DISPLAY (the Detected list) and
// detection grouping. Matching does NOT depend on it — that uses
// normalizeDescriptor over the raw text.

/** Best-effort clean merchant name, or null when nothing usable remains. */
export function extractMerchant(
  description?: string | null,
  remittanceInfo?: string | null,
): string | null {
  let s = (description ?? "").trim();
  if (!s) s = (remittanceInfo ?? "").trim();
  if (!s) return null;

  // Card payments carry a trailing "PAGO CON TARJETA EN <category>" tail — drop it.
  s = s.replace(/\s*PAGO CON TARJETA EN\b.*$/i, " ");
  // Leading operation-type scaffolding.
  s = s.replace(/^\s*PAGO CON TARJETA\s+/i, "");
  s = s.replace(/^\s*PAGO DE ADEUDO DIRECTO\s+/i, "");
  s = s.replace(/^\s*(OTROS|RECIBO|TRANSFERENCIA(?:\s+REALIZADA|\s+RECIBIDA)?|ADEUDO(?:\s+DE)?|BIZUM(?:\s+DE)?)\b\s*/i, "");
  // SEPA markers and the "N <ref>" reference token anywhere.
  s = s.replace(/\bSEPA\b/gi, " ");
  s = s.replace(/\bADEUDO A SU CARGO\b/gi, " ");
  s = s.replace(/\bN\s*\d{4,}\b/gi, " ");
  // Gateway asterisk: "UBER *ONE" -> "UBER ONE".
  s = s.replace(/\*/g, " ");
  // Long account / reference numbers (0182-0205-99-..., 2026215001518303).
  s = s.replace(/\b\d[\d.\-/]{3,}\b/g, " ");
  // Trailing country code left after the category tail was cut.
  s = s.replace(/\s+ES\s*$/i, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Collapse an immediately repeated token: the city often doubles
  // ("METRO BARCELONA BARCELONA" -> "METRO BARCELONA").
  const out: string[] = [];
  for (const w of s.split(" ")) {
    if (out[out.length - 1]?.toUpperCase() !== w.toUpperCase()) out.push(w);
  }
  s = out.join(" ").trim();

  return s ? s.slice(0, 80) : null;
}
