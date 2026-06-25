// Static help content rendered inside the shared Modal.
export default function BoardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="board-help">
      <h2>Tavla – guide</h2>
      <ul>
        <li><b>Verktyg:</b> välj Notis, Text, Rektangel, Cirkel eller Linje och klicka/dra på ytan.</li>
        <li><b>Rita:</b> dra för att skapa rektangel, cirkel eller linje – formen visas medan du drar.</li>
        <li><b>Redigera text:</b> dubbelklicka på en notis, text eller form.</li>
        <li><b>Färg:</b> klicka på en färg för att färga markeringen; <b>dra en färg</b> till ytan för att släppa en notis i den färgen.</li>
        <li><b>Textstorlek / fet:</b> A− / A+ och <b>B</b> i verktygsfältet.</li>
        <li><b>Markera flera:</b> Shift- eller ⌘-klicka objekt, eller Shift/⌘-dra en ruta över ytan.</li>
        <li><b>Flytta / ändra storlek:</b> dra ett objekt; dra hörnen för att ändra storlek (ett objekt i taget).</li>
        <li><b>Ta bort:</b> Delete eller Backspace.</li>
        <li><b>Pekläge:</b> Esc eller mellanslag växlar till Markera.</li>
        <li><b>Ångra:</b> ⌘Z (Ctrl+Z).</li>
        <li><b>Panorera:</b> dra på tom yta. <b>Zooma:</b> rulla med mushjulet.</li>
      </ul>
      <button className="board-help-close" onClick={onClose}>Stäng</button>
    </div>
  );
}
