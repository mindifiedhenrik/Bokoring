import { useEffect } from "react";

export default function Modal({ wide, onClose, children }: { wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay open" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}
