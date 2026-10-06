import { useState } from "react";

export default function AddStageColumn({ onCreate }: { onCreate: (namn: string) => Promise<boolean> }) {
  const [value, setValue] = useState<string | null>(null);

  const submit = async () => {
    const namn = value?.trim();
    if (!namn) { setValue(null); return; }
    if (await onCreate(namn)) setValue(null); // keep the input open on error
  };

  return (
    <div className="col col-add">
      {value === null ? (
        <button className="col-add-btn" onClick={() => setValue("")}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nytt steg
        </button>
      ) : (
        <input
          className="col-rename"
          autoFocus
          placeholder="Namn på steget"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { if (!value.trim()) setValue(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") setValue(null);
          }}
        />
      )}
    </div>
  );
}
