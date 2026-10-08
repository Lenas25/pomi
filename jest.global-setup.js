// Runs once in the parent Jest process, before the workers start, so every worker inherits it.
// A fixed DST zone makes the suite independent of the machine's time zone and lets the
// daylight-saving tests (src/domain/timeDst.test.ts) exercise a real 23 h and a real 25 h day.
module.exports = async () => {
  process.env.TZ = 'America/New_York';
};
