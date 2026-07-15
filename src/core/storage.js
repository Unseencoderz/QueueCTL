const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const jobsPath = path.join(dataDir, 'jobs.json');
const tempJobsPath = path.join(dataDir, 'jobs.json.tmp');
const lockPath = path.join(dataDir, 'jobs.json.lock');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensureJobsFile() {
  ensureDataDir();

  if (!fs.existsSync(jobsPath)) {
    fs.writeFileSync(jobsPath, '[]\n', 'utf8');
  }
}

function readJobsFile() {
  const rawJobs = fs.readFileSync(jobsPath, 'utf8');
  const jobs = JSON.parse(rawJobs);

  if (!Array.isArray(jobs)) {
    throw new Error('jobs.json must contain an array');
  }

  return jobs;
}

function writeJobsFile(jobs) {
  fs.writeFileSync(tempJobsPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
  fs.renameSync(tempJobsPath, jobsPath);
}

function acquireJobsLock() {
  ensureDataDir();

  const startedAt = Date.now();

  while (true) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
        throw error;
      }

      if (Date.now() - startedAt > 10000) {
        throw new Error('Timed out waiting for jobs lock');
      }
    }
  }
}

function withJobsLock(operation) {
  const lockFile = acquireJobsLock();

  try {
    return operation();
  } finally {
    fs.closeSync(lockFile);
    fs.unlinkSync(lockPath);
  }
}

function loadJobs() {
  ensureJobsFile();
  return readJobsFile();
}

function saveJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new Error('jobs must be an array');
  }

  ensureJobsFile();
  withJobsLock(() => {
    writeJobsFile(jobs);
  });
}

function addJob(job) {
  ensureJobsFile();

  return withJobsLock(() => {
    const jobs = readJobsFile();
    jobs.push(job);
    writeJobsFile(jobs);
    return job;
  });
}

function getJob(id) {
  return loadJobs().find((job) => job.id === id);
}

function updateJob(id, patch) {
  ensureJobsFile();

  return withJobsLock(() => {
    const jobs = readJobsFile();
    const jobIndex = jobs.findIndex((job) => job.id === id);

    if (jobIndex === -1) {
      return undefined;
    }

    const updatedJob = {
      ...jobs[jobIndex],
      ...patch,
      id: jobs[jobIndex].id,
      updated_at: new Date().toISOString(),
    };

    jobs[jobIndex] = updatedJob;
    writeJobsFile(jobs);
    return updatedJob;
  });
}

function listJobs() {
  return loadJobs();
}

function listByState(state) {
  return loadJobs().filter((job) => job.state === state);
}

function tryClaimJob(workerId) {
  ensureJobsFile();

  return withJobsLock(() => {
    const jobs = readJobsFile();
    const now = Date.now();
    const claimableJobs = jobs
      .map((job, index) => ({ job, index }))
      .filter(({ job }) => (
        job.state === 'pending'
        && (!job.next_run_at || new Date(job.next_run_at).getTime() <= now)
      ))
      .sort((a, b) => new Date(a.job.created_at) - new Date(b.job.created_at));

    if (claimableJobs.length === 0) {
      return null;
    }

    const claimedIndex = claimableJobs[0].index;
    const claimedJob = {
      ...jobs[claimedIndex],
      state: 'processing',
      locked_by: workerId,
      next_run_at: null,
      updated_at: new Date().toISOString(),
    };

    jobs[claimedIndex] = claimedJob;
    writeJobsFile(jobs);
    return claimedJob;
  });
}

module.exports = {
  loadJobs,
  saveJobs,
  addJob,
  getJob,
  updateJob,
  listJobs,
  listByState,
  tryClaimJob,
};
