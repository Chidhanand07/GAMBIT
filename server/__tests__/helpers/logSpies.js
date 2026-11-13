// Every test can assert on what the server logs: the logger is silent under test, and its
// methods are spied on before each test (NODE-20). Files that call jest.restoreAllMocks()
// get fresh spies for the next test.
const { log } = require('../../src/observability/log');

beforeEach(() => {
    for (const level of ['error', 'warn', 'info', 'fatal']) jest.spyOn(log, level);
});
