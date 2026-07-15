const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  max_retries: 3,
  backoff_base: 2,
};

const dataDir = path.join(__dirname, '..', '..', 'data');
const configPath = path.join(dataDir, 'config.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadConfig() {
  ensureDataDir();

  if (!fs.existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  const rawConfig = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(rawConfig);
}

function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
};
