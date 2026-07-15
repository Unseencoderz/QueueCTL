const { Command } = require('commander');
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../config/configStore');
const { runCommand } = require('../core/executor');
const { calculateBackoffSeconds } = require('../core/retry');
const { tryClaimJob, updateJob } = require('../core/storage');

const dataDir = path.join(__dirname, '..', '..', 'data');
const workersPath = path.join(dataDir, 'workers.json');

let shuttingDown = false;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadWorkers() {
  ensureDataDir();

  if (!fs.existsSync(workersPath)) {
    return [];
  }

  const workers = JSON.parse(fs.readFileSync(workersPath, 'utf8'));

  if (!Array.isArray(workers)) {
    throw new Error('workers.json must contain an array');
  }

  return workers;
}

function saveWorkers(workers) {
  ensureDataDir();
  fs.writeFileSync(workersPath, `${JSON.stringify(workers, null, 2)}\n`, 'utf8');
}

function isWorkerRegistered(workerId) {
  try {
    return loadWorkers().some((worker) => worker.workerId === workerId && worker.pid === process.pid);
  } catch (error) {
    return true;
  }
}

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
  let job = shuttingDown ? null : tryClaimJob(workerId);

  while (!shuttingDown && job) {
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

    job = shuttingDown || !isWorkerRegistered(workerId) ? null : tryClaimJob(workerId);
  }

  return { completed, failed };
}

function spawnChildWorker(workerId) {
  const child = fork(__filename, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QUEUECTL_WORKER_CHILD: '1',
      QUEUECTL_WORKER_ID: workerId,
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  const promise = new Promise((resolve, reject) => {
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

  return {
    child,
    worker: {
      pid: child.pid,
      workerId,
    },
    promise,
  };
}

async function runWorkerPool(count) {
  const workers = Array.from(
    { length: count },
    (_, index) => spawnChildWorker(`worker-${index + 1}`)
  );

  saveWorkers(workers.map(({ worker }) => worker));

  let summaries;

  try {
    summaries = await Promise.all(workers.map(({ promise }) => promise));
  } finally {
    saveWorkers([]);
  }

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
      const workers = loadWorkers();

      if (workers.length === 0) {
        console.log('No running workers found');
        saveWorkers([]);
        return;
      }

      for (const workerInfo of workers) {
        try {
          if (process.platform === 'win32') {
            process.kill(workerInfo.pid, 0);
            console.log(`Requested graceful stop for ${workerInfo.workerId} (pid ${workerInfo.pid})`);
          } else {
            process.kill(workerInfo.pid, 'SIGTERM');
            console.log(`Signaled ${workerInfo.workerId} (pid ${workerInfo.pid})`);
          }
        } catch (error) {
          if (error.code === 'ESRCH') {
            console.log(`${workerInfo.workerId} (pid ${workerInfo.pid}) is not running`);
          } else {
            console.error(`Failed to signal ${workerInfo.workerId} (pid ${workerInfo.pid}): ${error.message}`);
          }
        }
      }

      saveWorkers([]);
    });

  program.addCommand(worker);
}

if (require.main === module && process.env.QUEUECTL_WORKER_CHILD === '1') {
  process.on('SIGTERM', () => {
    shuttingDown = true;
  });

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
