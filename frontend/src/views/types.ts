import type { CascadeDiff, EventPlan, PlanDelta, TradeOffOption, VendorAssignment } from "../api/types";

export interface PlanViewProps {
  plan: EventPlan;
  lastDelta: PlanDelta | null;
  lastDiff: CascadeDiff | null;
  tradeoffOptions: TradeOffOption[];
  previewAdjustments: Record<string, number> | null;
  onPreview: (value: Record<string, number> | null) => void;
  onApplyTradeOff: (option: TradeOffOption) => void;
  forkedPlan: EventPlan | null;
  onFork: () => void;
  onSwitchFork: () => void;
  onClearFork: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: EventPlan[];
  historyIndex: number;
  onUndo: () => void;
  onRedo: () => void;
  onOpenQuotes: () => void;
  onPlanUpdated: (plan: EventPlan, diff: CascadeDiff) => void;
  onAssignVendor: (assignment: VendorAssignment, branch: "A" | "B") => Promise<void>;
  onTriggerScenario: (scenario: { delta: PlanDelta; label: string }) => void;
  isLoading: boolean;
}

export type TimelineProps = Pick<PlanViewProps, "plan" | "lastDiff"> & { isLoading: boolean };
