import { expect, test } from "@playwright/test";

test("wizard, plan, streamed replan and degraded vendor assignment", async ({ page }) => {
  await page.goto("/");
  const wizard = page.getByRole("dialog", { name: "Build a celebration plan" });
  await expect(wizard).toBeVisible();
  await expect(wizard.getByText(/religion/i)).toHaveCount(0);
  await wizard.getByRole("button", { name: "Mehendi, Sangeet and Pheras over 3 days" }).click();
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  for (const [label, value] of Object.entries({
    "Plan name": "Smoke celebration", "Total guests": "120", City: "Pune",
    "Total budget minimum (₹)": "1000000", "Total budget maximum (₹)": "1500000",
    "First event date": "2027-05-01",
  })) await wizard.getByLabel(label, { exact: true }).fill(value);
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByLabel("Per-plate budget minimum (₹)", { exact: true }).fill("700");
  await wizard.getByLabel("Per-plate budget maximum (₹)", { exact: true }).fill("1000");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Back", exact: true }).click();
  await expect(wizard.getByLabel("Per-plate budget maximum (₹)", { exact: true })).toHaveValue("1000");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Build plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Smoke celebration" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("eveplan_active_plan")!).days
    .every((day: { events: { guest_count: number }[] }) => day.events.every(event => event.guest_count === 120)))).toBe(true);
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await page.getByLabel("Venue type", { exact: true }).first().fill("outdoor");
  await page.getByLabel("Venue type", { exact: true }).first().press("Tab");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("eveplan_active_plan")!).days[0].events[0].venue_type)).toBe("outdoor");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByLabel("Describe a change", { exact: true }).fill("+40 guests");
  await page.getByRole("button", { name: "Describe a change", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("eveplan_active_plan")!).guest_count)).toBe(160);
  await page.getByRole("tab", { name: "Vendors", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manual vendor entry" })).toBeVisible();
  await page.getByLabel("Vendor name", { exact: true }).fill("Host-entered venue");
  await page.getByLabel("Your quote (₹)", { exact: true }).fill("100000");
  await page.getByLabel("Category budget (₹)", { exact: true }).fill("90000");
  await page.getByLabel("Capacity", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Pick manual vendor for this event" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("eveplan_active_plan")!).vendor_assignments.length)).toBe(1);
  await page.getByRole("tab", { name: "Quotes", exact: true }).click();
  await page.getByRole("button", { name: "Snap a quote" }).click();
  const quote = page.getByRole("dialog", { name: "Compare a vendor quote" });
  await quote.getByLabel("Vendor name", { exact: true }).fill("Preserved quote draft");
  await quote.getByRole("button", { name: "Close quote comparison" }).click();
  await page.getByRole("button", { name: "Snap a quote" }).click();
  await expect(quote.getByLabel("Vendor name", { exact: true })).toHaveValue("Preserved quote draft");
});
