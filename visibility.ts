export type VisibilityMode = "expanded" | "collapsed" | "hide-older" | "hide-all";

export const MODE_ORDER: VisibilityMode[] = [
  "hide-all",
  "hide-older",
  "collapsed",
  "expanded",
];

export function nextMode(current: VisibilityMode): VisibilityMode {
  const i = MODE_ORDER.indexOf(current);
  return MODE_ORDER[(i + 1) % MODE_ORDER.length] ?? "expanded";
}

export function shouldHideToolCallForVisibilityMode(
  mode: VisibilityMode,
  toolCallId: string,
  activeToolCallIds: ReadonlySet<string>,
  latestWrappedToolCallId: string | null,
  latestToolCallId: string | null,
  executionStarted: boolean,
): boolean {
  if (mode === "expanded" || mode === "collapsed") return false;
  if (!executionStarted) return false;
  if (activeToolCallIds.has(toolCallId)) return false;

  if (mode === "hide-all") return true;
  if (mode === "hide-older") {
    const latestVisibleToolCallId = latestWrappedToolCallId ?? latestToolCallId;
    return latestVisibleToolCallId !== null && toolCallId !== latestVisibleToolCallId;
  }
  return false;
}
