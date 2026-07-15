# queuectl Design

```text
                 +----------------+
                 | queuectl CLI   |
                 +----------------+
                   |     |     |
       enqueue ----+     |     +---- config set/get/list
                         |
                         v
                  +-------------+
                  | jobs.json   |
                  | config.json |
                  +-------------+
                         ^
                         |
       +-----------------+-----------------+
       |                                   |
+---------------+                  +---------------+
| worker child  |                  | dlq commands  |
| tryClaimJob   |                  | list/retry    |
+---------------+                  +---------------+
```

Job lifecycle:

```text
pending -> processing -> completed
   ^          |
   |          +-> pending with next_run_at, when attempts < max_retries
   |          |
   |          +-> dead, when attempts >= max_retries
   |
dead --dlq retry--> pending
```

Responsibilities:

- `src/commands/*`: CLI parsing, user-facing messages, and command orchestration.
- `src/core/jobModel.js`: creates validated job objects and applies defaults.
- `src/core/storage.js`: reads/writes `data/jobs.json`, uses temp-file rename writes, and claims jobs with a file lock.
- `src/core/executor.js`: runs shell commands and returns success/failure instead of throwing for normal command failures.
- `src/core/retry.js`: calculates retry backoff.
- `src/config/configStore.js`: reads/writes queue runtime config.

Concurrency model:

`worker start --count N` forks `N` child processes. Each child synchronously claims one due pending job through `tryClaimJob(workerId)`, which flips the job to `processing` while holding the file lock. After command execution, the worker updates the same job to `completed`, scheduled `pending`, or `dead`.

Known limitation:

If a worker crashes while a job is `processing`, the job can remain stuck with `locked_by` set. Recovery of abandoned processing jobs is intentionally left for a later milestone.
