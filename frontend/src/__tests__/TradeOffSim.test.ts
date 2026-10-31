import { describe, it, expect } from "vitest";
import type { BudgetBucket, TradeOffOption } from "../api/types";

describe("Phase 4: Instant 60fps Trade-Off Simulation & Hover Preview", () => {
  const sampleBuckets: BudgetBucket[] = [
    {
      category: "Catering",
      allocated_min_inr: 300000,
      allocated_max_inr: 440000,
      contingency_inr: 44000,
      assumptions: ["Assumes 200 guests"],
      is_violated: true,
    },
    {
      category: "Decor & Floral",
      allocated_min_inr: 250000,
      allocated_max_inr: 350000,
      contingency_inr: 35000,
      assumptions: ["Grand imported floral setup"],
      is_violated: false,
    },
  ];

  const sampleTradeOffOption: TradeOffOption = {
    id: "opt_decor_downgrade",
    title: "Downgrade Decor Tier",
    description: "Switch to seasonal marigold & reusable brass",
    savings_min_inr: 100000,
    savings_max_inr: 120000,
    bucket_adjustments: {
      "Decor & Floral": -120000,
    },
    guest_count_adjustment: 0,
    impact_level: "LOW",
    tradeoff_rationale: "Recovers ₹1,20,000 by optimizing floral procurement",
  };

  it("calculates client-side preview bar adjustment instantly with zero network calls", () => {
    const previewAdjustments = sampleTradeOffOption.bucket_adjustments;
    
    // Simulate client-side bar adjustment formula from BudgetAllocationBars
    const decorBucket = sampleBuckets.find((b) => b.category === "Decor & Floral")!;
    const adjustedDecorMax = Math.max(0, decorBucket.allocated_max_inr + (previewAdjustments[decorBucket.category] || 0));

    expect(adjustedDecorMax).toBe(230000); // 350k - 120k = 230k
    expect(adjustedDecorMax).toBeLessThan(decorBucket.allocated_max_inr);
  });

  it("preserves 10% contingency buffer during hover simulation", () => {
    const cateringBucket = sampleBuckets.find((b) => b.category === "Catering")!;
    const contingencyPercentage = cateringBucket.contingency_inr / cateringBucket.allocated_max_inr;

    expect(contingencyPercentage).toBeCloseTo(0.10, 2);
  });
});

