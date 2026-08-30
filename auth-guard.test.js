"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const guard = require("./auth-guard.js");

function clientFor({ user = { id: "user-1" }, role = "admin", sessionError = null, profileError = null } = {}) {
  let signOutCount = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: sessionError }),
      signOut: async () => { signOutCount += 1; return { error: null }; }
    },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select(columns) {
          assert.equal(columns, "role");
          return {
            eq(column, value) {
              assert.equal(column, "id");
              assert.equal(value, user.id);
              return { single: async () => ({ data: { role }, error: profileError }) };
            }
          };
        }
      };
    },
    signOutCount: () => signOutCount
  };
  return client;
}

test("administrator guard rejects a missing session without querying profiles", async () => {
  const client = clientFor({ user: null });
  const result = await guard.requireAdministrator(client);
  assert.deepEqual(result, { authorized: false, reason: "signed_out", session: null, user: null });
  assert.equal(client.signOutCount(), 0);
});

test("administrator guard accepts an admin profile", async () => {
  const client = clientFor();
  const result = await guard.requireAdministrator(client);
  assert.equal(result.authorized, true);
  assert.equal(result.user.id, "user-1");
  assert.equal(client.signOutCount(), 0);
});

test("administrator guard signs out an authenticated non-admin account", async () => {
  const client = clientFor({ role: "member" });
  const result = await guard.requireAdministrator(client);
  assert.deepEqual(result, { authorized: false, reason: "forbidden", session: null, user: null });
  assert.equal(client.signOutCount(), 1);
});

test("administrator guard fails closed when the profile cannot be verified", async () => {
  const client = clientFor({ profileError: new Error("profile unavailable") });
  await assert.rejects(() => guard.requireAdministrator(client), /profile unavailable/);
});
