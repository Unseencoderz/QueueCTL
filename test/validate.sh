#!/usr/bin/env bash
set -u

if ! command -v dirname >/dev/null 2>&1 && [ -d /usr/bin ]; then
  export PATH="/usr/bin:$PATH"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
JOBS_FILE="$DATA_DIR/jobs.json"
CONFIG_FILE="$DATA_DIR/config.json"
WORKERS_FILE="$DATA_DIR/workers.json"
BACKUP_DIR="$(mktemp -d)"
FAILURES=0

backup_file() {
  local file="$1"
  local name="$2"

  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/$name"
  fi
}

restore_file() {
  local file="$1"
  local name="$2"

  if [ -f "$BACKUP_DIR/$name" ]; then
    cp "$BACKUP_DIR/$name" "$file"
  else
    rm -f "$file"
  fi
}

cleanup() {
  restore_file "$JOBS_FILE" jobs.json
  restore_file "$CONFIG_FILE" config.json
  restore_file "$WORKERS_FILE" workers.json
  rm -rf "$BACKUP_DIR"
}

trap cleanup EXIT

backup_file "$JOBS_FILE" jobs.json
backup_file "$CONFIG_FILE" config.json
backup_file "$WORKERS_FILE" workers.json

cd "$ROOT_DIR" || exit 1

reset_data() {
  node <<'NODE'
const fs = require('fs');
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/jobs.json', '[]\n');
fs.writeFileSync('data/config.json', JSON.stringify({ max_retries: 3, backoff_base: 1 }, null, 2) + '\n');
fs.writeFileSync('data/workers.json', '[]\n');
NODE
}

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1"
  FAILURES=$((FAILURES + 1))
}

assert_job_field() {
  local id="$1"
  local field="$2"
  local expected="$3"

  node - "$id" "$field" "$expected" <<'NODE'
const fs = require('fs');
const [id, field, expected] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
const job = jobs.find((item) => item.id === id);

if (!job) {
  process.exit(1);
}

if (String(job[field]) !== expected) {
  process.exit(1);
}
NODE
}

count_jobs_matching() {
  local field="$1"
  local expected="$2"

  node - "$field" "$expected" <<'NODE'
const fs = require('fs');
const [field, expected] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
console.log(jobs.filter((job) => String(job[field]) === expected).length);
NODE
}

run_worker_until_no_due_jobs() {
  local max_runs="${1:-8}"

  for _ in $(seq 1 "$max_runs"); do
    node bin/queuectl.js worker start --count 1 >/dev/null 2>&1

    if node <<'NODE'
const fs = require('fs');
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
const now = Date.now();
const due = jobs.some((job) => (
  job.state === 'pending'
  && (!job.next_run_at || new Date(job.next_run_at).getTime() <= now)
));
process.exit(due ? 1 : 0);
NODE
    then
      return 0
    fi

    sleep 1
  done

  return 1
}

scenario_success_job() {
  reset_data

  node bin/queuectl.js enqueue '{"id":"success1","command":"echo success"}' >/dev/null 2>&1
  node bin/queuectl.js worker start --count 1 >/dev/null 2>&1

  if assert_job_field success1 state completed && assert_job_field success1 attempts 1; then
    pass "successful job reaches completed"
  else
    fail "successful job reaches completed"
  fi
}

scenario_retry_to_dlq() {
  reset_data

  node bin/queuectl.js config set max-retries 3 >/dev/null 2>&1
  node bin/queuectl.js config set backoff-base 1 >/dev/null 2>&1
  node bin/queuectl.js enqueue '{"id":"dead1","command":"definitely-missing-queuectl-command"}' >/dev/null 2>&1

  run_worker_until_no_due_jobs 1
  local first_next
  first_next="$(node -e "const j=require('./data/jobs.json').find((job)=>job.id==='dead1'); console.log(j.next_run_at || '')")"

  sleep 2
  run_worker_until_no_due_jobs 1
  local second_next
  second_next="$(node -e "const j=require('./data/jobs.json').find((job)=>job.id==='dead1'); console.log(j.next_run_at || '')")"

  sleep 2
  run_worker_until_no_due_jobs 1

  if [ -n "$first_next" ] \
    && [ -n "$second_next" ] \
    && [ "$first_next" != "$second_next" ] \
    && assert_job_field dead1 state dead \
    && assert_job_field dead1 attempts 3 \
    && node bin/queuectl.js dlq list | grep -q dead1; then
    pass "failing job retries with delay and reaches DLQ"
  else
    fail "failing job retries with delay and reaches DLQ"
  fi
}

scenario_parallel_workers() {
  reset_data

  for id in p1 p2 p3 p4 p5 p6; do
    node bin/queuectl.js enqueue "{\"id\":\"$id\",\"command\":\"ping -n 2 127.0.0.1 > nul\"}" >/dev/null 2>&1
  done

  node bin/queuectl.js worker start --count 3 >/dev/null 2>&1

  local completed
  completed="$(count_jobs_matching state completed)"

  if [ "$completed" = "6" ] && node <<'NODE'
const fs = require('fs');
const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf8'));
process.exit(jobs.every((job) => job.attempts === 1) ? 0 : 1);
NODE
  then
    pass "parallel workers complete all jobs once"
  else
    node -e "console.error(JSON.stringify(JSON.parse(require('fs').readFileSync('data/jobs.json','utf8')).map((job)=>({id:job.id,state:job.state,attempts:job.attempts,locked_by:job.locked_by})), null, 2))"
    fail "parallel workers complete all jobs once"
  fi
}

scenario_invalid_command_graceful() {
  reset_data

  node bin/queuectl.js config set max-retries 1 >/dev/null 2>&1
  node bin/queuectl.js enqueue '{"id":"badcmd1","command":"definitely-missing-queuectl-command"}' >/dev/null 2>&1

  if node bin/queuectl.js worker start --count 1 >/dev/null 2>&1 \
    && assert_job_field badcmd1 state dead \
    && assert_job_field badcmd1 attempts 1; then
    pass "invalid command fails gracefully"
  else
    node -e "console.error(JSON.stringify(JSON.parse(require('fs').readFileSync('data/jobs.json','utf8')).map((job)=>({id:job.id,state:job.state,attempts:job.attempts,next_run_at:job.next_run_at})), null, 2))"
    fail "invalid command fails gracefully"
  fi
}

scenario_persistence_across_invocations() {
  reset_data

  node bin/queuectl.js enqueue '{"id":"persist1","command":"echo persisted"}' >/dev/null 2>&1
  sleep 1

  if node bin/queuectl.js list --state pending | grep -q persist1 \
    && node bin/queuectl.js worker start --count 1 >/dev/null 2>&1 \
    && assert_job_field persist1 state completed; then
    pass "job data persists across CLI invocations"
  else
    fail "job data persists across CLI invocations"
  fi
}

scenario_success_job
scenario_retry_to_dlq
scenario_parallel_workers
scenario_invalid_command_graceful
scenario_persistence_across_invocations

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES validation scenario(s) failed"
  exit 1
fi

echo "All validation scenarios passed"
exit 0
