function calculateBackoffSeconds(attempts, base) {
  return Math.pow(base, attempts);
}

module.exports = {
  calculateBackoffSeconds,
};
