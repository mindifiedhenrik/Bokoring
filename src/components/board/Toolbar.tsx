import { BOARD_COLORS, type BoardTool } from "../../lib/constants";

const TOOL_LABELS: Record<BoardTool, string> = {
  select: "Markera",
  note: "Notis",
  text: "Text",
  rect: "Rektangel",
  circle: "Cirkel",
  line: "Linje",
};

const TOOL_ICON: Record<BoardTool, string> = {
  select: "↖", note: "▣", text: "T", rect: "▭", circle: "◯", line: "／",
};

export default function Toolbar({
  tool, color, bold, fontSize, onTool, onColor, onSwatchPointerDown, onFontStep, onBold, onHelp,
}: {
  tool: BoardTool;
  color: string;
  bold: boolean;
  fontSize: number;
  onTool: (t: BoardTool) => void;
  onColor: (c: string) => void;
  onSwatchPointerDown: (c: string, e: React.PointerEvent) => void;
  onFontStep: (delta: number) => void;
  onBold: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="board-toolbar">
      <div className="board-tools">
        {(Object.keys(TOOL_LABELS) as BoardTool[]).map((t) => (
          <button
            key={t}
            className={"board-tool" + (t === tool ? " active" : "")}
            title={TOOL_LABELS[t]}
            onClick={() => onTool(t)}
          >{TOOL_ICON[t]}</button>
        ))}
      </div>

      <div className="board-text-controls">
        <button className="board-tool" title="Mindre text" onClick={() => onFontStep(-1)}>A−</button>
        <span className="board-font-size">{fontSize}</span>
        <button className="board-tool" title="Större text" onClick={() => onFontStep(1)}>A+</button>
        <button className={"board-tool" + (bold ? " active" : "")} title="Fet" onClick={onBold} style={{ fontWeight: 700 }}>B</button>
      </div>

      <div className="board-colors">
        {BOARD_COLORS.map((c) => (
          <button
            key={c}
            className={"board-swatch" + (c === color ? " active" : "")}
            style={{ background: c }}
            title={c + " (klicka: färga · dra: släpp notis)"}
            onClick={() => onColor(c)}
            onPointerDown={(e) => onSwatchPointerDown(c, e)}
          />
        ))}
      </div>

      <button className="board-help-btn" title="Hjälp" onClick={onHelp}>?</button>
    </div>
  );
}
