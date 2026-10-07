import { type ReactNode } from "react";

export function Panel({ title, hint, children, extra }: { title: string; hint?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="panel">
      <h3 style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {title}
        <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 12, color: "var(--ink-faint)" }}>{extra}</span>
      </h3>
      <div className="panel-body">
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

export function Chip({ kind, children }: { kind?: "chain" | "settle" | "alert" | "amber"; children: ReactNode }) {
  return <span className={`chip${kind ? " " + kind : ""}`}>{children}</span>;
}

export function Btn({ variant = "solid", small, children, ...rest }: {
  variant?: "solid" | "ghost" | "chain" | "settle" | "alert";
  small?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["btn", variant !== "solid" ? variant : "", small ? "small" : ""].filter(Boolean).join(" ");
  return <button className={cls} {...rest}>{children}</button>;
}

export function KV({ k, v, vClass }: { k: string; v: ReactNode; vClass?: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v${vClass ? " " + vClass : ""}`}>{v}</span>
    </div>
  );
}
