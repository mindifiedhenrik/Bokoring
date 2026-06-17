import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { fmtDate } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function SettingsModal() {
  const settings = useQuery(api.settings.get);
  const modal = useModal();
  if (settings === undefined) {
    return (
      <Modal wide onClose={modal.close}>
        <div className="modal-body"><div className="muted">Laddar…</div></div>
      </Modal>
    );
  }
  return <SettingsBody initial={settings} />;
}

function SettingsBody({ initial }: { initial: { archiveDays: number; pileThreshold: number; signupCode: string | null } }) {
  const tasks = useQuery(api.tasks.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const setSettings = useMutation(api.settings.set);
  const restore = useMutation(api.tasks.restore);
  const modal = useModal();
  const toast = useToast();

  const [pile, setPile] = useState(String(initial.pileThreshold));
  const [archive, setArchive] = useState(String(initial.archiveDays));

  const archived = tasks
    .filter((t) => t.archived)
    .sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime());

  async function save() {
    const p = parseInt(pile, 10);
    const a = parseInt(archive, 10);
    await setSettings({
      pileThreshold: isNaN(p) || p < 0 ? 0 : p,
      archiveDays: isNaN(a) || a < 0 ? 0 : a,
    });
    modal.close();
    toast("Inställningar sparade");
  }

  return (
    <Modal wide onClose={modal.close}>
      <div className="modal-head">
        <h2>Inställningar</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="section-label">Registreringskod</div>
        <div className="field">
          <label>Kod för att skapa konto</label>
          {initial.signupCode ? (
            <>
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="text" readOnly value={initial.signupCode} style={{ flex: 1 }} />
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(initial.signupCode!);
                      toast("Kod kopierad");
                    } catch {
                      toast("Kunde inte kopiera");
                    }
                  }}
                >
                  Kopiera
                </button>
              </div>
              <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
                Dela koden med personer som ska kunna registrera ett konto.{" "}
                <a
                  style={{ color: "var(--accent-deep)" }}
                  href={`mailto:?subject=${encodeURIComponent("Inbjudan till Boköring CRM")}&body=${encodeURIComponent(
                    `Hej!\n\nDu kan skapa ett konto i Boköring CRM med den här registreringskoden:\n\n${initial.signupCode}\n\nÖppna appen, välj "Registrera" och ange koden.`,
                  )}`}
                >
                  Skicka i mejl
                </a>
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: "12.5px" }}>
              Ingen kod är satt. Sätt den med <code>npx convex env set SIGNUP_CODE "…"</code> för att tillåta registrering.
            </div>
          )}
        </div>

        <div className="section-label" style={{ marginTop: "14px" }}>Högar</div>
        <div className="field">
          <label>Bilda hög när en fas har fler än (kort)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={pile}
            onChange={(e) => setPile(e.target.value)}
          />
          <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
            När en fas i ett projekt har fler kort än så här buntas de ihop till en hög som kan öppnas och stängas. Sätt till <b>0</b> för att aldrig bilda högar.
          </div>
        </div>

        <div className="section-label" style={{ marginTop: "14px" }}>Arkivering</div>
        <div className="field">
          <label>Arkivera kort i "Done" efter (dagar)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={archive}
            onChange={(e) => setArchive(e.target.value)}
          />
          <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
            Kort som legat i Done längre än så här flyttas automatiskt till arkivet. Sätt till <b>0</b> för att stänga av arkivering.
          </div>
        </div>

        <div className="section-label" style={{ marginTop: "14px" }}>
          Arkiverade uppgifter ({archived.length})
        </div>
        <div className="arch-list">
          {archived.length === 0 ? (
            <div className="muted">Inga arkiverade uppgifter.</div>
          ) : (
            archived.map((t) => {
              const project = projects.find((p) => p._id === t.projectId);
              return (
                <div key={t._id} className="arch-item">
                  <span
                    className="stage-dot"
                    style={{ background: project?.color ?? "var(--line)" }}
                  />
                  <div className="ai-body">
                    <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{t.titel}</div>
                    <div className="muted" style={{ fontSize: "12px" }}>
                      {project?.namn ?? "Inget projekt"} · arkiverad {fmtDate(t.archivedAt ?? undefined)}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      await restore({ id: t._id });
                      toast("Uppgift återställd");
                    }}
                  >
                    Återställ
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="modal-foot">
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>Spara</button>
      </div>
    </Modal>
  );
}
