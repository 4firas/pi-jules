# pi-jules

<div align="center">

**Delegate coding tasks to Jules from Pi.**

Jules is Google's async coding agent — it clones your repo, works in a VM, and produces a patch. pi-jules wires it into Pi so you can fire off tasks and keep working.

`npm install -g pi-jules` → `pi install npm:pi-jules`

[Install](#install) · [Usage](#usage) · [Tools](#tools) · [Commands](#commands)

</div>

---

## The Problem

You're deep in a Pi session. There's a tedious task — writing tests, updating docs, refactoring a module — that doesn't need you *right now*. You could context-switch to Jules, but that means leaving Pi.

pi-jules lets you delegate without leaving your flow. Jules works in the background. You keep going. Pull the patch when it's ready.

## How It Works

```
You: "have jules add tests for the auth module"
 Pi: → jules_create_session("add tests for the auth module")
     → session created, id: 10329577886289548151
     → jules starts working in the background
     
You: keep working in Pi...
     ...
     notification: jules done (^_^) add tests for auth [48151]
     
You: "pull the jules results"
 Pi: → jules_pull_result(sessionId: "10329577886289548151")
     → patch applied
```

## Install

### npm (recommended)

```bash
npm install -g pi-jules
pi install npm:pi-jules
```

### git

```bash
pi install git:github.com/4firas/pi-jules
```

### manual

```bash
cp extensions/pi-jules.ts ~/.pi/agent/extensions/
```

### prerequisites

- [Jules CLI](https://jules.google) installed (`@google/jules`)
- Logged in (`jules login`)
- Google account connected to your GitHub repos

## Usage

Just talk naturally. Pi picks the right tool.

```
"delegate this to jules"
"have jules work on owner/repo"
"create 3 parallel jules sessions for adding tests"
"check my jules sessions"
"pull results from session 123456"
"teleport to jules session 789"
```

## Tools

| Tool | Description |
|------|-------------|
| `jules_create_session` | Create async task. Supports `repo` and `parallel` params. |
| `jules_list_sessions` | List all sessions with status, repo, description. |
| `jules_pull_result` | Pull patch from completed session. Optional `apply` flag. |
| `jules_teleport` | Clone repo + checkout branch + apply patch. Full working copy. |
| `jules_check_status` | Verify Jules CLI is installed and authenticated. |

## Commands

| Command | What it does |
|---------|-------------|
| `/jules` | Quick status — active count, completed count |
| `/jules list` | Show all sessions |
| `/jules check` | Verify CLI is working |

## Status & Widget

pi-jules shows live status in Pi's footer and a widget above the editor.

**Footer:**

| State | Display |
|-------|---------|
| Ready | `jules (^-^)` |
| Planning | `jules (^_^)ノ (・_・) (1 active)` |
| Running | `jules (^_^)ノ (>_<) (1 active)` |
| Unavailable | `jules (¬_¬)` |

**Widget (above editor):**

```
(^_^)ノ jules active (2)
  (・_・) [48151] add tests for auth module  (4firas/my-app)
  (>_<) [48152] refactor auth controller     (4firas/my-app)
```

```
(._.) jules idle — 3 completed sessions ready to pull
```

```
(^-^) jules ready — no sessions
```

**Completion notifications:**

When a session finishes, you get a toast:

```
jules done (^_^) add tests for auth module [48151]
```

## Kaomoji

| Status | Face |
|--------|------|
| ready | `(^-^)` |
| planning | `(・_・)` |
| running | `(>_<)` |
| completed | `(^_^)` |
| failed | `(x_x)` |
| cancelled | `(-_-)` |
| error | `(◎_◎)` |
| idle | `(._.)` |
| unavailable | `(¬_¬)` |

## Architecture

- Extension registers tools Pi's LLM can call
- Each tool shells out to `jules` CLI
- Output is parsed for session IDs, statuses
- Status line updates on `agent_end` event
- Completion tracking via `knownCompleted` set — no duplicate notifications
- Widget updates live above editor

## Package Info

| | |
|---|---|
| **Version** | 1.0.0 |
| **License** | MIT |
| **Author** | fir4s |
| **Repository** | https://github.com/4firas/pi-jules |
| **Size** | ~16 KB |
| **Dependencies** | 0 (peer deps only) |

## License

MIT
