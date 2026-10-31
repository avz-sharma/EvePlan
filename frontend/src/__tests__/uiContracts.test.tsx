// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Tabs } from "../components/ui/Tabs";
import { useRequestController } from "../lib/useRequestController";

afterEach(cleanup);

it("supports keyboard navigation and focus in the tab list", () => {
  const change = vi.fn();
  const { getAllByRole } = render(<Tabs tabs={[{ id: "a", label: "First" }, { id: "b", label: "Second" }]}
    value="a" onChange={change} />);
  const [first, second] = getAllByRole("tab");
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(document.activeElement).toBe(second);
  expect(change).toHaveBeenLastCalledWith("b");
  fireEvent.keyDown(second, { key: "Home" });
  expect(document.activeElement).toBe(first);
  expect(change).toHaveBeenLastCalledWith("a");
});

it("aborts both replaced requests and the current request on unmount", () => {
  const { result, unmount } = renderHook(useRequestController);
  const previous = result.current.begin();
  const current = result.current.begin();
  expect(previous.aborted).toBe(true);
  expect(current.aborted).toBe(false);
  unmount();
  expect(current.aborted).toBe(true);
});
