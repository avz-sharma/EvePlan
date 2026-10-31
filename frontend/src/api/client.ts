const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

/** Uses the same origin by default; deployments can supply a separate API origin at build time. */
export const apiUrl = (path: string) => `${configuredBase}${path.startsWith("/") ? path : `/${path}`}`;
