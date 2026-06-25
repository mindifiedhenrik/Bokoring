import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function googleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn("google");
    } catch (e) {
      console.error("Google sign-in failed:", e);
      setError("Kunde inte logga in med Google.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>Logga in</h1>
        <div className="sub">Logga in för att komma åt den delade arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <button type="button" className="btn btn-google" onClick={googleSignIn} disabled={busy}>
          {busy ? "…" : "Logga in med Google"}
        </button>
      </div>
    </div>
  );
}
