import { Email } from "@convex-dev/auth/providers/Email";

// Custom email provider for password sign-up / sign-in OTP verification.
// Emails an 8-digit code via the Resend HTTP API (no SDK dependency).
//
// When AUTH_RESEND_KEY is unset (local dev / tests) we log the code instead of
// calling Resend. This keeps the flow exercisable without a key and fails
// closed: a session is still only issued after the code is entered via the
// `email-verification` flow, so this does not weaken email verification.
export const ResendOTP = Email({
  id: "resend-otp",
  // OTP lifetime: 15 minutes.
  maxAge: 60 * 15,
  async generateVerificationToken() {
    // 8-digit numeric OTP from a CSPRNG (Web Crypto), zero-padded.
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] % 100_000_000).toString().padStart(8, "0");
  },
  async sendVerificationRequest({ identifier: email, token }: { identifier: string; token: string; [key: string]: unknown }) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    const from = process.env.AUTH_EMAIL_FROM ?? "onboarding@resend.dev";

    if (!apiKey) {
      // Dev / test fallback — no key configured.
      console.warn(
        `[ResendOTP] AUTH_RESEND_KEY unset; not sending email. ` +
          `Verification code for ${email}: ${token}`,
      );
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Din verifieringskod för Boköring",
        text:
          `Din verifieringskod är ${token}.\n\n` +
          `Koden gäller i 15 minuter. Ange den i appen för att slutföra ` +
          `inloggningen. Om du inte försökte logga in kan du ignorera detta ` +
          `mejl.`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }
  },
});
