// Human-friendly merchant label from a transaction's descriptors (used by the
// top-merchants report). Strips the bank's operation prefixes.

const DESCRIPTION_PREFIXES = [
  "PAGO DE ADEUDO DIRECTO SEPA ",
  "PAGO DE ADEUDO SEPA ",
  "ADEUDO DIRECTO SEPA ",
  "RECIBO ",
  "PAGO CON TARJETA ",
  "PAGO CON VISA ",
  "COMPRA ",
  "TRANSFERENCIA ",
];

function stripPrefix(value: string): string {
  const upper = value.toUpperCase();
  for (const prefix of DESCRIPTION_PREFIXES) {
    if (upper.startsWith(prefix)) return value.slice(prefix.length).trim();
  }
  return value.trim();
}

export function merchantDisplayName(
  description: string | null,
  remittanceInfo: string | null
): string {
  const raw = (description ?? remittanceInfo ?? "").trim();
  const cleaned = stripPrefix(raw).replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}…` : cleaned;
}
