/**
 * Next 15+ hands `params` to a page as a Promise, and client pages read it with React's
 * `use()`. `use()` returns synchronously for a promise React has already seen settle, which
 * is marked by `status` / `value`. Tests pass params this way so a page renders in one pass,
 * exactly as it does in the browser once the router has resolved the route.
 */
export function routeParams<T extends object>(value: T): Promise<T> {
    return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value })
}
