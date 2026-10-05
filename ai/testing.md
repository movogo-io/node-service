# Testing

You can interact with the context from tests like this:

```ts
import {
    getEmitted,
    getEmittedEnvelopes,
    getLoggedEntries,
    setEnvironment,
    timeShift,
    timeShiftTo,
    // replace 'http' with 'event' or 'timer' if that's the kind of service you're testing
} from "@movogo-io/service/test/http";

// Get the entries that was logged so far during the test using `getLoggedEntries()`
assert.deepStrictEqual(
    getLoggedEntries()
        .filter((e) => e.level === "warning")
        .map((e) => e.message),
    ["Something odd."],
);

// Get the events that has been emitted so far during the test using `getEmitted()`
assert.deepStrictEqual(getEmitted(), [
    {
        topic: "account",
        type: "locked",
        subject: userId,
        messageId: undefined,
        data: {
            reason: "rate-limit",
        },
    },
]);
// `getEmittedEnvelopes()` shows what went beside each event: the emitter's attributes (`{}` when none) and the attribution the context carried (`undefined` when none). `messageId` is what the emitter passed, which production never carries; the id a consumer sees is the bus's.
assert.deepStrictEqual(getEmittedEnvelopes(), [
    {
        topic: "account",
        type: "locked",
        subject: userId,
        messageId: undefined,
        attributes: {},
        onBehalfOf: { userId: "its me", org: "acme" },
    },
]);

// Set the wall-clock time reported by `context.now()` using **time shift**. Shift it forward five seconds like this
timeShift(5);
// and to a specific time like this
timeShiftTo(new Date(2025, 8, 20, 20, 20));
// With time shift the clock behind `context.now()` keeps ticking in real time. If that's inconvenient, say if it's exposed in data asserted on in tests, use `freezeTime` instead, which is like `timeShiftTo` but also stops the time from passing:
freezeTime(new Date(2025, 8, 20, 20, 20));

// Set or override environment variable like this
setEnvironment({ SERVICE_BASE_URL: `http://localhost:${port}/` });
```

Remember, tests will automatically fail if errors are logged, so there's no need to assert that `getLoggedEntries()`is free of errors.

The test run refuses to start when `package-lock.json` installs more than one host (`@riddance/host` beside `@movogo-io/host`, at the top level or nested under a dependency): the entrypoints would register in one host instance while the mock and the platform packages run through the other, and the attribution the other `getBearer` sets would silently be missing. Pin `@movogo-io/service` together with the platform packages that peer `@movogo-io/host`, never one without the other. The deploy refuses the same lockfile when it stages.

A sibling service of ours is stood in for with `useUpstream` from `@movogo-io/fetch/test`. An endpoint **not owned by us** is stood in for with a mock server from `createServer` in `node:http`, at the bottom of the test file that needs it, its base URL taken from an environment variable the test sets.
