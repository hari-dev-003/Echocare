import { getStoredToken, clearStoredUser } from "@/lib/auth";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * Makes an authenticated request to the FastAPI backend
 * using the current user's JWT token stored in localStorage.
 * Kept around for multipart uploads (FormData) — prefer backendJSON otherwise.
 */
export async function fetchFromBackend(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });
}

/**
 * Thrown by backendJSON on any non-2xx response.
 */
export class BackendError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Backend request failed with status ${status}`);
    this.name = "BackendError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Makes an authenticated JSON request to the FastAPI backend and returns the
 * parsed body. Throws BackendError on any non-2xx response. On 401, clears
 * the stored session and redirects to the login page (client-side only).
 */
export async function backendJSON<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchFromBackend(path, options);

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredUser();
      if (typeof window !== "undefined") {
        window.location.href = "/login?expired=1";
      }
    }
    const body = await res.json().catch(() => ({}));
    throw new BackendError(res.status, body?.detail ?? body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Calls the FastAPI login endpoint using OAuth2 form encoding.
 * Returns { access_token } or throws on failure.
 */
export async function loginWithBackend(email: string, password: string): Promise<{ access_token: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Login failed");
  }
  return res.json();
}

/**
 * Calls the FastAPI register endpoint.
 * Returns the created user or throws on failure.
 */
export async function registerWithBackend(
  email: string,
  password: string,
  fullName: string
): Promise<{ id: string; email: string; full_name: string; active_plan: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Registration failed");
  }
  return res.json();
}

/**
 * Fetches the current user's profile from MongoDB via the backend /me endpoint.
 * Accepts an optional token — useful right after login before the token is stored.
 */
export async function fetchCurrentUser(explicitToken?: string): Promise<{ id: string; email: string; full_name: string; active_plan: string } | null> {
  const token = explicitToken ?? getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
