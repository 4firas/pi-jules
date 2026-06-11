import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default function (pi: ExtensionAPI) {
  // Tool: Create a new Jules session
  pi.registerTool({
    name: "jules_create_session",
    label: "Create Jules Session",
    description: "Create a new asynchronous coding session with Jules. Jules will work on the task in the background, allowing you to continue with other work. Returns a session ID you can use to check status and pull results later.",
    promptSnippet: "Delegate a coding task to Jules for asynchronous execution",
    promptGuidelines: [
      "Use jules_create_session when you want to delegate a task to Jules (Google's coding agent) for background execution",
      "Jules sessions are asynchronous - they continue running even after you create them",
      "The current working directory's repository is used by default, or specify --repo",
      "Use --parallel to create multiple sessions for the same task (1-5)",
    ],
    parameters: Type.Object({
      task: Type.String({
        description: "The task description for Jules to work on",
      }),
      repo: Type.Optional(
        Type.String({
          description:
            "Repository in format 'owner/repo' (defaults to current working directory)",
        })
      ),
      parallel: Type.Optional(
        Type.Number({
          description:
            "Number of parallel sessions to create for the same task (1-5, default 1)",
          minimum: 1,
          maximum: 5,
        })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        // Build command
        let cmd = `jules new`;
        if (params.repo) {
          cmd += ` --repo ${params.repo}`;
        }
        if (params.parallel && params.parallel > 1) {
          cmd += ` --parallel ${params.parallel}`;
        }

        // Execute command with task as argument
        cmd += ` ${JSON.stringify(params.task)}`;

        const { stdout, stderr } = await execAsync(cmd, {
          signal,
          timeout: 30000, // 30s timeout for session creation
        });

        // Parse output for session ID
        // Jules CLI outputs session info, we extract the session ID
        const sessionIdMatch = stdout.match(/session[:\s]+(\d+)/i) ||
                               stdout.match(/id[:\s]+(\d+)/i) ||
                               stdout.match(/created[:\s]+(\d+)/i);

        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

        let result = `✅ Jules session created successfully\n\n`;
        if (sessionId) {
          result += `Session ID: ${sessionId}\n`;
        }
        result += `\n${stdout}`;

        if (stderr && !stderr.includes("warning")) {
          result += `\n\nStderr: ${stderr}`;
        }

        return {
          content: [{ type: "text", text: result }],
          details: {
            sessionId,
            command: cmd,
            stdout: stdout.trim(),
          },
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create Jules session\n\nError: ${errorMsg}\n\nMake sure Jules CLI is installed and you're logged in (run 'jules login' if needed).`,
            },
          ],
          details: { error: errorMsg },
          isError: true,
        };
      }
    },
  });

  // Tool: List Jules sessions
  pi.registerTool({
    name: "jules_list_sessions",
    label: "List Jules Sessions",
    description: "List all active and completed Jules sessions. Shows session IDs, status, and associated repositories.",
    promptSnippet: "List all Jules sessions and their status",
    promptGuidelines: [
      "Use jules_list_sessions to see all active and completed Jules sessions",
      "Session IDs are needed to pull results or check status",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      try {
        const { stdout, stderr } = await execAsync(
          "jules remote list --session",
          {
            signal,
            timeout: 30000,
          }
        );

        let result = `📋 Jules Sessions\n\n${stdout}`;

        if (stderr && !stderr.includes("warning")) {
          result += `\n\nStderr: ${stderr}`;
        }

        return {
          content: [{ type: "text", text: result }],
          details: { stdout: stdout.trim() },
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to list Jules sessions\n\nError: ${errorMsg}`,
            },
          ],
          details: { error: errorMsg },
          isError: true,
        };
      }
    },
  });

  // Tool: Pull Jules session result
  pi.registerTool({
    name: "jules_pull_result",
    label: "Pull Jules Result",
    description: "Pull the results (patch/diff) from a completed Jules session. Optionally apply the changes to the local repository.",
    promptSnippet: "Pull results from a Jules session",
    promptGuidelines: [
      "Use jules_pull_result to retrieve the patch/diff from a completed Jules session",
      "Set apply=true to automatically apply the changes to the local repository",
      "The session must be completed before you can pull results",
    ],
    parameters: Type.Object({
      sessionId: Type.String({
        description: "The Jules session ID to pull results from",
      }),
      apply: Type.Optional(
        Type.Boolean({
          description:
            "Whether to apply the patch to the local repository (default: false, just view the patch)",
        })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        let cmd = `jules remote pull --session ${params.sessionId}`;
        if (params.apply) {
          cmd += ` --apply`;
        }

        const { stdout, stderr } = await execAsync(cmd, {
          signal,
          timeout: 60000, // 60s timeout for pulling
        });

        let result = params.apply
          ? `✅ Applied Jules session ${params.sessionId} to local repository\n\n`
          : `📦 Jules Session ${params.sessionId} Results\n\n`;
        result += stdout;

        if (stderr && !stderr.includes("warning")) {
          result += `\n\nStderr: ${stderr}`;
        }

        return {
          content: [{ type: "text", text: result }],
          details: {
            sessionId: params.sessionId,
            applied: params.apply || false,
            command: cmd,
            stdout: stdout.trim(),
          },
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to pull Jules session ${params.sessionId}\n\nError: ${errorMsg}\n\nThe session may still be running. Use jules_list_sessions to check status.`,
            },
          ],
          details: { error: errorMsg, sessionId: params.sessionId },
          isError: true,
        };
      }
    },
  });

  // Tool: Teleport to Jules session
  pi.registerTool({
    name: "jules_teleport",
    label: "Teleport to Jules Session",
    description: "Teleport to a Jules session - clones the repository (if needed), checks out the session's branch, and applies the patch. Useful for reviewing changes in a clean environment.",
    promptSnippet: "Teleport to a Jules session (clone repo + apply changes)",
    promptGuidelines: [
      "Use jules_teleport to teleport to a Jules session in a clean environment",
      "This clones the repo if not in a working directory, or applies to the current repo if it matches",
      "Good for reviewing Jules changes in isolation",
    ],
    parameters: Type.Object({
      sessionId: Type.String({
        description: "The Jules session ID to teleport to",
      }),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const cmd = `jules teleport ${params.sessionId}`;

        const { stdout, stderr } = await execAsync(cmd, {
          signal,
          timeout: 120000, // 2min timeout for teleport (may involve cloning)
        });

        let result = `🚀 Teleported to Jules session ${params.sessionId}\n\n${stdout}`;

        if (stderr && !stderr.includes("warning")) {
          result += `\n\nStderr: ${stderr}`;
        }

        return {
          content: [{ type: "text", text: result }],
          details: {
            sessionId: params.sessionId,
            command: cmd,
            stdout: stdout.trim(),
          },
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to teleport to Jules session ${params.sessionId}\n\nError: ${errorMsg}`,
            },
          ],
          details: { error: errorMsg, sessionId: params.sessionId },
          isError: true,
        };
      }
    },
  });

  // Tool: Check Jules login status
  pi.registerTool({
    name: "jules_check_status",
    label: "Check Jules Status",
    description: "Check if Jules CLI is installed and you're logged in. Useful for troubleshooting before creating sessions.",
    promptSnippet: "Check Jules CLI installation and login status",
    promptGuidelines: [
      "Use jules_check_status to verify Jules CLI is ready before creating sessions",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      try {
        // Check if jules is installed
        const { stdout: version } = await execAsync("jules version", {
          signal,
          timeout: 10000,
        });

        // Try to list sessions to verify login
        const { stdout: sessions } = await execAsync(
          "jules remote list --session",
          {
            signal,
            timeout: 10000,
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Jules CLI is installed and working\n\nVersion: ${version.trim()}\n\nYou're logged in and can create sessions.`,
            },
          ],
          details: { version: version.trim(), loggedIn: true },
        };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Jules CLI issue detected\n\nError: ${errorMsg}\n\nPlease run 'jules login' to authenticate, or install Jules CLI if not installed.`,
            },
          ],
          details: { error: errorMsg, loggedIn: false },
          isError: true,
        };
      }
    },
  });

  // Command: Quick Jules status
  pi.registerCommand("jules", {
    description: "Check Jules status or list sessions",
    handler: async (args, ctx) => {
      if (!args || args.trim() === "") {
        // Show status
        try {
          const { stdout: version } = await execAsync("jules version", {
            timeout: 10000,
          });
          ctx.ui.notify(`Jules CLI: ${version.trim()}`, "info");
        } catch {
          ctx.ui.notify("Jules CLI not found or not logged in", "error");
        }
      } else if (args.trim() === "list") {
        // List sessions
        try {
          const { stdout } = await execAsync("jules remote list --session", {
            timeout: 30000,
          });
          ctx.ui.notify("Sessions listed in chat", "info");
          // Send as a message
          pi.sendMessage({
            customType: "jules-sessions",
            content: `📋 Jules Sessions\n\n${stdout}`,
            display: true,
          });
        } catch (error: any) {
          ctx.ui.notify(`Failed to list sessions: ${error.message}`, "error");
        }
      } else {
        ctx.ui.notify("Usage: /jules or /jules list", "info");
      }
    },
  });

  // Notify on load
  pi.on("session_start", async (_event, ctx) => {
    // Check if jules is available
    try {
      await execAsync("jules version", { timeout: 5000 });
      ctx.ui.setStatus("jules", "Jules ready");
    } catch {
      ctx.ui.setStatus("jules", "Jules unavailable");
    }
  });
}
