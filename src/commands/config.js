const { Command } = require('commander');

const { loadConfig, saveConfig } = require('../config/configStore');

const CONFIG_KEYS = {
  'max-retries': {
    storeKey: 'max_retries',
    validate(value) {
      const parsedValue = Number(value);

      if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        throw new Error('max-retries must be a positive integer');
      }

      return parsedValue;
    },
  },
  'backoff-base': {
    storeKey: 'backoff_base',
    validate(value) {
      const parsedValue = Number(value);

      if (Number.isNaN(parsedValue) || parsedValue <= 0) {
        throw new Error('backoff-base must be a positive number');
      }

      return parsedValue;
    },
  },
};

function getConfigEntry(key) {
  const entry = CONFIG_KEYS[key];

  if (!entry) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
  }

  return entry;
}

function registerConfig(program) {
  const config = new Command('config')
    .description('Manages queue configuration values.');

  config
    .command('set')
    .argument('<key>', 'Configuration key to update.')
    .argument('<value>', 'Configuration value to set.')
    .description('Updates queue configuration values such as maximum retries, backoff policy, and other runtime settings.')
    .action((key, value) => {
      try {
        const entry = getConfigEntry(key);
        const configValues = loadConfig();
        const parsedValue = entry.validate(value);

        configValues[entry.storeKey] = parsedValue;
        saveConfig(configValues);

        console.log(`Config ${key} set to ${parsedValue}`);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    });

  config
    .command('get')
    .argument('<key>', 'Configuration key to read.')
    .description('Displays a single queue configuration value.')
    .action((key) => {
      try {
        const entry = getConfigEntry(key);
        const configValues = loadConfig();

        console.log(`${key}: ${configValues[entry.storeKey]}`);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    });

  config
    .command('list')
    .description('Displays the full current queue configuration.')
    .action(() => {
      console.table(loadConfig());
    });

  program.addCommand(config);
}

module.exports = registerConfig;
