import { useState, useEffect } from "react";
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

function SettingsBody({ initial }: { initial: { archiveDays: number; pileThreshold: number; joinCode: string | null } }) {
  const tasks = useQuery(api.tasks.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const setSettings = useMutation(api.settings.set);
  const restore = useMutation(api.tasks.restore);
  const myProfile = useQuery(api.userProfiles.myProfile);
  const users = useQuery(api.users.list) ?? [];
  const setMyName = useMutation(api.userProfiles.setMyName);
  const removeMember = useMutation(api.users.removeMember);
  const rotateCode = useMutation(api.organizations.rotateCode);
  const createOrg = useMutation(api.organizations.create);
  const joinOrg = useMutation(api.organizations.join);
  const renameOrg = useMutation(api.organizations.rename);
  const currentOrg = useQuery(api.organizations.current);
  const modal = useModal();
  const toast = useToast();

  const [pile, setPile] = useState(String(initial.pileThreshold));
  const [archive, setArchive] = useState(String(initial.archiveDays));
  const [name, setName] = useState("");
  const [nameInit, setNameInit] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgNameInit, setOrgNameInit] = useState(false);

  useEffect(() => {
    if (myProfile && !nameInit) { setName(myProfile.displayName); setNameInit(true); }
  }, [myProfile, nameInit]);

  useEffect(() => {
    if (currentOrg && !orgNameInit) { setOrgName(currentOrg.namn); setOrgNameInit(true); }
  }, [currentOrg, orgNameInit]);

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
        <div className="section-label">Min profil</div>
        <div className="field">
          <label>Visningsnamn</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="text" value={name} placeholder={myProfile?.email ?? "Ditt namn"}
              onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={async () => { await setMyName({ displayName: name }); toast("Namn sparat"); }}>
              Spara namn
            </button>
          </div>
          <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
            Namnet visas som ansvarig på kort. Lämnas det tomt används din e-post.
          </div>
        </div>

        <div className="section-label" style={{ marginTop: "14px" }}>Organisation</div>
        <div className="field">
          <label>Organisationens namn</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={orgName}
              placeholder="Organisationens namn"
              onChange={(e) => setOrgName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost"
              onClick={async () => {
                const clean = orgName.trim();
                if (!clean) { toast("Namn krävs"); return; }
                await renameOrg({ namn: clean });
                toast("Namn sparat");
              }}
            >
              Spara namn
            </button>
          </div>
        </div>
        <div className="field">
          <label>Organisationskod (för att bjuda in)</label>
          {initial.joinCode ? (
            <>
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="text" readOnly value={initial.joinCode} style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={async () => {
                  try { await navigator.clipboard.writeText(initial.joinCode!); toast("Kod kopierad"); }
                  catch { toast("Kunde inte kopiera"); }
                }}>Kopiera</button>
                <button className="btn btn-ghost" onClick={async () => {
                  if (!confirm("Byt organisationskod? Den gamla koden slutar fungera.")) return;
                  await rotateCode({});
                  toast("Ny kod skapad");
                }}>Byt kod</button>
              </div>
              <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
                Dela koden med personer som ska gå med i organisationen.
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: "12.5px" }}>Ingen kod tillgänglig.</div>
          )}
        </div>
        <div className="field">
          <label>Skapa eller gå med i en organisation</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-ghost" onClick={async () => {
              const namn = prompt("Namn på den nya organisationen?");
              if (!namn) return;
              const { joinCode } = await createOrg({ namn });
              toast(`Organisation skapad · kod ${joinCode}`);
            }}>Ny organisation</button>
            <button className="btn btn-ghost" onClick={async () => {
              const code = prompt("Ange organisationskod att gå med i:");
              if (!code) return;
              try { await joinOrg({ code }); toast("Gick med i organisationen"); }
              catch { toast("Ogiltig kod"); }
            }}>Gå med via kod</button>
          </div>
        </div>

        <div className="section-label" style={{ marginTop: "14px" }}>Användare ({users.length})</div>
        <div className="arch-list">
          {users.map((u) => (
            <div key={u._id} className="arch-item">
              <span className="avatar">{(u.displayName[0] ?? "?").toUpperCase()}</span>
              <div className="ai-body">
                <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
                  {u.displayName}{u.isSelf ? " (du)" : ""}
                </div>
                <div className="muted" style={{ fontSize: "12px" }}>{u.email ?? "—"}</div>
              </div>
              {!u.isSelf && (
                <button className="btn btn-ghost" onClick={async () => {
                  if (!confirm(`Ta bort "${u.displayName}" från organisationen? Kort där hen är ansvarig blir utan ansvarig.`)) return;
                  await removeMember({ userId: u._id });
                  toast("Användare borttagen");
                }}>
                  Ta bort
                </button>
              )}
            </div>
          ))}
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
