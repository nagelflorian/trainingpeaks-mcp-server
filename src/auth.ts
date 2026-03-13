import axios from "axios";

export interface TokenResponse {
  success: boolean;
  token: {
    access_token: string;
    expires_in: number;
  };
  athleteId: number;
  userId: number;
  username: string;
}

export interface UserProfile {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  settings: {
    account: {
      isPremium: boolean;
    };
  };
}

const BASE_URL = "https://tpapi.trainingpeaks.com";

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let cachedAthleteId: number | null = null;

export function clearTokenCache(): void {
  cachedToken = null;
  cachedAthleteId = null;
}

function getAuthCookie(): string {
  const cookie = process.env.TP_AUTH_COOKIE;
  if (!cookie) {
    throw new Error(
      "TP_AUTH_COOKIE environment variable is not set. " +
        "Please extract the Production_tpAuth cookie from your browser's DevTools " +
        "after logging into TrainingPeaks."
    );
  }
  return cookie;
}

export async function getToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const cookie = getAuthCookie();

  const response = await axios.get<TokenResponse>(`${BASE_URL}/users/v3/token`, {
    headers: {
      Cookie: `Production_tpAuth=${cookie}`,
    },
  });

  if (!response.data.success) {
    throw new Error("Failed to exchange cookie for Bearer token. The cookie may be expired.");
  }

  cachedToken = {
    value: response.data.token.access_token,
    expiresAt: Date.now() + response.data.token.expires_in * 1000,
  };

  return cachedToken.value;
}

export async function getAthleteId(): Promise<number> {
  if (cachedAthleteId !== null) {
    return cachedAthleteId;
  }

  const token = await getToken();
  const response = await axios.get<{ user: UserProfile }>(`${BASE_URL}/users/v3/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  cachedAthleteId = response.data.user.userId;
  return cachedAthleteId;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
