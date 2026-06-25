import type { ReactNode } from "react";

// Help guide rendered inside the shared Modal, using the app's modal-head/body/foot layout.
const ITEMS: Array<[string, ReactNode]> = [
  ["Verktyg", "Välj Notis, Text, Rektangel, Cirkel eller Linje och klicka eller dra på ytan."],
  ["Rita", "Dra för att skapa rektangel, cirkel eller linje – formen visas medan du drar."],
  ["Redigera text", "Dubbelklicka på en notis, text eller form."],
  ["Färg", <>Klicka på en färg för att färga markeringen. <b>Dra en färg</b> till ytan för att släppa en notis i den färgen.</>],
  ["Textstorlek & fet", <>A− / A+ och <b>B</b> i verktygsfältet.</>],
  ["Markera flera", "Shift- eller ⌘-klicka objekt, eller Shift/⌘-dra en ruta över ytan."],
  ["Flytta & storlek", "Dra ett objekt för att flytta. Dra hörnen för att ändra storlek (ett objekt i taget)."],
  ["Ta bort", "Delete eller Backspace."],
  ["Pekläge", "Esc eller mellanslag växlar till Markera."],
  ["Ångra", "⌘Z (Ctrl+Z)."],
  ["Panorera & zooma", "Dra på tom yta för att panorera. Rulla med mushjulet för att zooma."],
];

export default function BoardHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="modal-head">
        <h2>Hjälp</h2>
        <button className="x" onClick={onClose} aria-label="Stäng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <dl className="board-help-list">
          {ITEMS.map(([term, desc]) => (
            <div className="board-help-row" key={term}>
              <dt>{term}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="modal-foot">
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onClose}>Stäng</button>
      </div>
    </>
  );
}
