type Cursor = { userId: string; x: number; y: number; name: string };

export default function Cursors({ cursors }: { cursors: Cursor[] }) {
  return (
    <g className="board-cursors">
      {cursors.map((c) => (
        <g key={c.userId} transform={`translate(${c.x}, ${c.y})`}>
          <path d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L11 11 Z" fill="#8a567a" stroke="#fff" strokeWidth={0.5} />
          <text x={12} y={14} fontSize={11} fill="#8a567a" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>{c.name}</text>
        </g>
      ))}
    </g>
  );
}
