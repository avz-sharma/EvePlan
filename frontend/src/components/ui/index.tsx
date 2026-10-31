import React, { useEffect, useRef } from "react";
import { clsx } from "clsx";

export const GlassPanel: React.FC<React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }> = ({ as: Tag = "section", className, ...props }) => (
  <Tag className={clsx("glass-panel rounded-2xl p-grid-3 md:p-grid-4", className)} {...props} />
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }> = ({ variant = "secondary", className, ...props }) => (
  <button className={clsx("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-[transform,opacity] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50", {
    "bg-accent text-white hover:bg-accent/90": variant === "primary",
    "border border-line bg-white/70 text-ink hover:bg-white": variant === "secondary",
    "text-ink hover:bg-accent/10": variant === "quiet",
    "bg-danger text-white hover:bg-danger/90": variant === "danger",
  }, className)} {...props} />
);

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, className, ...props }) => (
  <button aria-label={label} title={label} className={clsx("inline-flex size-11 items-center justify-center rounded-xl border border-line bg-white/70 transition-[transform,opacity] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[.98] hover:bg-white disabled:opacity-40", className)} {...props} />
);

export const Chip: React.FC<React.HTMLAttributes<HTMLSpanElement> & { tone?: "accent" | "gold" | "success" | "warning" | "danger" }> = ({ tone = "accent", className, ...props }) => (
  <span className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", {
    "border-accent/30 bg-accent/10 text-accent": tone === "accent",
    "border-gold/30 bg-gold/10 text-gold": tone === "gold",
    "border-success/30 bg-success/10 text-success": tone === "success",
    "border-warning/30 bg-warning/10 text-warning": tone === "warning",
    "border-danger/30 bg-danger/10 text-danger": tone === "danger",
  }, className)} {...props} />
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; detail?: string }> = ({ label, value, detail }) => (
  <div className="min-w-0 rounded-xl px-3 py-2">
    <div className="text-xs font-medium text-muted">{label}</div>
    <div className="truncate text-lg font-semibold text-ink">{value}</div>
    {detail && <div className="truncate text-xs text-muted">{detail}</div>}
  </div>
);

export const Banner: React.FC<React.HTMLAttributes<HTMLDivElement> & { tone?: "info" | "success" | "warning" | "danger" }> = ({ tone = "info", className, ...props }) => (
  <div role="status" className={clsx("rounded-xl border px-4 py-3 text-sm", {
    "border-accent/25 bg-accent/8 text-ink": tone === "info",
    "border-success/30 bg-success/8 text-success": tone === "success",
    "border-warning/30 bg-warning/8 text-warning": tone === "warning",
    "border-danger/30 bg-danger/8 text-danger": tone === "danger",
  }, className)} {...props} />
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => <div aria-hidden="true" className={clsx("rounded-lg bg-ink/10", className)} />;

export const EmptyState: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-dashed border-line p-8 text-center">
    <h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-muted">{children}</p>
  </div>
);

export const Tooltip: React.FC<React.HTMLAttributes<HTMLSpanElement> & { label: string }> = ({ label, ...props }) => <span title={label} aria-label={label} {...props} />;

export const Dialog: React.FC<{ open: boolean; label: string; onClose: () => void; children: React.ReactNode }> = ({ open, label, onClose, children }) => {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? dialog.current)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); dialog.current?.focus(); return; }
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? items[items.length - 1] : items[0]).focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="glass-panel my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-6">{children}</section>
  </div>;
};

export const Toast: React.FC<{ message: string | null }> = ({ message }) => message ? <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">{message}</div> : null;
