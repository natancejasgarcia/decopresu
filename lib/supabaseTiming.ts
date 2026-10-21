function operation(input: RequestInfo | URL) {
  const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
  if (path === "/auth/v1/user") return "auth.user";
  if (path.endsWith("/.well-known/jwks.json")) return "auth.public_keys";
  if (path.startsWith("/auth/")) return "auth.session";
  const table = path.match(/^\/rest\/v1\/(?:rpc\/)?([a-z_]+)$/)?.[1];
  if (table) return `db.${table}`;
  return path.startsWith("/storage/") ? "storage.files" : "supabase.request";
}

export function timedSupabaseFetch(layer: "middleware" | "server") {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = Date.now();
    let status = 0;
    try {
      const response = await fetch(input, init);
      status = response.status;
      return response;
    } finally {
      const durationMs = Date.now() - start;
      if (durationMs >= 400 || status >= 500 || status === 0) {
        // Only operation names and timings: no URLs, customer data, cookies or tokens.
        console.info("[Decoralia performance]", JSON.stringify({ layer, executionRegion: process.env.VERCEL_REGION ?? "local", operation: operation(input), durationMs, status }));
      }
    }
  };
}
