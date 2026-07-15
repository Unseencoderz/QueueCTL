const { Command } = require('commander');

const { loadConfig, saveConfig } = require('../config/configStore');

function normalizeConfigKey(key) {
  return key.replace(/-/g, '_');
}

function parseConfigValue(value) {
  const numericValue = Number(value);

  if (value.trim() !== '' && !Number.isNaN(numericValue)) {
    return numericValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
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
      const normalizedKey = normalizeConfigKey(key);
      const configValues = loadConfig();
      const parsedValue = parseConfigValue(value);

      configValues[normalizedKey] = parsedValue;
      saveConfig(configValues);

      console.log(`Config ${normalizedKey} set to ${parsedValue}`);
    });

  program.addCommand(config);
}

module.exports = registerConfig;
