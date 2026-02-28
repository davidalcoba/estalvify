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

export interface EnableBankingSession {
  session_id: string;
  url: string;
  valid_until: string;
  status: string;
}

export interface EnableBankingAccount {
  uid: string;
  iban?: string;
  bban?: string;
  name?: string;
  currency: string;
  account_type?: string;
}

export interface EnableBankingTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: {
    amount: string;
    currency: string;
  };
  credit_debit_indicator: "CRDT" | "DBIT";
  booking_date?: string;
  value_date?: string;
  transaction_information?: string;
  creditor_name?: string;
  creditor_account?: { iban?: string };
  debtor_name?: string;
  debtor_account?: { iban?: string };
  remittance_information_unstructured?: string;
  merchant_category_code?: string;
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
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setSubject(appId)
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
 * Step 1: Create an Enable Banking session for a specific bank.
 * Returns the URL to redirect the user to for bank authentication.
 */
export async function createBankingSession(params: {
  aspspName: string;  // Bank name from listBanks()
  aspspCountry: string;
  psuIpAddress: string; // End user's IP (required by PSD2)
  redirectUri?: string;
}): Promise<EnableBankingSession> {
  const redirectUri = params.redirectUri
    ?? process.env.ENABLE_BANKING_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/banking/callback`;

  return request<EnableBankingSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      access: {
        // Request 90-day consent (PSD2 maximum)
        valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        balances: [{}],
        transactions: [{}],
      },
      aspsp: {
        name: params.aspspName,
        country: params.aspspCountry,
      },
      redirect_url: redirectUri,
      psu_type: "personal",
      psu_ip_address: params.psuIpAddress,
    }),
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
  sessionId: string,
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
    `/sessions/${sessionId}/accounts/${accountId}/transactions?${query}`
  );
}

/**
 * Get current balances for an account.
 * Called once per day by the cron job.
 */
export async function getBalances(
  sessionId: string,
  accountId: string
): Promise<{ balances: EnableBankingBalance[] }> {
  return request<{ balances: EnableBankingBalance[] }>(
    `/sessions/${sessionId}/accounts/${accountId}/balances`
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
