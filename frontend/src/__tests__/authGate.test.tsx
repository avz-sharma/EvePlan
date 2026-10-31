// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthGate } from "../components/AuthGate";
vi.mock("../App", () => ({ App: () => <h1>Celebration setup</h1> }));
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });
const session = (user: { id: string; name: string } | null, configured = true) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ required: true, configured, user }))));
};
it("shows Google login before mounting setup", async () => {
  session(null); render(<AuthGate />);
  expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Celebration setup" })).toBeNull();
});
it("shows setup only after a server-verified session and locks it on sign out", async () => {
  session({ id: "host", name: "Host" }); render(<AuthGate />);
  expect(await screen.findByRole("heading", { name: "Celebration setup" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Celebration setup" })).toBeNull();
});
it("does not bypass Google login when credentials are missing", async () => {
  session(null, false); render(<AuthGate />);
  expect(await screen.findByText(/being set up by the site owner/)).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Celebration setup" })).toBeNull();
});

it.each([
 ["invalid_client", /configuration update from the site owner/],
 ["session_expired", /cookies were blocked/],
])("explains %s without exposing provider details", async (reason, message) => {
 window.history.replaceState(null, "", `/?auth_error=${reason}`);
 session(null); render(<AuthGate />);
 expect((await screen.findByRole("alert")).textContent).toMatch(message);
});
