# QueueCTL

A CLI-based background job queue with retries, exponential backoff, a Dead Letter Queue, and multi-worker support — built in Node.js.

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

🎥 **Demo video:** [link](#) — walks through enqueue → worker execution → retry/backoff → DLQ → graceful stop → restart persistence.

📐 See [`design.md`](./design.md) for architecture diagrams.

---

## Quick Start

```sh
git clone https://github.com/Unseencoderz/QueueCTL
cd QueueCTL
npm install

node bin/QueueCTL.js enqueue '{"id":"job1","command":"echo hello"}'
node bin/QueueCTL.js worker start --count 1
node bin/QueueCTL.js status
```

---

## Setup Instructions

Requires Node.js 18+ and npm.

```sh
npm install
```

Run directly with Node:

```sh
node bin/QueueCTL.js --help
```

Or link it as a global command:

```sh
npm link
QueueCTL --help
```

Runtime data lives in `data/jobs.json`, `data/config.json`, and `data/workers.json` — created automatically on first run.

---

## Commands

| Command | Description |
|---|---|
| `QueueCTL enqueue '<json>'` | Add a new job to the queue |
| `QueueCTL worker start --count <n>` | Start `n` worker processes |
| `QueueCTL worker stop` | Gracefully stop running workers (finishes current job first) |
| `QueueCTL status` | Show job counts per state + active workers |
| `QueueCTL list --state <state>` | List jobs, optionally filtered by state |
| `QueueCTL dlq list` | List jobs in the Dead Letter Queue |
| `QueueCTL dlq retry <id>` | Reset a dead job back to `pending` |
| `QueueCTL config set <key> <value>` | Set `max-retries` or `backoff-base` |

Run `QueueCTL <command> --help` for full option details.

---

## Usage Examples

**Configure retries, then enqueue and run a job:**

```sh
$ node bin/QueueCTL.js config set max-retries 2
Config max-retries set to 2

$ node bin/QueueCTL.js enqueue '{"id":"readme-ok","command":"echo readme"}'
Job readme-ok enqueued (state: pending)

$ node bin/QueueCTL.js worker start --count 1
readme
1 completed, 0 failed

$ node bin/QueueCTL.js status
pending: 0
processing: 0
completed: 1
failed: 0
dead: 0
active workers: 0
```

**A job that keeps failing moves to the DLQ, and can be retried from there:**

```sh
$ node bin/QueueCTL.js enqueue '{"id":"readme-dead","command":"definitely-missing-QueueCTL-command"}'
Job readme-dead enqueued (state: pending)

$ node bin/QueueCTL.js worker start --count 1
0 completed, 1 failed

$ node bin/QueueCTL.js dlq list
┌─────────┬───────────────┬────────┬───────────────────────────────────────┬──────────┐
│ (index) │ id            │ state  │ command                                │ attempts │
├─────────┼───────────────┼────────┼───────────────────────────────────────┼──────────┤
│ 0       │ 'readme-dead' │ 'dead' │ 'definitely-missing-QueueCTL-command'  │ 1        │
└─────────┴───────────────┴────────┴───────────────────────────────────────┴──────────┘

$ node bin/QueueCTL.js dlq retry readme-dead
Job readme-dead moved back to pending
```

**Listing and stopping workers:**

```sh
$ node bin/QueueCTL.js list --state pending
┌─────────┬───────────────┬───────────┬──────────┬───────────────────────────────────────┐
│ (index) │ id            │ state     │ attempts │ command                                │
├─────────┼───────────────┼───────────┼──────────┼───────────────────────────────────────┤
│ 0       │ 'readme-dead' │ 'pending' │ 0        │ 'definitely-missing-QueueCTL-command'  │
└─────────┴───────────────┴───────────┴──────────┴───────────────────────────────────────┘

$ node bin/QueueCTL.js worker stop
No running workers found
```

> Note: error text for a missing command (e.g. `'X' is not recognized...` vs `command not found`) depends on the host OS shell — see Assumptions below.

---

## Architecture Overview

```
enqueue → pending → [worker claims job] → processing
                                              ├── exit 0            → completed
                                              ├── exit ≠ 0, retries left → pending (delayed via next_run_at)
                                              └── exit ≠ 0, retries exhausted → dead → (dlq retry) → pending
```

- Jobs are stored as a JSON array in `data/jobs.json`; config in `data/config.json`.
- Writes use a temp-file + rename pattern, with a `data/jobs.json.lock` file guarding
  concurrent read-modify-write updates from multiple workers.
- `worker start --count N` forks `N` child Node processes. Each claims one job at a
  time via `tryClaimJob(workerId)`, executes its command, and updates its own state.
  Worker PIDs are tracked in `data/workers.json` so `worker stop` can signal them.

Full diagrams (component view + state machine) are in [`design.md`](./design.md).

---

## Assumptions & Trade-offs

- **JSON file storage**, not SQLite, to keep the project small and easy to inspect/explain.
- **One child process per worker** for true parallel execution, instead of a custom
  in-process scheduler.
- **File-lock based concurrency**, not database transactions — sufficient at this
  scale, but a crashed worker can leave a job stuck in `processing` (`locked_by` set).
  Crash recovery for abandoned jobs is not implemented.
- **Backoff is deterministic**: `backoff_base ^ attempts` seconds. Jobs are skipped
  by the worker until their `next_run_at` has passed.
- **Commands run via `spawn(cmd, { shell: true })`**, so command syntax and "not
  found" error text depend on the host OS/shell.

---

## Testing Instructions

```sh
npm test
# or
bash test/validate.sh
```

The script backs up `data/jobs.json`, `data/config.json`, and `data/workers.json`,
runs end-to-end scenarios (success, retry-to-DLQ, parallel workers, invalid command,
persistence across restarts), then restores your original data.

On Windows, run it from an environment with Bash (Git Bash or WSL).

---

## License

MIT