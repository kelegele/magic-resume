import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Lazy-load the built server entry
  const { default: server } = await import("../dist/server/server.js");

  const protocol = (req.headers["x-forwarded-proto"] || "https") as string;
  const host = req.headers.host || "localhost";

  // Rewrite strips: /dashboard → /api/dashboard, so strip /api prefix back
  const originalPath = (req.url || "/").replace(/^\/api/, "") || "/";
  const url = new URL(originalPath, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (key.toLowerCase() === "content-length") continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const method = (req.method || "GET").toUpperCase();
  const init: RequestInit = { method, headers };

  if (method !== "GET" && method !== "HEAD" && req.body) {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  try {
    const request = new Request(url.toString(), init);
    const response = await server.fetch(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });

    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).send("Internal Server Error");
  }
}
