"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const js = read("weber/compare.js"), html = read("weber/compare.html");
test("confronto: sola lettura, niente cache privata o URL pubblici", () => {
  assert.doesNotMatch(js, /\.(insert|update|upsert|delete|rpc|upload|remove|getPublicUrl)\s*\(|localStorage|sessionStorage|caches\./);
  assert.match(js, /requireAdministrator\(client\)/);
  assert.match(html, /id="compareWorkspace" hidden/);
  assert.match(js, /createSignedUrl\(file.object_path, 300\)/);
  assert.match(js, /checkedFile\(photo, state.owner, session.id\)/);
});
test("confronto: raggiungibile dal diario e asset statici disponibili offline", () => {
  assert.match(read("weber/diary.html"), /href="compare.html\?v=1"/);
  for (const file of ["compare.html", "compare.js", "compare-core.js", "compare.css"]) assert.ok(read("sw.js").includes(`"./weber/${file}"`));
  for (const match of html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)) {
    if (match[1].startsWith("https:")) continue;
    assert.ok(fs.existsSync(path.join(__dirname, match[1])), match[1]);
  }
});
test("confronto: tabella accessibile e foto responsive", () => {
  assert.match(html, /role="region"[^>]+tabindex="0"/);
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
  assert.match(html, /label for="trialA"/);
  assert.match(html, /label for="trialB"/);
  assert.match(read("weber/compare.css"), /overflow-x:auto/);
  assert.match(read("weber/compare.css"), /min-height:48px/);
  assert.match(read("weber/compare.css"), /max-width:600px/);
});
