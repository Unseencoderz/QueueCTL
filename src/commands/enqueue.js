const { createJob } = require('../core/jobModel');
const { addJob, getJob } = require('../core/storage');

function parsePowerShellStrippedJson(jobJson) {
  const trimmed = jobJson.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return undefined;
  }

  const body = trimmed.slice(1, -1).trim();

  if (body === '') {
    return {};
  }

  return body.split(',').reduce((fields, pair) => {
    const separatorIndex = pair.indexOf(':');

    if (separatorIndex === -1) {
      throw new Error('Invalid object field');
    }

    const key = pair.slice(0, separatorIndex).trim();
    const rawValue = pair.slice(separatorIndex + 1).trim();

    if (key === '') {
      throw new Error('Object field is missing a key');
    }

    if (rawValue === 'true') {
      fields[key] = true;
    } else if (rawValue === 'false') {
      fields[key] = false;
    } else if (rawValue === 'null') {
      fields[key] = null;
    } else if (rawValue !== '' && !Number.isNaN(Number(rawValue))) {
      fields[key] = Number(rawValue);
    } else {
      fields[key] = rawValue;
    }

    return fields;
  }, {});
}

function parseJobJson(jobJsonParts) {
  const jobJson = jobJsonParts.join(' ');

  try {
    return JSON.parse(jobJson);
  } catch (jsonError) {
    const parsedFields = parsePowerShellStrippedJson(jobJson);

    if (parsedFields) {
      return parsedFields;
    }

    throw jsonError;
  }
}

function registerEnqueue(program) {
  program
    .command('enqueue')
    .argument('<job-json...>', 'JSON payload for the job to add to the queue.')
    .description('Adds a new job to the queue.')
    .action((jobJsonParts) => {
      let fields;

      try {
        fields = parseJobJson(jobJsonParts);
      } catch (error) {
        console.error(`Invalid job JSON: ${error.message}`);
        process.exitCode = 1;
        return;
      }

      try {
        if (fields.id && getJob(fields.id)) {
          console.error(`Job ${fields.id} already exists`);
          process.exitCode = 1;
          return;
        }

        const job = createJob(fields);
        addJob(job);
        console.log(`Job ${job.id} enqueued (state: ${job.state})`);
      } catch (error) {
        console.error(`Failed to enqueue job: ${error.message}`);
        process.exitCode = 1;
      }
    });
}

module.exports = registerEnqueue;
