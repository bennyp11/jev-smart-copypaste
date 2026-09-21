import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planPaste } from "./lib/smart-paste.js";
import { FORM_FIELDS } from "./lib/form-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT ?? 3000);

if (!process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set. Run with: node --env-file=.env server.js");
  process.exit(1);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "POST" && url.pathname === "/api/smart-paste") {
      const body = await readJson(req);
      const started = Date.now();
      const plan = await planPaste(body);
      plan.ms = Date.now() - started;
      return json(res, 200, plan);
    }
    if (req.method === "GET" && url.pathname === "/api/fields") {
      // Public shape of the form: the front-end renders from this so the schema lives in one place.
      return json(res, 200, FORM_FIELDS.map(({ id, label, shape, options }) => ({ id, label, shape, options: options ? Object.keys(options) : undefined })));
    }
    if (req.method === "GET") {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = path.join(PUBLIC, path.normalize(file));
      if (!filePath.startsWith(PUBLIC)) return json(res, 403, { error: "forbidden" });
      const data = await readFile(filePath);
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
      return res.end(data);
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    if (err.code === "ENOENT") return json(res, 404, { error: "not found" });
    console.error(err);
    json(res, 500, { error: err.message ?? String(err) });
  }
});

server.listen(PORT, () => console.log(`smart paste demo → http://localhost:${PORT}`));
