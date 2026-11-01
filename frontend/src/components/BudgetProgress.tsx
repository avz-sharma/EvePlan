import { motion, useReducedMotion } from "framer-motion";
import { formatMoney } from "../lib/format";

/** Magic UI circular gauge pattern, adapted for real budget values and accessible progress. */
function AnimatedCircularProgressBar({ value, gaugePrimaryColor = "#09318d", gaugeSecondaryColor = "#ffe1f2" }: { value: number; gaugePrimaryColor?: string; gaugeSecondaryColor?: string }) {
  const reduced = useReducedMotion();
  const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return <div role="progressbar" aria-label="Budget allocated" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="relative size-40 shrink-0">
    <svg aria-hidden="true" viewBox="0 0 100 100" className="size-full -rotate-90"><circle cx="50" cy="50" r="43" fill="none" stroke={gaugeSecondaryColor} strokeWidth="9" /><motion.circle cx="50" cy="50" r="43" fill="none" stroke={gaugePrimaryColor} strokeWidth="9" strokeLinecap={percent === 0 ? "butt" : "round"} initial={false} animate={{ pathLength: percent / 100 }} transition={{ duration: reduced ? 0 : .85, ease: "easeOut" }} /></svg>
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-semibold text-accent">{Math.round(percent)}%</span><span className="text-xs text-muted">allocated</span></div>
  </div>;
}

export function BudgetProgress({ used, total }: { used: number; total: number }) {
  const remaining = Math.max(0, total - used), excess = Math.max(0, used - total);
  return <section aria-label="Budget at a glance" className="glass-panel flex flex-col items-start gap-7 sm:flex-row sm:items-center rounded-3xl p-6 md:p-8"><AnimatedCircularProgressBar value={total > 0 ? used / total * 100 : 0} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-gold">Room for every detail</p><h2 className="mt-2 text-2xl font-semibold">Your budget, in balance</h2><p className="mt-2 text-sm text-muted">Selected vendor costs, estimates and contingency reserve.</p><dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-muted">Used / allocated</dt><dd className="text-xl font-semibold text-accent">{formatMoney(used)}</dd></div><div><dt className="text-sm text-muted">Remaining</dt><dd className="text-xl font-semibold">{formatMoney(remaining)}</dd></div><div><dt className="text-sm text-muted">Total budget</dt><dd className="text-xl font-semibold">{formatMoney(total)}</dd></div></dl>{excess > 0 && <p className="mt-3 text-sm text-danger">Over budget by {formatMoney(excess)}</p>}{total <= 0 && <p className="mt-3 text-sm text-muted">Set a budget to see the allocated percentage.</p>}</div></section>;
}
