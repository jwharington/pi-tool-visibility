import test from "node:test";
import assert from "node:assert/strict";
import { shouldHideToolCallForVisibilityMode } from "../visibility.ts";

const empty = new Set<string>();

test("does not hide before execution has started", () => {
  assert.equal(
    shouldHideToolCallForVisibilityMode("hide-older", "tool-1", empty, "tool-1", "tool-1", false),
    false,
  );
});

test("never hides the currently active tool", () => {
  assert.equal(
    shouldHideToolCallForVisibilityMode("hide-older", "tool-1", new Set(["tool-1"]), "tool-1", "tool-1", true),
    false,
  );
});

test("hides older completed tools in hide-older mode", () => {
  assert.equal(
    shouldHideToolCallForVisibilityMode("hide-older", "tool-1", empty, "tool-2", "tool-2", true),
    true,
  );
});

test("hide-all still hides completed tools after execution starts", () => {
  assert.equal(
    shouldHideToolCallForVisibilityMode("hide-all", "tool-1", empty, null, null, true),
    true,
  );
});

test("collapsed and expanded never hide tool calls", () => {
  assert.equal(shouldHideToolCallForVisibilityMode("collapsed", "tool-1", empty, null, null, true), false);
  assert.equal(shouldHideToolCallForVisibilityMode("expanded", "tool-1", empty, null, null, true), false);
});
