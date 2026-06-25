import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export default function JoinOrgScreen() {
  const join = useMutation(api.organizations.join);
  const { signOut } = useAuthActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await join({ code });
      // On success the org query updates reactively and App routes onward.
    } catch {
      setError("Ogiltig kod. Kontrollera koden från din organisation.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>Gå med i en organisation</h1>
        <div className="sub">Ange koden från din organisation för att komma åt arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Organisationskod</label>
            <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod från din organisation" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "…" : "Gå med"}
          </button>
        </form>
        <div className="switch">
          Fel konto?{" "}
          <button onClick={() => signOut()}>Logga ut</button>
        </div>
      </div>
    </div>
  );
}
