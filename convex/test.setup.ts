import { exportPKCS8, generateKeyPair } from "jose";

// `@convex-dev/auth` mints a session JWT during sign-in (importPKCS8 RS256) and
// reads CONVEX_SITE_URL as the issuer. convex-test runs functions in-process, so
// these env vars must be present for any test that exercises the sign-in action.
// Generate an ephemeral keypair once per test process.
const { privateKey } = await generateKeyPair("RS256", { extractable: true });
process.env.JWT_PRIVATE_KEY ??= await exportPKCS8(privateKey);
process.env.CONVEX_SITE_URL ??= "https://example.convex.site";
