import { QueryClient, QueryFunction } from "@tanstack/react-query";

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Check for EMC session token (for EMC admin access) - uses sessionStorage for security
  const emcToken = sessionStorage.getItem(EMC_SESSION_KEY);
  if (emcToken) {
    headers["X-EMC-Session"] = emcToken;
  }
  
  // Check for device token (for enrolled POS/KDS devices) - uses localStorage for persistence
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) {
    headers["X-Device-Token"] = deviceToken;
  }
  
  return headers;
}

// Custom error class that preserves JSON response body
export class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any | null;

  constructor(status: number, bodyText: string, bodyJson: any | null = null) {
    super(`${status}: ${bodyJson?.message || bodyText}`);
    this.name = "ApiError";
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let jsonBody: any = null;
    try {
      jsonBody = JSON.parse(text);
    } catch {
      // Not JSON, leave as null
    }
    throw new ApiError(res.status, text, jsonBody);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
  };
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = getAuthHeaders();
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0, // Data is immediately stale - allows invalidation to trigger refetch
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
