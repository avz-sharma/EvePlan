import { loadEnv, type Plugin } from "vite";

export function securityHeaders(mode: string): Plugin {
  const api = loadEnv(mode, "..", "VITE_").VITE_API_BASE_URL;
  const apiOrigin = api && !api.startsWith("/") ? ` ${new URL(api).origin}` : "";
  const headers = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; "
      + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
      + `connect-src 'self'${apiOrigin}; `
      + "font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
  return {
    name: "production-security-headers",
    generateBundle() {
      const rules = "/*\n" + Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join("\n")
        + "\n  Cache-Control: public, max-age=0, must-revalidate\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n";
      this.emitFile({ type: "asset", fileName: "_headers", source: rules });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
        response.setHeader("Cache-Control", /^\/(assets|fonts)\//.test(request.url || "")
          ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
        next();
      });
    },
  };
}
