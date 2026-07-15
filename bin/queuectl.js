#!/usr/bin/env node

const { Command } = require('commander');

const registerEnqueue = require('../src/commands/enqueue');
const registerWorker = require('../src/commands/worker');
const registerStatus = require('../src/commands/status');
const registerList = require('../src/commands/list');
const registerDlq = require('../src/commands/dlq');
const registerConfig = require('../src/commands/config');

const program = new Command();

program
  .name('queuectl')
  .description('CLI for managing queue jobs, workers, dead letter jobs, and runtime configuration.')
  .version('0.1.0');

registerEnqueue(program);
registerWorker(program);
registerStatus(program);
registerList(program);
registerDlq(program);
registerConfig(program);

program.parse(process.argv);
