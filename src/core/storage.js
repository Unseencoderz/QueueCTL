const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const jobsPath = path.join(dataDir, 'jobs.json');
const tempJobsPath = path.join(dataDir, 'jobs.json.tmp');

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

function loadJobs() {
  ensureJobsFile();

  const rawJobs = fs.readFileSync(jobsPath, 'utf8');
  const jobs = JSON.parse(rawJobs);

  if (!Array.isArray(jobs)) {
    throw new Error('jobs.json must contain an array');
  }

  return jobs;
}

function saveJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new Error('jobs must be an array');
  }

  ensureDataDir();
  fs.writeFileSync(tempJobsPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
  fs.renameSync(tempJobsPath, jobsPath);
}

function addJob(job) {
  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
  return job;
}

function getJob(id) {
  return loadJobs().find((job) => job.id === id);
}

function updateJob(id, patch) {
  const jobs = loadJobs();
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
  saveJobs(jobs);
  return updatedJob;
}

function listJobs() {
  return loadJobs();
}

function listByState(state) {
  return loadJobs().filter((job) => job.state === state);
}

module.exports = {
  loadJobs,
  saveJobs,
  addJob,
  getJob,
  updateJob,
  listJobs,
  listByState,
};
