const { Command } = require('commander');
const { fork } = require('child_process');

const { loadConfig } = require('../config/configStore');
const { runCommand } = require('../core/executor');
const { calculateBackoffSeconds } = require('../core/retry');
const { tryClaimJob, updateJob } = require('../core/storage');

function parseWorkerCount(value) {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('--count must be a positive integer');
  }

  return count;
}

async function runWorkerLoop(workerId) {
  let completed = 0;
  let failed = 0;
  const config = loadConfig();
  let job = tryClaimJob(workerId);

  while (job) {
    const result = await runCommand(job.command);
    const attempts = (job.attempts ?? 0) + 1;
    const maxRetries = job.max_retries ?? config.max_retries;

    if (result.success) {
      updateJob(job.id, {
        state: 'completed',
        attempts,
        locked_by: null,
        next_run_at: null,
      });
      completed += 1;
    } else if (attempts < maxRetries) {
      const backoffSeconds = calculateBackoffSeconds(attempts, config.backoff_base);
      const nextRunAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

      updateJob(job.id, {
        state: 'pending',
        attempts,
        locked_by: null,
        next_run_at: nextRunAt,
      });
    } else {
      updateJob(job.id, {
        state: 'dead',
        attempts,
        locked_by: null,
        next_run_at: null,
      });
      failed += 1;
    }

    job = tryClaimJob(workerId);
  }

  return { completed, failed };
}

function runChildWorker(workerId) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        QUEUECTL_WORKER_CHILD: '1',
        QUEUECTL_WORKER_ID: workerId,
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let summary = { completed: 0, failed: 0 };

    child.on('message', (message) => {
      if (message && message.type === 'summary') {
        summary = message.summary;
      }
    });

    child.on('error', reject);

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(summary);
        return;
      }

      reject(new Error(`${workerId} exited with code ${code}`));
    });
  });
}

async function runWorkerPool(count) {
  const summaries = await Promise.all(
    Array.from({ length: count }, (_, index) => runChildWorker(`worker-${index + 1}`))
  );

  return summaries.reduce((total, summary) => ({
    completed: total.completed + summary.completed,
    failed: total.failed + summary.failed,
  }), { completed: 0, failed: 0 });
}

function registerWorker(program) {
  const worker = new Command('worker')
    .description('Manages queue worker processes.');

  worker
    .command('start')
    .description('Starts one or more worker processes.')
    .requiredOption('--count <n>', 'Number of workers to start.')
    .action(async (options) => {
      try {
        parseWorkerCount(options.count);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }

      try {
        const summary = await runWorkerPool(parseWorkerCount(options.count));
        console.log(`${summary.completed} completed, ${summary.failed} failed`);
      } catch (error) {
        console.error(`Worker failed: ${error.message}`);
        process.exitCode = 1;
      }
    });

  worker
    .command('stop')
    .description('Stops all running workers gracefully after completing their current jobs.')
    .action(() => {
      console.log('worker stop not implemented yet');
    });

  program.addCommand(worker);
}

if (require.main === module && process.env.QUEUECTL_WORKER_CHILD === '1') {
  runWorkerLoop(process.env.QUEUECTL_WORKER_ID)
    .then((summary) => {
      if (process.send) {
        process.send({ type: 'summary', summary });
      }
    })
    .catch((error) => {
      console.error(`Worker failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = registerWorker;
