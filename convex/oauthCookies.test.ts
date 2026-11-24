// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// @convex-dev/auth 0.0.x sets its OAuth state cookies (PKCE verifier, state,
// nonce) with `SameSite=None; Partitioned`. Safari drops partitioned cookies on
// the return leg from Google, so the PKCE verifier goes missing, Google rejects
// the token exchange and the user has to sign in again. We patch the library
// (patches/@convex-dev+auth+*.patch) to use `SameSite=Lax` without
// `Partitioned`, which is what a top-level OAuth redirect needs.
// Upstream: https://github.com/get-convex/convex-auth/pull/322
test("OAuth state cookies are SameSite=Lax and not partitioned", () => {
  const source = readFileSync(
    join(process.cwd(), "node_modules/@convex-dev/auth/dist/server/cookies.js"),
    "utf8",
  );
  const block = source.match(/SHARED_COOKIE_OPTIONS = \{([\s\S]*?)\};/)?.[1];
  expect(block).toBeDefined();
  expect(block).toMatch(/sameSite:\s*"lax"/);
  expect(block).not.toMatch(/partitioned/);
});
