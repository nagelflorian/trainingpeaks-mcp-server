import axios from "axios";
import { authHeaders, clearTokenCache } from "./auth.js";

const BASE_URL = "https://tpapi.trainingpeaks.com";
export const STRENGTH_BASE_URL = "https://api.peakswaresb.com";

function handleAxiosError(err: unknown, method: string, path: string, baseUrl: string): never {
  if (axios.isAxiosError(err) && err.response) {
    if (err.response.status === 401) {
      clearTokenCache();
      throw new Error(
        "TrainingPeaks session expired (401). " +
          "Re-extract the Production_tpAuth cookie from your browser DevTools " +
          "and update the TP_AUTH_COOKIE environment variable, then restart the server.",
        { cause: err }
      );
    }
    const body =
      typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
    throw new Error(
      `HTTP ${err.response.status} from ${method.toUpperCase()} ${baseUrl}${path}: ${body}`,
      { cause: err }
    );
  }
  throw err;
}

export async function api<T>(config: {
  method: "get" | "post" | "put" | "delete";
  path: string;
  data?: unknown;
}): Promise<T> {
  const headers = await authHeaders();
  try {
    const response = await axios.request<T>({
      method: config.method,
      url: `${BASE_URL}${config.path}`,
      headers,
      data: config.data,
    });
    return response.data;
  } catch (err) {
    handleAxiosError(err, config.method, config.path, BASE_URL);
  }
}

export async function strengthApi<T>(config: {
  method: "get" | "post" | "put" | "delete";
  path: string;
  data?: unknown;
}): Promise<T> {
  const headers = await authHeaders();
  try {
    const response = await axios.request<T>({
      method: config.method,
      url: `${STRENGTH_BASE_URL}${config.path}`,
      headers,
      data: config.data,
    });
    return response.data;
  } catch (err) {
    handleAxiosError(err, config.method, config.path, STRENGTH_BASE_URL);
  }
}
