"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const errors = require("./auth-errors.js");

test("authentication errors distinguish invalid credentials", () => {
  assert.equal(errors.signInMessage(new Error("Invalid login credentials")), "Email o password non corrette.");
});

test("Safari and fetch network failures produce an actionable message", () => {
  for (const message of ["Load failed", "Failed to fetch", "Network request failed", "AbortError: timed out"]) {
    assert.match(errors.signInMessage(new Error(message)), /momentaneamente non disponibile/);
    assert.match(errors.signInMessage(new Error(message)), /premi di nuovo Accedi/);
  }
});

test("rate limits and unknown backend errors never expose raw details", () => {
  assert.match(errors.signInMessage({ status: 429, message: "Too many requests" }), /Troppi tentativi/);
  assert.equal(errors.signInMessage(new Error("private backend detail")), "Non riesco a completare l’accesso. Riprova tra poco.");
});

test("the login loads and caches the shared error mapper", () => {
  const home = fs.readFileSync("index.html", "utf8");
  const auth = fs.readFileSync("auth.js", "utf8");
  const worker = fs.readFileSync("sw.js", "utf8");

  assert.match(home, /auth-errors\.js\?v=1[\s\S]*auth\.js\?v=13/);
  assert.match(auth, /CucinaHubAuthErrors/);
  assert.match(auth, /signInMessage\(error\)/);
  assert.match(worker, /"\.\/auth-errors\.js"/);
  assert.match(worker, /const CACHE_NAME = "cucina-hub-v47";/);
});
