import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch {
      setError(
        flow === "signIn"
          ? "Fel e-post eller lösenord."
          : "Kunde inte registrera. Kontrollera uppgifterna (lösenord minst 8 tecken)."
      );
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>{flow === "signIn" ? "Logga in" : "Skapa konto"}</h1>
        <div className="sub">Logga in för att komma åt den delade arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>E-post</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" autoFocus />
          </div>
          <div className="field">
            <label>Lösenord</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "…" : flow === "signIn" ? "Logga in" : "Skapa konto"}
          </button>
        </form>
        <div className="switch">
          {flow === "signIn" ? "Har du inget konto?" : "Har du redan ett konto?"}{" "}
          <button onClick={() => { setError(null); setFlow(flow === "signIn" ? "signUp" : "signIn"); }}>
            {flow === "signIn" ? "Registrera" : "Logga in"}
          </button>
        </div>
      </div>
    </div>
  );
}
