// Who may sign in — the `ALLOWED_EMAILS` allowlist.
//
// Pure so it can be unit-tested without Auth.js or a database; `auth.ts` reads
// the env var and delegates the decision here.
//
// Accepted entry forms (comma-separated, case-insensitive, whitespace trimmed):
//
//   david@example.com    one exact address
//   @example.com         any address at that domain
//   example.com          same as `@example.com` — a bare entry is a domain
//   *@example.com        same again, for people who expect the wildcard spelling
//   *.example.com        any *subdomain* of example.com — see the note below
//   *@*.example.com      same as `*.example.com`
//   postmaster@*         that mailbox at any domain
//   *                    everyone
//
// `*@*` and `@*` are rejected, not accepted as aliases of `*`. A wildcard domain
// only carries meaning next to a concrete local part; with both sides wildcarded
// it is a second spelling of `*`, and "everyone" is the entry that most deserves
// exactly one way to write it. Rejected entries are dropped, so writing `*@*` on
// its own denies sign-in rather than opening it — loud and safe.
//
// `*.example.com` does NOT match `example.com` itself, following the same
// convention as DNS and TLS wildcards: a wildcard label matches one or more
// labels in its place, not zero. List both entries when you want the apex too.
// The alternative — quietly including the apex — makes `*.example.com` and
// `example.com` indistinguishable, which is worse to reason about than an extra
// entry.
//
// A wildcard in the local part beyond a bare `*` (say `dev-*@example.com`) is
// deliberately not supported: it invites the assumption that the whole value is
// a glob, and no use case has asked for it.

/** One parsed allowlist entry. */
interface AllowedEntry {
  /** Local part to require, or null for "any local part". */
  local: string | null;
  /** Domain to require exactly, or null when `subdomainOf` is set. */
  domain: string | null;
  /** Parent domain whose subdomains are accepted. */
  subdomainOf: string | null;
}

/** `true` when this entry accepts anything. */
function isCatchAll(entry: AllowedEntry): boolean {
  return entry.local === null && entry.domain === null && entry.subdomainOf === null;
}

function parseEntry(raw: string): AllowedEntry | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "*") return { local: null, domain: null, subdomainOf: null };

  // Split on the last "@" so a stray one in the local part cannot shift the
  // domain — `a@b@example.com` is malformed input, not a domain of `example.com`.
  const at = value.lastIndexOf("@");
  // No "@" at all is a bare domain; a leading "@" is the `@example.com` spelling.
  // Both mean "any local part", same as `*@example.com`.
  const local = at <= 0 ? "*" : value.slice(0, at);
  const domainPart = at === -1 ? value : value.slice(at + 1);

  // An entry with no domain can only ever be a typo (`user@`, `@`). Dropping it
  // is safer than treating it as a catch-all.
  if (!domainPart || domainPart.includes("@")) return null;

  if (domainPart === "*") {
    // A wildcard domain needs a concrete local part to mean anything: `XXX@*` is
    // "that mailbox anywhere". With a wildcard local part too (`*@*`, `@*`) it is
    // just a second spelling of `*`, so it is rejected rather than aliased —
    // "everyone" is the one entry that should have exactly one way to write it.
    if (local === "*") return null;
    return { local, domain: null, subdomainOf: null };
  }
  if (domainPart.startsWith("*.")) {
    const parent = domainPart.slice(2);
    if (!parent || parent.startsWith(".")) return null;
    return { local: local === "*" ? null : local, domain: null, subdomainOf: parent };
  }
  return { local: local === "*" ? null : local, domain: domainPart, subdomainOf: null };
}

/** Parse `ALLOWED_EMAILS` into entries, discarding blanks and malformed ones. */
export function parseAllowedEmails(raw: string | null | undefined): AllowedEntry[] {
  return (raw ?? "")
    .split(",")
    .map(parseEntry)
    .filter((entry): entry is AllowedEntry => entry !== null);
}

/** Split an address, or null when it is not usable as one. */
function splitEmail(email: string): { local: string; domain: string } | null {
  const value = email.trim().toLowerCase();
  const at = value.indexOf("@");
  if (at <= 0) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain || domain.includes("@") || domain.startsWith(".") || domain.endsWith(".")) {
    return null;
  }
  return { local, domain };
}

function matches(entry: AllowedEntry, local: string, domain: string): boolean {
  if (isCatchAll(entry)) return true;
  if (entry.local !== null && entry.local !== local) return false;
  if (entry.domain !== null) return entry.domain === domain;
  if (entry.subdomainOf !== null) {
    // The leading dot is what keeps `example.com` from matching
    // `notexample.com`, and requiring extra length excludes the apex.
    return domain.endsWith(`.${entry.subdomainOf}`) && domain.length > entry.subdomainOf.length + 1;
  }
  return true; // domain was `*`
}

/** Does the raw value contain anything at all between the commas? */
function hasAnyEntry(raw: string | null | undefined): boolean {
  return (raw ?? "").split(",").some((part) => part.trim() !== "");
}

/**
 * May this address sign in?
 *
 * An empty (or absent) allowlist means **open** — every Google account is
 * accepted. That is the historical behaviour and stays for compatibility, but
 * `*` is the explicit way to say it: an allowlist that is empty by accident and
 * one that is empty on purpose look identical otherwise.
 *
 * A value that contains entries but no *usable* ones (`ALLOWED_EMAILS="@"`)
 * denies everyone rather than falling through to open. Without that distinction
 * the promise that a malformed entry cannot open sign-in would only hold while
 * some other entry happened to parse — a typo in the only entry would swing the
 * allowlist from one address to the whole world, which is the worst possible
 * direction for a mistake to resolve. Locking the owner out is recoverable; the
 * other way round is not.
 */
export function isEmailAllowed(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  const entries = parseAllowedEmails(raw);
  if (entries.length === 0) return !hasAnyEntry(raw);
  if (!email) return false;
  const parts = splitEmail(email);
  if (!parts) return false;
  return entries.some((entry) => matches(entry, parts.local, parts.domain));
}
