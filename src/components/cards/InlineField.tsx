import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type Base = { label: string; className?: string };
type Props =
  | (Base & { type: "text"; value: string; placeholder?: string; onSave: (v: string) => void })
  | (Base & { type: "textarea"; value: string; placeholder?: string; onSave: (v: string) => void })
  | (Base & { type: "number"; value: number; min?: number; max?: number; step?: number; suffix?: string; onSave: (v: number) => void })
  | (Base & { type: "date"; value: string; display: string; onSave: (v: string) => void })
  | (Base & { type: "select"; value: string; options: Option[]; render?: (v: string) => React.ReactNode; onSave: (v: string) => void });

export default function InlineField(props: Props) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLInputElement || ref.current instanceof HTMLTextAreaElement) {
        ref.current.select?.();
      }
    }
  }, [editing]);

  const stop = () => setEditing(false);

  function commitText(raw: string) {
    if (props.type === "number") {
      const n = Number(raw);
      props.onSave(isNaN(n) ? 0 : n);
    } else if (props.type === "text" || props.type === "textarea") {
      props.onSave(raw);
    } else {
      props.onSave(raw);
    }
    stop();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); stop(); }
    if (e.key === "Enter" && props.type !== "textarea") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement | HTMLSelectElement).blur();
    }
  }

  const labelEl = <div className="k">{props.label}</div>;

  if (!editing) {
    let shown: React.ReactNode;
    if (props.type === "number") shown = <>{props.value}{props.suffix ?? ""}</>;
    else if (props.type === "date") shown = props.display || "—";
    else if (props.type === "select") {
      const opt = props.options.find((o) => o.value === props.value);
      shown = props.render ? props.render(props.value) : (opt?.label ?? "—");
    } else shown = props.value?.trim() ? props.value : <span className="muted">Klicka för att lägga till…</span>;
    return (
      <div className={"info-item inline" + (props.className ? " " + props.className : "")}>
        {labelEl}
        <div className="v inline-v" tabIndex={0} role="button"
          onClick={() => setEditing(true)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}>
          {shown}
        </div>
      </div>
    );
  }

  return (
    <div className={"info-item inline editing" + (props.className ? " " + props.className : "")}>
      {labelEl}
      <div className="v">
        {props.type === "textarea" ? (
          <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} defaultValue={props.value}
            placeholder={props.placeholder} onBlur={(e) => commitText(e.target.value)} onKeyDown={onKeyDown} />
        ) : props.type === "select" ? (
          <select ref={ref as React.RefObject<HTMLSelectElement>} defaultValue={props.value}
            onBlur={(e) => commitText(e.target.value)} onChange={(e) => commitText(e.target.value)} onKeyDown={onKeyDown}>
            {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input ref={ref as React.RefObject<HTMLInputElement>}
            type={props.type === "number" ? "number" : props.type === "date" ? "date" : "text"}
            defaultValue={props.type === "date" ? props.value : String(props.value)}
            placeholder={props.type === "text" ? props.placeholder : undefined}
            min={props.type === "number" ? props.min : undefined}
            max={props.type === "number" ? props.max : undefined}
            step={props.type === "number" ? props.step : undefined}
            onBlur={(e) => commitText(e.target.value)} onKeyDown={onKeyDown} />
        )}
      </div>
    </div>
  );
}
