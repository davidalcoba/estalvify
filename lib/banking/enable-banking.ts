// Enable Banking API client
// Docs: https://enablebanking.com/docs/api/reference/
//
// Authentication: JWT signed with RSA private key (RS256)
// Flow per user:
//   1. POST /sessions → get auth URL
//   2. Redirect user to bank → user authenticates
//   3. Bank redirects to REDIRECT_URI with session_id
//   4. Use session_id for subsequent API calls (valid ~90 days)

import { SignJWT, importPKCS8 } from "jose";
import fs from "fs";
import path from "path";

const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

// Response from POST /auth (step 1: initiate flow)
export interface EnableBankingAuthResponse {
  url: string;
}

// Response from POST /sessions (step 2: exchange code after callback)
export interface EnableBankingSessionResponse {
  session_id: string;
  accounts: EnableBankingAccount[];
  access: {
    valid_until: string;
  };
}

export interface EnableBankingAccount {
  uid: string;
  account_id?: {
    iban?: string;
    other?: { identification: string; scheme_name: string };
  };
  all_account_ids?: Array<{ identification: string; scheme_name: string }>;
  name?: string;
  details?: string;
  cash_account_type: string; // CACC, CARD, CASH, LOAN, OTHR, SVGS
  currency: string;
  product?: string;
  identification_hash: string;
  identification_hashes: string[];
}

export interface EnableBankingTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: {
    amount: string;
    currency: string;
  };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: string; // BOOK, PDNG, HOLD, etc.
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  creditor_account?: { iban?: string; other?: { identification: string; scheme_name: string } };
  creditor_agent?: { bic_fi?: string; name?: string };
  debtor?: { name?: string };
  debtor_account?: { iban?: string; other?: { identification: string; scheme_name: string } };
  debtor_agent?: { bic_fi?: string; name?: string };
  bank_transaction_code?: { description?: string; code?: string; sub_code?: string };
  remittance_information?: string[]; // array of strings
  note?: string;
  merchant_category_code?: string;
  balance_after_transaction?: { amount: string; currency: string };
  reference_number?: string;
}

export interface EnableBankingBalance {
  name: string;
  balance_amount: {
    amount: string;
    currency: string;
  };
  balance_type: string;
}

export interface EnableBankingAspsp {
  name: string;
  country: string;
  logo?: string;
  bic?: string;
}

// ─────────────────────────────────────────────
// JWT generation (RS256 with RSA private key)
// ─────────────────────────────────────────────

let cachedPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

async function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  let privateKeyPem: string;

  // In production (Vercel): key is stored as env var
  if (process.env.ENABLE_BANKING_PRIVATE_KEY) {
    privateKeyPem = process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, "\n");
  } else if (process.env.ENABLE_BANKING_PRIVATE_KEY_PATH) {
    // In local dev: read from file
    const keyPath = path.resolve(process.cwd(), process.env.ENABLE_BANKING_PRIVATE_KEY_PATH);
    privateKeyPem = fs.readFileSync(keyPath, "utf-8");
  } else {
    throw new Error("No Enable Banking private key configured. Set ENABLE_BANKING_PRIVATE_KEY or ENABLE_BANKING_PRIVATE_KEY_PATH.");
  }

  cachedPrivateKey = await importPKCS8(privateKeyPem, "RS256");
  return cachedPrivateKey;
}

async function generateJwt(): Promise<string> {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  if (!appId) throw new Error("ENABLE_BANKING_APP_ID environment variable is not set");

  const privateKey = await getPrivateKey();

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: appId })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setSubject(appId)
    .setAudience("api.enablebanking.com")
    .sign(privateKey);
}

// ─────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const jwt = await generateJwt();

  const response = await fetch(`${ENABLE_BANKING_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Enable Banking API error ${response.status}: ${body}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────
// Bank discovery
// ─────────────────────────────────────────────

/**
 * List all supported banks (ASPSPs) for a given country.
 */
export async function listBanks(country: string = "ES"): Promise<{ aspsps: EnableBankingAspsp[] }> {
  return request<{ aspsps: EnableBankingAspsp[] }>(`/aspsps/${country}`);
}

// ─────────────────────────────────────────────
// Session management (OAuth2 flow per user)
// ─────────────────────────────────────────────

/**
 * Step 1: Initiate the Enable Banking auth flow for a specific bank.
 * Returns the URL to redirect the user to for authentication.
 * The `state` param is stored in DB to correlate the callback.
 */
export async function createBankingSession(params: {
  aspspName: string;
  aspspCountry: string;
  psuIpAddress: string;
  state: string;
  redirectUri?: string;
}): Promise<EnableBankingAuthResponse> {
  const redirectUri = params.redirectUri
    ?? process.env.ENABLE_BANKING_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/banking/callback`;

  return request<EnableBankingAuthResponse>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        balances: true,
        transactions: true,
      },
      aspsp: {
        name: params.aspspName,
        country: params.aspspCountry,
      },
      redirect_url: redirectUri,
      state: params.state,
      psu_type: "personal",
      psu_ip_address: params.psuIpAddress,
    }),
  });
}

/**
 * Step 2: Exchange the authorization code from the callback for a session.
 * Called from the callback route after the user authenticates with their bank.
 * Returns `session_id` and the list of accessible accounts.
 */
export async function exchangeCodeForSession(code: string): Promise<EnableBankingSessionResponse> {
  return request<EnableBankingSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Step 3: After OAuth callback, get accounts for an authenticated session.
 */
export async function getAccounts(
  sessionId: string
): Promise<{ accounts: EnableBankingAccount[] }> {
  return request<{ accounts: EnableBankingAccount[] }>(`/sessions/${sessionId}/accounts`);
}

/**
 * Get transactions for an account filtered by date range.
 * Called once per day by the cron job — do not call more than needed.
 */
export async function getTransactions(
  accountId: string,
  params: {
    dateFrom: string; // YYYY-MM-DD
    dateTo: string;   // YYYY-MM-DD
  }
): Promise<{ transactions: EnableBankingTransaction[]; continuation_key?: string }> {
  const query = new URLSearchParams({
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });

  return request<{ transactions: EnableBankingTransaction[]; continuation_key?: string }>(
    `/accounts/${accountId}/transactions?${query}`
  );
}

/**
 * Get current balances for an account.
 * Called once per day by the cron job.
 */
export async function getBalances(
  accountId: string
): Promise<{ balances: EnableBankingBalance[] }> {
  return request<{ balances: EnableBankingBalance[] }>(
    `/accounts/${accountId}/balances`
  );
}

/**
 * Check if a session is still valid.
 */
export async function checkSession(sessionId: string): Promise<boolean> {
  try {
    await request(`/sessions/${sessionId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a session (user disconnects a bank).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/sessions/${sessionId}`, { method: "DELETE" });
}
