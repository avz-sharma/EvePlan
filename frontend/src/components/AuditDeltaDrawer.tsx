import React, { useState } from "react";
import type { CascadeDiff, PlanDelta } from "../api/types";
import { ChevronDown, ChevronUp, Code2, CheckCircle2 } from "lucide-react";

interface AuditDeltaDrawerProps {
  lastDelta: PlanDelta | null;
  lastDiff: CascadeDiff | null;
}

/** Show the latest deterministic change and its affected tasks and constraints. */
export const AuditDeltaDrawer: React.FC<AuditDeltaDrawerProps> = ({
  lastDelta,
  lastDiff,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/60 transition-[transform,opacity] duration-200"
      >
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-100">
            Review the change details
          </span>
          <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-mono">
            Deterministic calculation
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>{isOpen ? "Hide details" : "Show details"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-800 bg-slate-950 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* PlanDelta */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 font-sans font-semibold">
              <span>Your requested change:</span>
            </div>
            <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-64">
              {JSON.stringify(lastDelta || { info: "Describe a change to see it here." }, null, 2)}
            </pre>
          </div>

          {/* CascadeDiff */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 font-sans font-semibold">
              <span>Updated plan details:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Deterministic
              </span>
            </div>
            <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-64">
              {JSON.stringify(lastDiff || { info: "Your updated plan will appear here." }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

