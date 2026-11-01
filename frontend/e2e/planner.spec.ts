import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

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
  await expect(page.getByRole("heading", { name: "Compare Saved Quotes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manual vendor entry", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Quotes", exact: true }).click();
  await page.getByRole("button", { name: "Snap a quote" }).click();
  const quote = page.getByRole("dialog", { name: "Compare a vendor quote" });
  await quote.getByLabel("Vendor name", { exact: true }).fill("Preserved quote draft");
  await quote.getByRole("button", { name: "Close quote comparison" }).click();
  await page.getByRole("button", { name: "Snap a quote" }).click();
  await expect(quote.getByLabel("Vendor name", { exact: true })).toHaveValue("Preserved quote draft");
});

for (const width of [390, 1280]) test(`keyless discovery at ${width}px`, async ({ page }) => {
  const plan = JSON.parse(readFileSync("../backend/app/fixtures/scenario_outputs.json", "utf8")).fixtures[0].updated_plan;
  await page.setViewportSize({ width, height: 844 });
  const forbidden: string[] = [];
  page.on("request", request => {
    if (/maps\.googleapis|places\.googleapis|maps\.gstatic|\/api\/vendors\/(search|[^/]+$)/.test(request.url())) forbidden.push(request.url());
  });
  await page.addInitScript(value => localStorage.setItem("eveplan_active_plan", JSON.stringify(value)), plan);
  await page.goto("/#/vendors");
  await expect(page.getByRole("heading", { name: "Discover vendors" })).toBeVisible();
  await page.getByLabel("Event type", { exact: true }).fill("Wedding");
  await page.getByLabel("City", { exact: true }).fill("");
  await page.getByRole("button", { name: /^Find / }).click();
  await expect(page.getByRole("alert")).toContainText("enter a city");
  await page.getByLabel("City", { exact: true }).fill("Amritsar, Punjab");
  const chips = page.getByRole("group", { name: "Vendor category", exact: true }).getByRole("button");
  for (const chip of await chips.all()) {
    await chip.click();
    await page.getByRole("button", { name: /^Find / }).click();
    const link = page.getByRole("link", { name: "Search on Google Maps", exact: true });
    const href = await link.getAttribute("href");
    expect(new URL(href!).searchParams.get("query")).toContain("in Amritsar, Punjab");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // Intercept the external page so this test neither scrapes nor depends on Google.
    await page.context().route("https://www.google.com/maps/**", route => route.fulfill({ body: "External Maps navigation verified" }));
    const popup = page.waitForEvent("popup");
    await link.click();
    const external = await popup; await external.waitForLoadState();
    expect(external.url()).toBe(href); await external.close();
    await page.getByRole("button", { name: "Search More Vendors", exact: true }).click();
    await expect(page.getByLabel("Event type", { exact: true })).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(forbidden).toEqual([]);
  await expect(page.getByText(/API key|billing account/i)).toHaveCount(0);
});

test("Google login precedes celebration setup and sign-out locks it", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    required: true, configured: true, user: authenticated ? { id: "mock-google-subject", name: "Host" } : null,
  } }));
  await page.route("**/api/auth/google", route => { authenticated = true; return route.fulfill({ status: 302, headers: { location: "/" } }); });
  await page.route("**/api/auth/logout", route => { authenticated = false; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Build a celebration plan" })).toHaveCount(0);
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page.getByRole("dialog", { name: "Build a celebration plan" })).toBeVisible();
  // Close the modal before exercising the account action behind it.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Build a celebration plan" })).toHaveCount(0);
});


for (const width of [390, 1280]) test(`saved quotation budget workflow at ${width}px`, async ({ page }) => {
  const plan = JSON.parse(readFileSync("../backend/app/fixtures/scenario_outputs.json", "utf8")).fixtures[0].updated_plan;
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(value => { if (!localStorage.getItem("eveplan_active_plan")) localStorage.setItem("eveplan_active_plan", JSON.stringify(value)); }, plan);
  await page.goto("/#/quotes");
  for (const [name, original, final] of [["Vendor Alpha", "120000", "100000"], ["Vendor Beta", "95000", "80000"]]) {
    await page.getByRole("button", { name: "Add a Manual Quote", exact: true }).click();
    await page.getByLabel("Vendor name", { exact: true }).fill(name);
    await page.getByLabel("Vendor's quoted price (₹)", { exact: true }).fill(original);
    await page.getByLabel("Negotiated/finalized price (₹)", { exact: true }).fill(final);
    await page.getByLabel("Description / inclusions", { exact: true }).fill("Host-entered scope");
    await page.getByRole("button", { name: "Save Quote", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const prompt = page.getByRole("dialog", { name: "Compare vendor quotations" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Compare vendors", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare Saved Quotes", exact: true })).toBeVisible();
  const beta = page.locator("article").filter({ has: page.getByRole("heading", { name: "Vendor Beta", exact: true }) });
  await beta.getByRole("button", { name: "Select for Budget", exact: true }).click();
  await expect(beta.getByText("Selected for budget", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("eveplan_active_plan")!);
    const bucket = plan.budget_buckets.find((b: { category: string }) => b.category === "Decor");
    return [bucket.allocated_max_inr, bucket.contingency_inr];
  })).toEqual([80000, 8000]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vendor Beta", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Budget", exact: true }).click();
  await page.getByLabel("Plan contingency (%)", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Update reserve", exact: true }).click();
  await expect(page.getByText("Reserve updated.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


for (const width of [390, 1280]) test(`soothing overview theme and budget at ${width}px`, async ({ page }) => {
  const plan = JSON.parse(readFileSync("../backend/app/fixtures/scenario_outputs.json", "utf8")).fixtures[0].updated_plan;
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(value => localStorage.setItem("eveplan_active_plan", JSON.stringify(value)), plan);
  await page.goto("/#/overview");
  await expect(page.getByRole("heading", { name: plan.title, exact: true })).toBeVisible();
  const projected = plan.budget_buckets.reduce((sum: number, b: { allocated_max_inr: number; contingency_inr: number }) => sum + b.allocated_max_inr + b.contingency_inr, 0);
  await expect(page.getByRole("progressbar", { name: "Budget allocated" })).toHaveAttribute("aria-valuenow", String(Math.round(projected / plan.total_budget_cap_inr * 100)));
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("9 49 141");
  await expect(page.locator("canvas[aria-hidden=true]")).toBeVisible();
  await page.mouse.move(250, 300);
  await expect(page.locator(".cursor-halo")).toHaveCSS("opacity", "1");
  await expect(page.locator("body")).toHaveCSS("cursor", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/overview-${width}.png`, fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".cursor-halo")).toHaveCSS("display", "none");
  await expect(page.locator("html")).not.toHaveClass(/custom-cursor-active/);
  await page.getByRole("tab", { name: "Vendors", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manual vendor entry", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Compare Saved Quotes", exact: true })).toBeVisible();
});

test("keyboard navigation reaches every tab and restores focus after a dialog", async ({ page }) => {
  const plan = JSON.parse(readFileSync("../backend/app/fixtures/scenario_outputs.json", "utf8")).fixtures[0].updated_plan;
  await page.addInitScript(value => localStorage.setItem("eveplan_active_plan", JSON.stringify(value)), plan);
  await page.goto("/#/overview");
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  for (const name of ["Events", "Budget", "Timeline", "Vendors", "Scenarios", "Quotes", "How it works"]) {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name, exact: true })).toBeFocused();
    await expect(page.getByRole("tabpanel", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("ArrowLeft");
  const launch = page.getByRole("button", { name: "Snap a quote", exact: true });
  await launch.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Compare a vendor quote" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test("budget recovery cards pass axe and apply from the keyboard", async ({ page }) => {
  const plan = JSON.parse(readFileSync("../backend/app/fixtures/scenario_outputs.json", "utf8")).fixtures[0].updated_plan;
  plan.total_budget_cap_inr = 100000;
  plan.budget_range_min_inr = 80000;
  plan.budget_range_max_inr = 100000;
  await page.addInitScript(value => localStorage.setItem("eveplan_active_plan", JSON.stringify(value)), plan);
  await page.goto("/#/budget");
  await page.getByLabel("Describe a change", { exact: true }).fill("+40 guests");
  await page.getByRole("button", { name: "Describe a change", exact: true }).press("Enter");
  const apply = page.getByRole("button", { name: "Apply Trade-Off", exact: true }).first();
  await expect(apply).toBeVisible();
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const audit = window as typeof window & { axe: { run: (root: Document) => Promise<{ violations: { id: string }[] }> } };
    return (await audit.axe.run(document)).violations.map(item => item.id);
  });
  expect(violations).toEqual([]);
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("eveplan_active_plan")!).notes.some((note: string) => note.startsWith("Applied trade-off:")))).toBe(true);
});
