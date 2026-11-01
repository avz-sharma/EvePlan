// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BudgetProgress } from "../components/BudgetProgress";
afterEach(cleanup);
it("reflects real allocation changes and remaining funds", () => {
  const view = render(<BudgetProgress used={25000} total={100000} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
  expect(screen.getByText("₹75,000")).toBeTruthy();
  view.rerender(<BudgetProgress used={120000} total={100000} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  expect(screen.getByText("Over budget by ₹20,000")).toBeTruthy();
  expect(screen.getByText("₹0")).toBeTruthy();
});
it("handles an unset budget without an invalid percentage", () => {
  render(<BudgetProgress used={0} total={0} />);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  expect(screen.getByText("Set a budget to see the allocated percentage.")).toBeTruthy();
});
