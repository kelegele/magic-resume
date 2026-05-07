import { resolve } from "path";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req: any, res: any) {
  // Use runtime path to prevent esbuild from bundling server.js
  const serverPath = resolve(process.cwd(), "dist/server/server.js");

  let server: any;
  try {
    server = (await import(serverPath)).default;
  } catch (e) {
    console.error("Failed to load server:", e);
    res.status(500).send("Server load failed");
    return;
  }

  const protocol = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
  const host = req.headers.host || "localhost";

  // Reconstruct original URL path
  // Vercel rewrite: /foo -> /api/foo, so strip /api prefix
  const originalPath = (req.url || "/").replace(/^\/api/, "") || "/";
  const url = new URL(originalPath, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "content-length" || lower === "transfer-encoding") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : (value as string));
  }

  const method = (req.method || "GET").toUpperCase();
  const init: RequestInit = { method, headers };

  if (method !== "GET" && method !== "HEAD" && req) {
    // Read raw body from Node.js IncomingMessage
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks);
      init.duplex = "half";
    }
  }

  try {
    const request = new Request(url.toString(), init);
    const response = await server.fetch(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });

    const body = await response.text();
    res.end(body);
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).end("Internal Server Error");
  }
}
