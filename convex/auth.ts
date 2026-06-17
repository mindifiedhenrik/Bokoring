import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Registration is gated by a shared secret (Convex env var SIGNUP_CODE).
      // `profile` runs on account creation; sign-in of existing accounts is unaffected.
      profile(params) {
        if (params.flow === "signUp") {
          const expected = process.env.SIGNUP_CODE;
          if (!expected || params.code !== expected) {
            throw new ConvexError("Ogiltig registreringskod");
          }
        }
        return { email: params.email as string };
      },
    }),
  ],
});
