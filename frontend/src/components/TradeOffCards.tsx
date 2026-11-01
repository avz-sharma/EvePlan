import React from "react";
import { m as motion, useReducedMotion } from "framer-motion";
import type { TradeOffOption } from "../api/types";
import { Sparkles, ArrowRight } from "lucide-react";
import { formatMoney } from "../lib/format";

interface TradeOffCardsProps {
  options: TradeOffOption[];
  onHoverOption: (adjustments: Record<string, number> | null) => void;
  onApplyOption: (option: TradeOffOption) => void;
}

export const TradeOffCards: React.FC<TradeOffCardsProps> = ({
  options,
  onHoverOption,
  onApplyOption,
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (options.length === 0) {
    return null;
  }

  const getImpactBadge = (impact: string) => {
    switch (impact.toUpperCase()) {
      case "LOW":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "MEDIUM":
        return "bg-amber-950 text-amber-300 border-amber-800";
      case "HIGH":
        return "bg-purple-950 text-purple-300 border-purple-800";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Ways to adjust the budget
          </h3>
          <p className="text-xs text-slate-400">
            Preview an option before applying it to your plan.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {options.map((opt) => (
          <motion.div
            key={opt.id}
            tabIndex={0}
            role="button"
            className="group relative bg-slate-900 border border-slate-800 hover:border-amber-500/70 rounded-xl p-4 transition-[transform,opacity] duration-200 flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-amber-500"
            onMouseEnter={() => onHoverOption(opt.bucket_adjustments)}
            onMouseLeave={() => onHoverOption(null)}
            onFocus={() => onHoverOption(opt.bucket_adjustments)}
            onBlur={() => onHoverOption(null)}
            whileHover={shouldReduceMotion ? {} : { y: -3, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 350, damping: 25, bounce: 0 }}
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getImpactBadge(
                    opt.impact_level
                  )}`}
                >
                  {opt.impact_level} Impact
                </span>
                <span className="text-xs font-semibold text-emerald-400">
                  Save {formatMoney(opt.savings_max_inr)}
                </span>
              </div>

              <h4 className="text-sm font-semibold text-slate-100 group-hover:text-amber-400">
                {opt.title}
              </h4>

              <p className="text-xs text-slate-400 leading-relaxed">
                {opt.description}
              </p>

              <div className="p-2 bg-slate-950/80 rounded border border-slate-800 text-[11px] text-slate-300">
                <span className="font-medium text-slate-400">Why this may help: </span>
                {opt.tradeoff_rationale}
              </div>
            </div>

            <button
              onClick={() => onApplyOption(opt)}
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-medium text-xs rounded-lg border border-amber-500/40 hover:border-amber-500 transition-[transform,opacity] duration-200"
            >
              <span>Apply Trade-Off</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

