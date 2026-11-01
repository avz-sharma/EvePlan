/** Ordered plan sections shared by route selection and keyboard tab navigation. */
export const tabs = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "budget", label: "Budget" },
  { id: "timeline", label: "Timeline" },
  { id: "vendors", label: "Vendors" },
  { id: "scenarios", label: "Scenarios" },
  { id: "quotes", label: "Quotes" },
  { id: "how-it-works", label: "How it works" },
] as const;

/** Valid plan-section route IDs derived from the tab configuration. */
export type TabId = (typeof tabs)[number]["id"];
