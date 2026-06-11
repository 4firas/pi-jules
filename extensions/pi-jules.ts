import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────────────

interface JulesSession {
  id: string;
  description: string;
  repo: string;
  lastActive: string;
  status: string;
}

// ─── Kaomoji ─────────────────────────────────────────────────────────────────

const FACES = {
  ready:     "(^-^)",
  planning:  "(・_・)",
  running:   "(>_<)",
  completed: "(^_^)",
  failed:    "(x_x)",
  cancelled: "(-_-)",
  error:     "(◎_◎)",
  unknown:   "(?_?)",
  working:   "(^_^)ノ",
  idle:      "(._.)",
  unavailable: "(¬_¬)",
} as const;

function statusFace(status: string): string {
  switch (status.toLowerCase()) {
    case "planning":    return FACES.planning;
    case "running":     return FACES.running;
    case "completed":   return FACES.completed;
    case "failed":      return FACES.failed;
    case "cancelled":   return FACES.cancelled;
    case "error":       return FACES.error;
    default:            return FACES.unknown;
  }
}

function isActive(status: string): boolean {
  const s = status.toLowerCase();
  return s === "planning" || s === "running" || s === "in_progress" || s === "queued";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function run(cmd: string, timeout = 30000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { timeout });
}

async function fetchSessions(): Promise<JulesSession[]> {
  try {
    const { stdout } = await run("jules remote list --session", 15000);
    return parseSessionList(stdout);
  } catch {
    return [];
  }
}

function parseSessionList(output: string): JulesSession[] {
  const lines = output.trim().split("\n").filter(l => l.trim());
  if (lines.length <= 1) return [];

  return lines.slice(1).map(line => {
    const cols = line.trim().split(/\s{2,}/);
    return {
      id: cols[0]?.trim() || "",
      description: cols[1]?.trim() || "",
      repo: cols[2]?.trim() || "",
      lastActive: cols[3]?.trim() || "",
      status: cols[4]?.trim() || "Unknown",
    };
  }).filter(s => s.id);
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  let knownCompleted = new Set<string>();
  let isAvailable = false;

  // ── Status & Widget ──────────────────────────────────────────────────────

  async function updateStatus(ctx: any) {
    try {
      await run("jules version", 5000);
      isAvailable = true;
    } catch {
      isAvailable = false;
      ctx.ui.setStatus("jules", `jules ${FACES.unavailable}`);
      // Widget removed - using setStatus only for footer display
      return;
    }

    const sessions = await fetchSessions();
    const active = sessions.filter(s => isActive(s.status));

    if (active.length === 0) {
      ctx.ui.setStatus("jules", `jules ${FACES.ready}`);
    } else {
      ctx.ui.setStatus("jules", `jules ${FACES.running} (${active.length} active)`);
    }
  }

  // ── Completion notifications ─────────────────────────────────────────────

  async function checkForCompletions(ctx: any) {
    if (!isAvailable) return;
    const sessions = await fetchSessions();
    for (const s of sessions) {
      if (s.status.toLowerCase() === "completed" && !knownCompleted.has(s.id)) {
        knownCompleted.add(s.id);
        const desc = s.description.length > 40 ? s.description.slice(0, 37) + "..." : s.description;
        ctx.ui.notify(`jules done ${FACES.completed} ${desc} [${s.id.slice(-6)}]`, "success");
      }
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    knownCompleted = new Set();
    await updateStatus(ctx);

    const sessions = await fetchSessions();
    for (const s of sessions) {
      if (s.status.toLowerCase() === "completed") {
        knownCompleted.add(s.id);
      }
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    await checkForCompletions(ctx);
    await updateStatus(ctx);
  });

  // ── Tool: Create Session ─────────────────────────────────────────────────

  pi.registerTool({
    name: "jules_create_session",
    label: "Create Jules Session",
    description: "Create a new asynchronous coding session with Jules. Jules works in the background — you can keep going and pull results later.",
    promptSnippet: "Delegate a coding task to Jules for async background execution",
    promptGuidelines: [
      "Use jules_create_session to delegate a task to Jules (Google's async coding agent)",
      "Jules sessions run in a VM — they clone the repo, work autonomously, and produce a patch",
      "Current working directory's repo is used by default, or specify repo as 'owner/repo'",
      "Use parallel (1-5) to create multiple sessions tackling the same task differently",
    ],
    parameters: Type.Object({
      task: Type.String({ description: "Clear task description for Jules" }),
      repo: Type.Optional(Type.String({ description: "Repository as 'owner/repo' (defaults to cwd)" })),
      parallel: Type.Optional(Type.Number({ description: "Parallel sessions 1-5 (default 1)", minimum: 1, maximum: 5 })),
    }),
    async execute(_id, params, signal) {
      try {
        let cmd = "jules new";
        if (params.repo) cmd += ` --repo ${params.repo}`;
        if (params.parallel && params.parallel > 1) cmd += ` --parallel ${params.parallel}`;
        cmd += ` ${JSON.stringify(params.task)}`;

        const { stdout, stderr } = await run(cmd, 30000);

        const sessionIdMatch = stdout.match(/(\d{10,})/);
        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

        let result = `${FACES.ready} jules session created!\n\n`;
        if (sessionId) result += `Session ID: ${sessionId}\n`;
        result += `\n${stdout}`;
        if (stderr && !stderr.includes("warning")) result += `\n${stderr}`;

        return {
          content: [{ type: "text", text: result }],
          details: { sessionId, stdout: stdout.trim() },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `${FACES.failed} failed to create jules session\n\n${error.message}` }],
          details: { error: error.message },
          isError: true,
        };
      }
    },
  });

  // ── Tool: List Sessions ──────────────────────────────────────────────────

  pi.registerTool({
    name: "jules_list_sessions",
    label: "List Jules Sessions",
    description: "List all Jules sessions with their status, repo, and description.",
    promptSnippet: "List all Jules sessions and their current status",
    promptGuidelines: [
      "Use jules_list_sessions to see what Jules is working on and what's done",
      "Session IDs are needed for pull and teleport operations",
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      try {
        const { stdout } = await run("jules remote list --session", 15000);
        const sessions = parseSessionList(stdout);

        if (sessions.length === 0) {
          return {
            content: [{ type: "text", text: `${FACES.idle} no jules sessions found.` }],
            details: { sessions: [] },
          };
        }

        const active = sessions.filter(s => isActive(s.status));
        const completed = sessions.filter(s => s.status.toLowerCase() === "completed");

        let result = `${FACES.ready} ${sessions.length} session${sessions.length > 1 ? "s" : ""}`;
        if (active.length > 0) result += ` — ${active.length} active`;
        if (completed.length > 0) result += ` — ${completed.length} completed`;
        result += "\n\n";

        if (active.length > 0) {
          result += `${FACES.working} active:\n`;
          for (const s of active) {
            result += `  ${statusFace(s.status)} ${s.id} — ${s.description} (${s.repo}) [${s.status}]\n`;
          }
          result += "\n";
        }

        if (completed.length > 0) {
          result += `${FACES.completed} completed:\n`;
          for (const s of completed) {
            result += `  ${FACES.completed} ${s.id} — ${s.description} (${s.repo})\n`;
          }
          result += "\n";
        }

        const other = sessions.filter(s => !isActive(s.status) && s.status.toLowerCase() !== "completed");
        if (other.length > 0) {
          result += `other:\n`;
          for (const s of other) {
            result += `  ${statusFace(s.status)} ${s.id} — ${s.description} (${s.repo}) [${s.status}]\n`;
          }
        }

        return {
          content: [{ type: "text", text: result }],
          details: { sessions, active: active.length, completed: completed.length },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `${FACES.failed} failed to list sessions\n\n${error.message}` }],
          details: { error: error.message },
          isError: true,
        };
      }
    },
  });

  // ── Tool: Pull Result ────────────────────────────────────────────────────

  pi.registerTool({
    name: "jules_pull_result",
    label: "Pull Jules Result",
    description: "Pull the patch/diff from a completed Jules session. Set apply=true to apply changes to the local repo.",
    promptSnippet: "Pull results from a completed Jules session",
    promptGuidelines: [
      "Use jules_pull_result to get the patch from a completed session",
      "Set apply=true to automatically apply the changes locally",
      "Session must be completed — use jules_list_sessions to check status",
    ],
    parameters: Type.Object({
      sessionId: Type.String({ description: "Jules session ID" }),
      apply: Type.Optional(Type.Boolean({ description: "Apply patch to local repo (default: false)" })),
    }),
    async execute(_id, params, signal) {
      try {
        let cmd = `jules remote pull --session ${params.sessionId}`;
        if (params.apply) cmd += ` --apply`;

        const { stdout, stderr } = await run(cmd, 60000);

        const verb = params.apply ? "applied" : "pulled";
        let result = `${FACES.completed} ${verb} session ${params.sessionId}\n\n${stdout}`;
        if (stderr && !stderr.includes("warning")) result += `\n${stderr}`;

        return {
          content: [{ type: "text", text: result }],
          details: { sessionId: params.sessionId, applied: params.apply || false, stdout: stdout.trim() },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `${FACES.failed} failed to pull session ${params.sessionId}\n\n${error.message}\n\nSession may still be running.` }],
          details: { error: error.message, sessionId: params.sessionId },
          isError: true,
        };
      }
    },
  });

  // ── Tool: Teleport ───────────────────────────────────────────────────────

  pi.registerTool({
    name: "jules_teleport",
    label: "Teleport to Jules Session",
    description: "Clone repo + checkout branch + apply patch from a Jules session. Full working copy of Jules's changes.",
    promptSnippet: "Teleport to a Jules session (clone + apply changes)",
    promptGuidelines: [
      "Use jules_teleport to get a full working copy of Jules's changes",
      "Clones the repo if not in a matching working directory, or applies to current repo",
    ],
    parameters: Type.Object({
      sessionId: Type.String({ description: "Jules session ID" }),
    }),
    async execute(_id, params, signal) {
      try {
        const { stdout, stderr } = await run(`jules teleport ${params.sessionId}`, 120000);

        let result = `${FACES.working} teleported to session ${params.sessionId}\n\n${stdout}`;
        if (stderr && !stderr.includes("warning")) result += `\n${stderr}`;

        return {
          content: [{ type: "text", text: result }],
          details: { sessionId: params.sessionId, stdout: stdout.trim() },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `${FACES.failed} teleport failed\n\n${error.message}` }],
          details: { error: error.message, sessionId: params.sessionId },
          isError: true,
        };
      }
    },
  });

  // ── Tool: Check Status ───────────────────────────────────────────────────

  pi.registerTool({
    name: "jules_check_status",
    label: "Check Jules Status",
    description: "Verify Jules CLI is installed and authenticated.",
    promptSnippet: "Check Jules CLI installation and auth status",
    promptGuidelines: [
      "Use jules_check_status to verify everything is set up before creating sessions",
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      try {
        const { stdout: version } = await run("jules version", 10000);
        const sessions = await fetchSessions();
        const active = sessions.filter(s => isActive(s.status));
        const completed = sessions.filter(s => s.status.toLowerCase() === "completed");

        let result = `${FACES.ready} jules cli ready\n\nVersion: ${version.trim()}\n`;
        result += `\nsessions: ${sessions.length} total`;
        if (active.length > 0) result += `, ${active.length} active`;
        if (completed.length > 0) result += `, ${completed.length} completed`;

        return {
          content: [{ type: "text", text: result }],
          details: { version: version.trim(), sessions: sessions.length, active: active.length, completed: completed.length },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `${FACES.unavailable} jules cli not available\n\n${error.message}\n\nrun 'jules login' to authenticate.` }],
          details: { error: error.message },
          isError: true,
        };
      }
    },
  });

  // ── Command: /jules ──────────────────────────────────────────────────────

  pi.registerCommand("jules", {
    description: "Jules quick actions: status, list, check",
    handler: async (args, ctx) => {
      const sub = args?.trim().split(/\s+/)[0] || "";

      switch (sub) {
        case "":
        case "status": {
          await updateStatus(ctx);
          const sessions = await fetchSessions();
          const active = sessions.filter(s => isActive(s.status));
          const completed = sessions.filter(s => s.status.toLowerCase() === "completed");
          let msg = `jules ${FACES.ready}`;
          if (active.length > 0) msg += ` — ${active.length} active`;
          if (completed.length > 0) msg += ` — ${completed.length} completed ready to pull`;
          if (active.length === 0 && completed.length === 0) msg += ` — idle ${FACES.idle}`;
          ctx.ui.notify(msg, "info");
          break;
        }
        case "list":
        case "ls": {
          const { stdout } = await run("jules remote list --session", 15000);
          pi.sendMessage({
            customType: "jules-sessions",
            content: `jules sessions\n\n${stdout}`,
            display: true,
          });
          break;
        }
        case "check": {
          try {
            const { stdout } = await run("jules version", 5000);
            ctx.ui.notify(`jules ${stdout.trim().split("\n")[0]} ${FACES.ready}`, "info");
          } catch {
            ctx.ui.notify(`jules unavailable ${FACES.unavailable} — run 'jules login'`, "error");
          }
          break;
        }
        default:
          ctx.ui.notify("usage: /jules [status|list|check]", "info");
      }
    },
  });
}
