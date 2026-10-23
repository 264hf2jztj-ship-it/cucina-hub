"use strict";

// Test-only server. No proxy, dependencies, credentials or upstream HTTP calls.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../..");
const BASE = "adbef719af9bd8f363978abe3dd674dba37385e7";
const PAGES = ["ai/index.html", "chef/index.html", "planner/ai.html", "fermentation/fermentation-assistant.html"];
const ASSETS = [
  "auth-guard.js", "supabase-client.js", "page-navigation.js", "style.css", "icon.svg", "manifest.json",
  "ai/ai-hub.js", "ai/ai-hub.css", "chef/chef.js", "chef/chef.css",
  "planner/planner-ai.js", "planner/planner-ai-core.js", "planner/planner-ai.css",
  "fermentation/assistant-provider-ui.js", "fermentation/assistant-response-ui.js",
  "workflow-engine/fermentation-learning-engine.js",
  "workflow-engine/fermentation-assistant-context-engine.js",
  "workflow-engine/fermentation-assistant-response-engine.js"
];
const APP_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const CONTROL_CSP = APP_CSP.replace("connect-src 'none'", "connect-src 'self'").replace("frame-src 'none'", "frame-src 'self'");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function assertPrivatePort(ports, port) {
  if (!Array.isArray(ports) || !ports.some(p => Number(p.sourcePort) === port && String(p.visibility).toLowerCase() === "private")) {
    throw new Error("Porta non verificata PRIVATE. Aggiungi la porta nel pannello Ports e impostala Private.");
  }
}
function verifyCodespaces(port, env = process.env, execute = execFileSync) {
  if (env.CODESPACES !== "true" || !env.CODESPACE_NAME) throw new Error("Questo avvio richiede un Codespace già creato e autorizzato.");
  let ports;
  try {
    ports = JSON.parse(execute("gh", ["codespace", "ports", "--codespace", env.CODESPACE_NAME, "--json", "sourcePort,visibility"], {
      encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"]
    }));
  } catch { throw new Error("Impossibile verificare la porta con GitHub CLI. Nessun server avviato; non mostrare token."); }
  assertPrivatePort(ports, port);
}
function adaptHtml(source) {
  // Only replace external SDK transport, and add the test bootstrap FIRST.
  // Application controllers, inline logic, markup and styles stay original.
  return source.replace(/<script\b[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"[^>]*><\/script>/g, "")
    .replace(/<head>/i, '<head><script src="/__test/mock.js"></script>');
}
function createPreviewServer({ requirePrivate = false, port = 8787 } = {}) {
  const commit = git("rev-parse", "HEAD").trim();
  git("merge-base", "--is-ancestor", BASE, commit);
  // Read the application ONLY from the recorded Git commit, never a dirty file.
  const files = new Map([...PAGES, ...ASSETS].map(file => [file, git("show", `${commit}:${file}`)]));
  const cacheName = git("show", `${commit}:sw.js`).match(/const CACHE_NAME = "([^"]+)"/)?.[1];
  const meta = { commit, applicationBaseline: BASE, simulatedServices: true, browserTestCompleted: false, cacheName,
    applicationHashes: Object.fromEntries([...files].map(([file, content]) => [file, crypto.createHash("sha256").update(content).digest("hex")])) };
  let privateVerifiedAt = 0;
  function privateCheck() { if (requirePrivate) verifyCodespaces(port); privateVerifiedAt = Date.now(); }
  if (requirePrivate) privateCheck();
  const server = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", CONTROL_CSP);
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const send = (status, type, body) => { res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` }); res.end(req.method === "HEAD" ? "" : body); };
    if (!["GET", "HEAD"].includes(req.method)) return send(405, "text/plain", "Preview: richieste di scrittura vietate.");
    if (requirePrivate && Date.now() - privateVerifiedAt > 30000) {
      try { privateCheck(); } catch { return send(503, "text/plain", "Visibilità PRIVATE non verificabile. Preview bloccata."); }
    }
    let url;
    try { url = new URL(req.url, "http://preview.invalid"); } catch { return send(400, "text/plain", "URL non valido."); }
    if (url.origin !== "http://preview.invalid") return send(403, "text/plain", "Proxy esterni vietati.");
    const pathname = url.pathname;
    if (pathname === "/" || pathname === "/preview/") return send(200, "text/html", fs.readFileSync(path.join(__dirname, "control.html"), "utf8"));
    if (pathname === "/__test/meta.json") return send(200, "application/json", JSON.stringify(meta));
    const testFile = { "/__test/mock.js": "mock.js", "/__test/control.js": "control.js" }[pathname];
    if (testFile) return send(200, "text/javascript", fs.readFileSync(path.join(__dirname, testFile), "utf8"));
    if (pathname === "/app/supabase-config.js") {
      res.setHeader("Content-Security-Policy", APP_CSP);
      return send(200, "text/javascript", 'window.CUCINA_HUB_CONFIG=Object.freeze({supabaseUrl:"https://synthetic.invalid",supabasePublishableKey:"sb_publishable_SYNTHETIC_NEVER_SENT"});');
    }
    const file = pathname.startsWith("/app/") ? pathname.slice(5) : "";
    if (PAGES.includes(file)) {
      res.setHeader("Content-Security-Policy", APP_CSP);
      return send(200, "text/html", adaptHtml(files.get(file)));
    }
    if (ASSETS.includes(file)) {
      res.setHeader("Content-Security-Policy", APP_CSP);
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/manifest+json" : "image/svg+xml";
      return send(200, type, files.get(file));
    }
    if (pathname === "/app/planner/workspace.html" || pathname === "/app/index.html") {
      return send(200, "text/html", '<!doctype html><html lang="it"><meta charset="utf-8"><title>Limite preview</title><h1>Destinazione isolata</h1><p>Lo staging è simulato. Menu Package, login e Dashboard reali non sono eseguiti da questo harness. Nessun commit applicativo.</p><a href="/preview/" target="_top">Torna al controllo</a></html>');
    }
    return send(404, "text/plain", "Risorsa non inclusa nella preview. Nessuna connessione alla produzione.");
  });
  return { server, meta };
}
if (require.main === module) {
  try {
    const local = process.argv.includes("--local");
    if (local && process.env.CODESPACES === "true") throw new Error("--local non è consentito in Codespaces: verificare PRIVATE.");
    const { server, meta } = createPreviewServer({ requirePrivate: !local });
    server.on("error", () => { console.error("Avvio preview non riuscito. Verifica che la porta 8787 sia libera."); process.exitCode = 1; });
    server.listen(8787, "127.0.0.1", () => console.log(`S02 preview isolata — commit ${meta.commit}\nPorta 8787 PRIVATE (in Codespaces). Apri /preview/ dall'URL HTTPS del pannello Ports.\nServizi SIMULATI. Collaudo Safari: NOT TESTED. Ctrl+C arresta il server.`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createPreviewServer, adaptHtml, assertPrivatePort, verifyCodespaces, PAGES, ASSETS, APP_CSP };
