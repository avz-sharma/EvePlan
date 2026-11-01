const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

/** Uses the same origin by default; deployments can supply a separate API origin at build time. */
export const apiUrl = (path: string) => `${configuredBase}${path.startsWith("/") ? path : `/${path}`}`;

/** Preserve readable API errors and keep JSON casts at one validated-server boundary. */
export async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? payload.detail : null;
    throw new Error(typeof detail === "string" ? detail : fallback);
  }
  return payload as T;
}
