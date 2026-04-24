import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";

class EmptyComponent implements Component {
  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {}
}

const EMPTY_COMPONENT = new EmptyComponent();

class HiddenToolCallSummaryComponent implements Component {
  constructor(
    private readonly component: Component,
    private readonly fallbackDescription: string,
    private readonly renderFallback: (text: string) => string,
    private readonly renderLineBackground: (text: string) => string,
  ) {}

  render(width: number): string[] {
    if (width <= 0) return [];

    const summaryWidth = Math.max(1, Math.floor(width / 4));
    const rendered = this.component
      .render(summaryWidth)
      .map((line) => truncateToWidth(line, summaryWidth, "..."))
      .filter((line) => hasVisibleNonWhitespace(line));

    const lines = rendered.length > 0
      ? rendered.slice(0, 2)
      : [this.renderFallback(truncateToWidth(this.fallbackDescription, summaryWidth, "..."))];

    return lines.map((line) => {
      const withBg = this.renderLineBackground(line);
      const pad = " ".repeat(Math.max(0, width - visibleWidth(withBg)));
      return `${pad}${withBg}`;
    });
  }

  invalidate(): void {
    this.component.invalidate();
  }
}

type VisibilityMode = "expanded" | "collapsed" | "hide-older" | "hide-all";

const MODE_ORDER: VisibilityMode[] = [
  "hide-all",
  "hide-older",
  "collapsed",
  "expanded",
];

const MODE_LABEL: Record<VisibilityMode, string> = {
  expanded: "expanded",
  collapsed: "collapsed",
  "hide-older": "hide older",
  "hide-all": "hide all",
};

type BuiltInToolName = "read" | "grep" | "find" | "ls" | "bash" | "edit" | "write";

type BuiltInToolMap = Record<BuiltInToolName, any>;

const builtInToolCache = new Map<string, BuiltInToolMap>();

function getBuiltInTools(cwd: string): BuiltInToolMap {
  let tools = builtInToolCache.get(cwd);
  if (!tools) {
    tools = {
      read: createReadToolDefinition(cwd),
      grep: createGrepToolDefinition(cwd),
      find: createFindToolDefinition(cwd),
      ls: createLsToolDefinition(cwd),
      bash: createBashToolDefinition(cwd),
      edit: createEditToolDefinition(cwd),
      write: createWriteToolDefinition(cwd),
    };
    builtInToolCache.set(cwd, tools);
  }
  return tools;
}

function parseMode(input: string): VisibilityMode | undefined {
  const value = input.trim().toLowerCase();
  if (!value) return undefined;

  if (["expanded", "expand", "e"].includes(value)) return "expanded";
  if (["collapsed", "collapse", "shrink", "c", "s"].includes(value)) return "collapsed";
  if (["hide-older", "hideolder", "older", "last", "last-only", "latest"].includes(value)) {
    return "hide-older";
  }
  if (["hide-all", "hideall", "all", "off", "hidden"].includes(value)) return "hide-all";

  return undefined;
}

function nextMode(current: VisibilityMode): VisibilityMode {
  const i = MODE_ORDER.indexOf(current);
  return MODE_ORDER[(i + 1) % MODE_ORDER.length] ?? "expanded";
}

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function hasVisibleNonWhitespace(text: string): boolean {
  return text.replace(/\x1b\[[0-9;]*m/g, "").trim().length > 0;
}

export default function piToolVisibility(pi: ExtensionAPI) {
  const STATE_CUSTOM_TYPE = "pi-tool-visibility/state";

  let mode: VisibilityMode = "collapsed";
  let latestToolCallId: string | null = null;
  let requestFooterRender: (() => void) | null = null;
  const activeToolCallIds = new Set<string>();

  const rememberToolCall = (toolCallId: string | undefined): void => {
    if (!toolCallId) return;
    latestToolCallId = toolCallId;
  };

  const shouldHideToolCall = (toolCallId: string): boolean => {
    if (mode === "expanded" || mode === "collapsed") return false;
    if (mode === "hide-all") return true;
    if (mode === "hide-older") {
      if (activeToolCallIds.has(toolCallId)) return false;
      return latestToolCallId !== null && toolCallId !== latestToolCallId;
    }
    return false;
  };

  const applyMode = (ctx: any): void => {
    const expanded = mode === "expanded";
    ctx.ui.setToolsExpanded(expanded);

    const glyphByMode: Record<VisibilityMode, string> = {
      expanded: "█",
      collapsed: "▄",
      "hide-older": "▂",
      "hide-all": " ",
    };

    const meter = mode === "hide-all"
      ? " "
      : ctx.ui.theme.fg("dim", glyphByMode[mode]);
    const themedStatus = `${ctx.ui.theme.fg("muted", "tools:")}${ctx.ui.theme.fg("muted", "[")}${meter}${ctx.ui.theme.fg("muted", "]")}`;

    ctx.ui.setStatus("pi-tool-visibility", themedStatus);
    requestFooterRender?.();
  };

  const persistMode = (): void => {
    pi.appendEntry(STATE_CUSTOM_TYPE, { mode, updatedAt: new Date().toISOString() });
  };

  const loadPersistedModeFromSession = (ctx: any): VisibilityMode | undefined => {
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i] as any;
      if (entry?.type !== "custom" || entry?.customType !== STATE_CUSTOM_TYPE) {
        continue;
      }
      const persisted = parseMode(String(entry?.data?.mode ?? ""));
      if (persisted) {
        return persisted;
      }
    }
    return undefined;
  };

  const bootstrapFromSession = (ctx: any): void => {
    const entries = ctx.sessionManager.getEntries();
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const message = (entry as any).message;
      if (message?.role === "toolResult" && typeof message.toolCallId === "string") {
        rememberToolCall(message.toolCallId);
      }
    }
  };

  const installFooter = (ctx: any): void => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const footerRender = () => tui.requestRender();
      requestFooterRender = footerRender;
      const stopWatchingBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          if (requestFooterRender === footerRender) requestFooterRender = null;
          stopWatchingBranch();
        },
        invalidate() {},
        render(width: number): string[] {
          const entries = ctx.sessionManager.getEntries();
          let totalInput = 0;
          let totalOutput = 0;
          let totalCacheRead = 0;
          let totalCacheWrite = 0;
          let totalCost = 0;

          for (const entry of entries) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              totalInput += entry.message.usage.input;
              totalOutput += entry.message.usage.output;
              totalCacheRead += entry.message.usage.cacheRead;
              totalCacheWrite += entry.message.usage.cacheWrite;
              totalCost += entry.message.usage.cost.total;
            }
          }

          const contextUsage = ctx.getContextUsage();
          const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const contextPercentValue = contextUsage?.percent ?? 0;
          const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
          const contextPercentDisplay = contextPercent === "?"
            ? `?/${formatTokens(contextWindow)}`
            : `${contextPercent}%/${formatTokens(contextWindow)}`;

          let contextPercentText = contextPercentDisplay;
          if (contextPercentValue > 90) {
            contextPercentText = theme.fg("error", contextPercentDisplay);
          } else if (contextPercentValue > 70) {
            contextPercentText = theme.fg("warning", contextPercentDisplay);
          }

          const statsParts: string[] = [];
          if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
          if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
          if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
          if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

          const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
          if (totalCost || usingSubscription) {
            statsParts.push(`$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
          }
          statsParts.push(contextPercentText);

          let left = statsParts.join(" ");
          let leftWidth = visibleWidth(left);
          if (leftWidth > width) {
            left = truncateToWidth(left, width, "...");
            leftWidth = visibleWidth(left);
          }

          let pwd = ctx.cwd;
          const home = process.env.HOME || process.env.USERPROFILE;
          if (home && pwd.startsWith(home)) {
            pwd = `~${pwd.slice(home.length)}`;
          }

          const branch = footerData.getGitBranch();
          if (branch) {
            pwd = `${pwd} (${branch})`;
          }

          const sessionName = pi.getSessionName();
          if (sessionName) {
            pwd = `${pwd} • ${sessionName}`;
          }

          const statuses = footerData.getExtensionStatuses();
          const toolStatus = sanitizeStatusText(statuses.get("pi-tool-visibility") ?? "");

          const modelName = ctx.model?.id || "no-model";
          let modelText = modelName;
          if (ctx.model?.reasoning) {
            const thinkingLevel = (ctx.sessionManager as any).state?.thinkingLevel || "off";
            modelText = thinkingLevel === "off"
              ? `${modelName} • thinking off`
              : `${modelName} • ${thinkingLevel}`;
          }

          if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
            const candidate = `(${ctx.model.provider}) ${modelText}`;
            if (leftWidth + 2 + visibleWidth(candidate) <= width) {
              modelText = candidate;
            }
          }

          const rightSegments = [modelText, toolStatus].filter(Boolean);
          let right = rightSegments.join("  ");
          const availableForRight = Math.max(0, width - leftWidth - 2);
          if (availableForRight === 0) {
            right = "";
          } else if (visibleWidth(right) > availableForRight) {
            right = truncateToWidth(right, availableForRight, "...");
          }

          let statsLine = theme.fg("dim", left);
          if (right) {
            const padding = " ".repeat(Math.max(2, width - leftWidth - visibleWidth(right)));
            statsLine += theme.fg("dim", `${padding}${right}`);
          }

          const lines = [truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")), truncateToWidth(statsLine, width)];

          const otherStatuses = Array.from(statuses.entries())
            .filter(([key]) => key !== "pi-tool-visibility")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatusText(text))
            .filter(Boolean);

          if (otherStatuses.length > 0) {
            lines.push(truncateToWidth(otherStatuses.join(" "), width, theme.fg("dim", "...")));
          }

          return lines;
        },
      };
    });
  };

  const registerWrappedTool = (toolName: BuiltInToolName): void => {
    pi.registerTool({
      name: toolName,
      label: toolName,
      description: getBuiltInTools(process.cwd())[toolName].description,
      promptSnippet: getBuiltInTools(process.cwd())[toolName].promptSnippet,
      promptGuidelines: getBuiltInTools(process.cwd())[toolName].promptGuidelines,
      parameters: getBuiltInTools(process.cwd())[toolName].parameters,
      prepareArguments: getBuiltInTools(process.cwd())[toolName].prepareArguments,
      renderShell: "self",

      async execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<any>> {
        rememberToolCall(toolCallId);
        activeToolCallIds.add(toolCallId);
        const delegate = getBuiltInTools(ctx.cwd)[toolName];
        try {
          return await delegate.execute(toolCallId, params, signal, onUpdate, ctx);
        } finally {
          activeToolCallIds.delete(toolCallId);
        }
      },

      renderCall(args, theme, context): Component {
        const delegate = getBuiltInTools(context.cwd)[toolName];

        if (shouldHideToolCall(context.toolCallId)) {
          const component = typeof delegate.renderCall === "function"
            ? delegate.renderCall(args, theme, context)
            : EMPTY_COMPONENT;

          return new HiddenToolCallSummaryComponent(
            component,
            delegate.description,
            (text) => theme.fg("toolTitle", text),
            (text) => theme.bg("toolPendingBg", text),
          );
        }

        if (typeof delegate.renderCall === "function") {
          return delegate.renderCall(args, theme, context);
        }

        return EMPTY_COMPONENT;
      },

      renderResult(result, options, theme, context): Component {
        if (shouldHideToolCall(context.toolCallId)) return EMPTY_COMPONENT;

        const delegate = getBuiltInTools(context.cwd)[toolName];
        if (typeof delegate.renderResult === "function") {
          return delegate.renderResult(result, options, theme, context);
        }

        return EMPTY_COMPONENT;
      },
    });
  };

  registerWrappedTool("read");
  registerWrappedTool("grep");
  registerWrappedTool("find");
  registerWrappedTool("ls");
  registerWrappedTool("bash");
  registerWrappedTool("edit");
  registerWrappedTool("write");

  pi.on("session_start", (_event, ctx) => {
    const restoredMode = loadPersistedModeFromSession(ctx);
    mode = restoredMode ?? (ctx.ui.getToolsExpanded() ? "expanded" : "collapsed");
    bootstrapFromSession(ctx);
    installFooter(ctx);
    applyMode(ctx);
    ctx.ui.notify(
      `pi-tool-visibility loaded (${MODE_LABEL[mode]}). Use /tool-visibility cycle|expanded|collapsed|hide-older|hide-all.`,
      "info",
      { timeout: 2500 },
    );
  });

  pi.on("tool_execution_start", (event, _ctx) => {
    rememberToolCall(event.toolCallId);
    activeToolCallIds.add(event.toolCallId);
    requestFooterRender?.();
  });

  pi.on("tool_execution_end", (event, _ctx) => {
    activeToolCallIds.delete(event.toolCallId);
    rememberToolCall(event.toolCallId);
    requestFooterRender?.();
  });

  pi.registerShortcut("ctrl+alt+o", {
    description: "Cycle tool visibility (hide all -> hide older -> collapsed -> expanded)",
    handler: async (ctx) => {
      mode = nextMode(mode);
      persistMode();
      applyMode(ctx);
    },
  });

  pi.registerCommand("tool-visibility", {
    description: "Set/cycle tool visibility: expanded, collapsed, hide-older, hide-all, cycle",
    getArgumentCompletions: (prefix) => {
      const values = ["cycle", "expanded", "collapsed", "hide-older", "hide-all"];
      return values
        .filter((value) => value.startsWith(prefix.toLowerCase()))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg || arg === "cycle") {
        mode = nextMode(mode);
      } else {
        const requested = parseMode(arg);
        if (!requested) {
          ctx.ui.notify(
            "Invalid mode. Use: expanded, collapsed, hide-older, hide-all, or cycle",
            "error",
          );
          return;
        }
        mode = requested;
      }

      persistMode();
      applyMode(ctx);
    },
  });

  pi.registerCommand("tool-visibility-status", {
    description: "Show current tool-visibility mode and tracked latest tool call",
    handler: async (_args, ctx) => {
      applyMode(ctx);
      const latest = latestToolCallId ?? "none";
      ctx.ui.notify(
        `Tool visibility status: mode=${mode} (${MODE_LABEL[mode]}), latestToolCallId=${latest}`,
        "info",
      );
    },
  });
}
