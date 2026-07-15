const { spawn } = require('child_process');

function runCommand(command) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      finish({
        success: false,
        error,
      });
    });

    child.on('close', (exitCode) => {
      finish({
        success: exitCode === 0,
        exitCode,
      });
    });
  });
}

module.exports = {
  runCommand,
};
