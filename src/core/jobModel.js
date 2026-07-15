const crypto = require('crypto');

const { loadConfig } = require('../config/configStore');

function createJob(fields = {}) {
  if (typeof fields.command !== 'string' || fields.command.trim() === '') {
    throw new Error('command must be a non-empty string');
  }

  const now = new Date().toISOString();
  const config = loadConfig();

  return {
    id: fields.id || crypto.randomUUID(),
    command: fields.command,
    state: fields.state || 'pending',
    attempts: fields.attempts ?? 0,
    max_retries: fields.max_retries ?? config.max_retries,
    created_at: fields.created_at || now,
    updated_at: fields.updated_at || now,
    next_run_at: fields.next_run_at ?? null,
  };
}

module.exports = {
  createJob,
};
