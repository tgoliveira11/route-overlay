/**
 * Confirmed-route storage is a single-operator cache, not a multi-user service.
 * A session UUID only separates files. It is not authentication.
 * These endpoints accept a direct loopback host and reject proxied requests.
 * `npm run dev`, `npm run dev:e2e`, and `npm run start` bind 127.0.0.1.
 * That bind is the deployment control. A spoofed Host header would pass the
 * check below if the process listened on another interface.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function localDiagnosticRefusal(request: Request): string | null {
  if (
    request.headers.get("x-forwarded-for")
    || request.headers.get("x-forwarded-host")
    || request.headers.get("forwarded")
  ) {
    return "Confirmed-route diagnostics accept only a direct loopback request.";
  }
  let hostname: string;
  try {
    hostname = new URL(request.url).hostname.toLowerCase();
  } catch {
    return "Confirmed-route diagnostics accept only a direct loopback request.";
  }
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return "Confirmed-route diagnostics accept only a direct loopback request.";
  }
  return null;
}
