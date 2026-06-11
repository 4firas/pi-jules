# pi-jules

Seamless [Jules](https://jules.google) integration for [Pi](https://pi.dev) coding agent.

Delegate coding tasks to Jules (Google's async coding agent) directly from Pi. Jules works in the background on GitHub repos while you keep working in Pi.

## What it does

Registers 5 tools + 1 command that Pi can call:

| Tool | What it does |
|------|-------------|
| `jules_create_session` | Create a new async Jules task |
| `jules_list_sessions` | List all active/completed sessions |
| `jules_pull_result` | Pull patch from a completed session |
| `jules_teleport` | Clone repo + checkout branch + apply patch |
| `jules_check_status` | Verify Jules CLI is installed & logged in |

Plus `/jules` and `/jules list` commands for quick access.

## Prerequisites

```bash
# Install Jules CLI
npm install -g @anthropic-ai/jules-cli

# Login
jules login
```

## Install

### As a Pi package

```bash
pi install git:github.com/fir4s/pi-jules
```

### Manual

```bash
cp extensions/pi-jules.ts ~/.pi/agent/extensions/
```

## Usage

Just tell Pi to delegate work to Jules:

```
"Send this refactoring task to Jules"
"Create a Jules session to add tests for the auth module"
"Check on my Jules sessions"
"Pull the results from Jules session 123456"
"Teleport to Jules session 789"
```

Pi will automatically use the right tool. Jules sessions are async — they keep running after creation.

### Parallel sessions

```
"Create 3 parallel Jules sessions for adding unit tests"
```

### Specific repos

```
"Have Jules work on owner/repo to fix the login bug"
```

## Architecture

- Extension registers tools Pi's LLM can call
- Each tool shells out to the Jules CLI
- Output is parsed and returned as structured tool results
- Status line shows Jules availability on session start

## License

MIT
