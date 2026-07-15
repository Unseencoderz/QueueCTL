## Setup Instructions

Requires Node.js and npm.

```sh
npm install
```

Run the CLI directly with Node:

```sh
node bin/queuectl.js --help
```

Or use the package bin after linking/installing in the usual npm way:

```sh
npm link
queuectl --help
```

Runtime data is stored in `data/jobs.json`, `data/config.json`, and `data/workers.json`.

## Usage Examples with real command + output pairs for enqueue, worker start, worker stop, status, list, dlq list/retry, config set

```sh
$ node bin/queuectl.js config set max-retries 2
Config max-retries set to 2
```

```sh
$ node bin/queuectl.js enqueue '{"id":"readme-ok","command":"echo readme"}'
Job readme-ok enqueued (state: pending)
```

```sh
$ node bin/queuectl.js list --state pending
┌─────────┬─────────────┬───────────┬──────────┬───────────────┬────────────────────────────┐
│ (index) │ id          │ state     │ attempts │ command       │ updated_at                 │
├─────────┼─────────────┼───────────┼──────────┼───────────────┼────────────────────────────┤
│ 0       │ 'readme-ok' │ 'pending' │ 0        │ 'echo readme' │ '2026-07-15T11:30:00.252Z' │
└─────────┴─────────────┴───────────┴──────────┴───────────────┴────────────────────────────┘
```

```sh
$ node bin/queuectl.js status
pending: 1
processing: 0
completed: 0
failed: 0
dead: 0
active workers: 0
```

```sh
$ node bin/queuectl.js worker start --count 1
readme
1 completed, 0 failed
```

```sh
$ node bin/queuectl.js worker stop
No running workers found
```

```sh
$ node bin/queuectl.js status
pending: 0
processing: 0
completed: 1
failed: 0
dead: 0
active workers: 0
```

With `max_retries` set to `1`, a command that does not exist moves to the Dead Letter Queue after one failed attempt:

```sh
$ node bin/queuectl.js enqueue '{"id":"readme-dead","command":"definitely-missing-queuectl-command"}'
Job readme-dead enqueued (state: pending)
```

```sh
$ node bin/queuectl.js worker start --count 1
'definitely-missing-queuectl-command' is not recognized as an internal or external command,
operable program or batch file.
0 completed, 1 failed
```

```sh
$ node bin/queuectl.js dlq list
┌─────────┬───────────────┬────────┬───────────────────────────────────────┬──────────┬────────────────────────────┐
│ (index) │ id            │ state  │ command                               │ attempts │ updated_at                 │
├─────────┼───────────────┼────────┼───────────────────────────────────────┼──────────┼────────────────────────────┤
│ 0       │ 'readme-dead' │ 'dead' │ 'definitely-missing-queuectl-command' │ 1        │ '2026-07-15T11:31:50.465Z' │
└─────────┴───────────────┴────────┴───────────────────────────────────────┴──────────┴────────────────────────────┘
```

```sh
$ node bin/queuectl.js dlq retry readme-dead
Job readme-dead moved back to pending
```

```sh
$ node bin/queuectl.js list --state pending
┌─────────┬───────────────┬───────────┬──────────┬───────────────────────────────────────┬────────────────────────────┐
│ (index) │ id            │ state     │ attempts │ command                               │ updated_at                 │
├─────────┼───────────────┼───────────┼──────────┼───────────────────────────────────────┼────────────────────────────┤
│ 0       │ 'readme-dead' │ 'pending' │ 0        │ 'definitely-missing-queuectl-command' │ '2026-07-15T11:31:51.256Z' │
└─────────┴───────────────┴───────────┴──────────┴───────────────────────────────────────┴────────────────────────────┘
```

## Architecture Overview

Job lifecycle state diagram:

```text
enqueue
  |
  v
pending --worker claim--> processing --exit 0--> completed
  ^                         |
  |                         v
  |                 command failed
  |                         |
  |         attempts < max_retries
  |                         |
  +---- pending with next_run_at
                            |
              attempts >= max_retries
                            |
                            v
                           dead

dead --dlq retry--> pending
```

Jobs are plain objects with fields including `id`, `command`, `state`, `attempts`, `max_retries`, `created_at`, `updated_at`, and nullable `next_run_at`. Jobs are persisted as an array in `data/jobs.json`. Configuration is persisted in `data/config.json`, currently `max_retries` and `backoff_base`.

Writes to `jobs.json` use a temp-file-and-rename pattern: write `data/jobs.json.tmp`, then rename it over `data/jobs.json`. Storage also uses a `data/jobs.json.lock` file while changing jobs so worker processes do not overwrite each other's read-modify-write updates.

`worker start --count N` forks `N` child Node processes. Each child gets a `workerId`, calls `tryClaimJob(workerId)`, marks one eligible pending job as `processing`, runs the shell command, and updates the job to `completed`, back to scheduled `pending`, or `dead`. Worker PIDs are tracked in `data/workers.json`; `worker stop` uses that registry to request/signals workers and then clears it. `status` currently reports `active workers: 0` as a placeholder rather than reading live worker state.

## Assumptions & Trade-offs

JSON file storage is used instead of SQLite or another database to keep the project small and transparent.

One child process per worker gives true parallel command execution without building a worker scheduler inside one Node event loop.

The single-file lock strategy is simple and works for this project scale, but it is not a replacement for database transactions. A crashed process can leave a job in `processing` with `locked_by` set; crash recovery is not implemented yet.

Retry backoff is deterministic: `Math.pow(backoff_base, attempts)` seconds. Jobs whose `next_run_at` is in the future are skipped until they become eligible.

Shell commands run with `spawn(..., { shell: true })`, so command syntax and command-not-found messages depend on the host shell and operating system.

## Testing Instructions

Run the validation script:

```sh
bash test/validate.sh
```

Or use npm:

```sh
npm test
```

The script backs up `data/jobs.json`, `data/config.json`, and `data/workers.json`, runs end-to-end CLI scenarios, then restores the original runtime files. On Windows, use an environment that provides Bash, such as Git Bash or WSL with a Linux distribution installed.
