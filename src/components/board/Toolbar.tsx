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
  tool, color, onTool, onColor,
}: {
  tool: BoardTool;
  color: string;
  onTool: (t: BoardTool) => void;
  onColor: (c: string) => void;
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
      <div className="board-colors">
        {BOARD_COLORS.map((c) => (
          <button
            key={c}
            className={"board-swatch" + (c === color ? " active" : "")}
            style={{ background: c }}
            title={c}
            onClick={() => onColor(c)}
          />
        ))}
      </div>
    </div>
  );
}
