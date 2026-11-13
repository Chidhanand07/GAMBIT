/**
 * src/observability/errorReporter.js — the error tracking port (SEC-12, ADR F-069).
 */
const { setErrorReporter, reportError, noopErrorReporter } = require('../../src/observability/errorReporter');

afterEach(() => setErrorReporter(undefined));

test('by default nothing is reported anywhere and nothing fails', async () => {
    await expect(reportError(new Error('x'), { where: 'test' })).resolves.toBeUndefined();
    await expect(noopErrorReporter.report(new Error('x'), { where: 'test' })).resolves.toBeUndefined();
});

test('the installed reporter receives the error and its context', async () => {
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    const error = new Error('boom');
    await reportError(error, { where: 'http', route: 'GET /x' });
    expect(report).toHaveBeenCalledWith(error, { where: 'http', route: 'GET /x' });
});

test.each([
    ['rejects', async () => Promise.reject(new Error('webhook down'))],
    [
        'throws synchronously',
        () => {
            throw new Error('broken');
        },
    ],
])('a reporter that %s cannot break the failing path', async (_label, report) => {
    setErrorReporter({ report });
    await expect(reportError(new Error('boom'), { where: 'test' })).resolves.toBeUndefined();
});

test('setErrorReporter(undefined) restores the no-op', async () => {
    const report = jest.fn(async () => {});
    setErrorReporter({ report });
    setErrorReporter(undefined);
    await reportError(new Error('x'), { where: 'test' });
    expect(report).not.toHaveBeenCalled();
});
