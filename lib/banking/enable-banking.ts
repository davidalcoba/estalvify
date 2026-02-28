// Enable Banking API client
// Docs: https://enablebanking.com/docs/api/reference/
//
// Authentication uses JWT signed with your RSA private key.
// OAuth2 flow:
//   1. POST /sessions → get auth URL
//   2. Redirect user to bank → user authenticates
//   3. Bank redirects to REDIRECT_URI with session_id
//   4. Use session_id for subsequent API calls

const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface EnableBankingSession {
  session_id: string;
  url: string; // Redirect user here for bank authentication
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
  credit_limit?: number;
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
  creditor_account?: {
    iban?: string;
  };
  debtor_name?: string;
  debtor_account?: {
    iban?: string;
  };
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

// ─────────────────────────────────────────────
// JWT generation (Enable Banking uses RS256)
// ─────────────────────────────────────────────

async function generateJwt(): Promise<string> {
  // The Enable Banking API requires a JWT signed with your RSA private key.
  // In production, load the key from environment variables.
  //
  // For now this is a placeholder — full implementation requires:
  // npm install jose
  // Then use: import { SignJWT, importPKCS8 } from "jose"
  //
  // const privateKey = await importPKCS8(process.env.ENABLE_BANKING_PRIVATE_KEY!, "RS256");
  // const jwt = await new SignJWT({})
  //   .setProtectedHeader({ alg: "RS256" })
  //   .setIssuedAt()
  //   .setExpirationTime("1h")
  //   .setSubject(process.env.ENABLE_BANKING_APP_ID!)
  //   .sign(privateKey);
  // return jwt;

  throw new Error("JWT generation not yet implemented. Install 'jose' and add your RSA private key.");
}

// ─────────────────────────────────────────────
// API client
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
// Session management (OAuth2 flow)
// ─────────────────────────────────────────────

/**
 * Create an Enable Banking session for a specific bank.
 * Returns the URL to redirect the user to for bank authentication.
 */
export async function createBankingSession(params: {
  aspspId: string; // Enable Banking bank identifier
  psuIpAddress: string; // End user's IP address (required by PSD2)
  redirectUri?: string;
}): Promise<EnableBankingSession> {
  return request<EnableBankingSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      access: {
        valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        balances: [{}],
        transactions: [{}],
      },
      aspsp: {
        name: params.aspspId,
        country: "ES",
      },
      redirect_url: params.redirectUri ?? process.env.ENABLE_BANKING_REDIRECT_URI,
      psu_type: "personal",
    }),
  });
}

/**
 * Get accounts for an authenticated session.
 */
export async function getAccounts(sessionId: string): Promise<{ accounts: EnableBankingAccount[] }> {
  return request<{ accounts: EnableBankingAccount[] }>(`/sessions/${sessionId}/accounts`);
}

/**
 * Get transactions for an account (filtered by date range).
 * Enable Banking rate-limits calls — use the cron job to call this once per day.
 */
export async function getTransactions(
  sessionId: string,
  accountId: string,
  params: {
    dateFrom: string; // YYYY-MM-DD
    dateTo: string;   // YYYY-MM-DD
  }
): Promise<{ transactions: EnableBankingTransaction[] }> {
  const query = new URLSearchParams({
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });

  return request<{ transactions: EnableBankingTransaction[] }>(
    `/sessions/${sessionId}/accounts/${accountId}/transactions?${query}`
  );
}

/**
 * Get current balances for an account.
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
 * Check if a session token is still valid.
 * Returns true if valid, false if expired or invalid.
 */
export async function checkSession(sessionId: string): Promise<boolean> {
  try {
    await request(`/sessions/${sessionId}`);
    return true;
  } catch {
    return false;
  }
}
