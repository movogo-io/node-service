# Overview

This project is a cloud-agnostic **stateless** **zero-trust** **microservice** written for **Nodejs** in **TypeScript** using Riddance abstractions. The service implementation is simple and you should be able to read all code and understand it in one go.

## Notes

- Services are **stateless**. Global variables **WILL NOT** from one invocation to the next.
- The service will be deployed in a zero-defect environment: any errors logged will notify a site reliability engineer.
- **DO NOT** hard-code environment-specific variables.
- Creating new entrypoints is hard. Think hard about it. Plan ahead.
- Make sure changes leave **endpoints backwards compatible**. It is OK to make breaking changes **inside** the service.
- **DO** think hard about adding tests. Sometimes the environment around a service cannot be sufficiently manipulated. Sometimes we may resort to triggering the code and be happy that no errors occurred.
- **DO** treat entrypoints as black boxes when writing tests, e.g. **DO NOT** go digging into how they store store data. If an entrypoint (like a POST or an event handler) has a sideeffect, **DO** use another entrypoint (like a GET) to verify the sideeffect.
- **DO NOT** fail silently. If an entrypoint did not accomplish what it was intended to do, it needs to throw an exception or at least log an error.

## File structure

- `./`: The root contains the entrypoints, i.e. the handlers that run business logic in the cloud.
- `./test/`: For each of the root entrypoint files, there is a similarly named test files. The tests use Riddance mocks.
- `./bin/`: Contains any commandline utilities for working with the service. Most services do not have such utilities.

# Entrypoint types

There are three types of entrypoints:

- HTTP requests
- Event handlers
- Scheduled tasks

## HTTP Requests

This example shows the features of HTTP request handling entrypoints:

```ts
import { acceptForwardedAttribution, badRequest, forbidden, get, getBearer, objectSpreadable } from "@movogo-io/service/http";

// get is the method, it can also be `put`, `post`, and `delete`. First argument is the path. It can contain `*` as a single segment wildcard, or end in `**` to match any number of segments.
get("users/*/profile", async (context, request) => {
    // `getBearer` takes the JWT bearer token for the current request, verifies and unpacks it. It will throw `unauthorized` if it can't, so the code following it can assume there is a correctly signed bearer token. `getBearer` returns parsed JSON, which TypeScript doesn't know. `objectSpreadable` is a no-op function that tells TypeScript that it is safe to spread the JSON into an object whose values will also be parsed JSON. If the JSON is in fact a number or a boolean, the spread will work, but be empty. There is a similar function called `arraySpreadable` allows spreading JSON that is an array into an array. When the verified token carries both `sub` and `org`, `getBearer` also records `context.attribution.onBehalfOf = { userId: sub, org }`, which rides along on `httpRequestHeaders` and emitted events as attribution (never authorization: keep checking `sub` and `scope` here). A request to a bearer route carrying any `x-on-behalf-of-*` header is answered 400 before the token is looked at.
    const { sub, scope } = objectSpreadable(await getBearer(context, request));
    // Make sure to weed out error cases in the beginning
    if (typeof sub !== "string") {
        // Exceptions thrown will result in status code 500, unless they have a statusCode in which case that will be used. `forbidden` is a function that returns an exception with status code 403. There are similar functions called `unauthorized`, `notFound`, `badRequest`, and `notImplemented`. There's a shortcut to make your own: `withStatus(new Error('My error message'), 418)`. Only the status code is included in the response, nothing else, not the stacktrace, not the exception message.
        throw forbidden();
    }
    // `scope` is also parsed JSON, so type check it
    if (typeof scope !== "string" || !scope.split(" ").includes("admin")) {
        throw forbidden();
    }
    // request.headers is an object with the request headers with lowercase keys. Use API keys for security if the endpoint is used from another service, use bearer tokens if the endpoint is used by logged in users. Use neither if the endpoint is public. Assume there is no other security layer than what you implement here.
    if (request.headers["api-key"] !== context.env.API_KEY) {
        throw forbidden();
    }
    // On an API-key route called by one of our own services, accept the caller's `x-on-behalf-of-user-id` / `x-on-behalf-of-org` headers into `context.attribution` so the user they act for stays attached to what this handler emits and requests. Call it right after the api-key check, never before. It is attribution, never authorization: do not read it to decide what the request may do.
    acceptForwardedAttribution(context, request);
    // request.url is a standard URL
    const query = request.url.searchParams.get("q");
    if (query === null) {
        // `badRequest` takes an argument which is `publicMessage` which will be included in the response. You can add a public message to any Error like this: `withPublicMessage(new Error('The internal message'), 'This message goes in the response.')`
        throw badRequest("No query provided. Please provide one using the q parameter.");
    }
    // request.url has one utility extension, `pathStepAt`, that returns the zero-based step in the path. This will e.g. return the actual value for the wild-card step in "users/*/profile"
    const userId = request.url.pathStepAt(1);

    // Returned values will be the HTTP response. If there is no return or `undefined` is returned, 204 status will be returned. A single string can also be returned, which will make the string the body, with a 200 status.
    return {
        // Responses can have headers. They very rarely do. The content-type header will be set automatically.
        headers: { custom: "value" },
        // `body` can be a string, an object or a Buffer. If it is an object, it will be converted to JSON.
        body: {
            items: [],
        },
        // Responses can have status codes. The default is 200 if there is also a body, 204 if there is no body.
        status: 200,
    };
});
```

These endpoints are tested in files with the same name in the test directory using mocha like this:

```ts
import { allowErrorLogs, getEnvironment, request, withBearer } from "@movogo-io/service/test/http";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Use the file name as the description
describe("user-profile", () => {
    // Include all the negative cases
    it("should forbid", async () => {
        // If a test causes the entry point to log an error the test will fail even if all asserts pass and no exceptions are thrown. This is to ensure that handlers do not spam the error logs for now reason. If, however, the error log is expected since we're testing an error case that is not supposed to happen, this behavior can be disabled in the scope where `allowErrorLogs` is called. **ONLY USE** `allowErrorLogs` if the test is testing an error condition.
        using _ = allowErrorLogs();
        // HTTP endpoints are triggered using the `request` function.
        const response = await request({
            // The request can specify method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'. GET is default, so omit for GET requests
            method: "GET",
            // Request can have headers. Use lower-case keys.
            headers: {
                // Tests van have environment variables that are stored in test/env.txt. The same variable likely with different values will be available when deployed. They can be accessed as an object using getEnvironment().
                "api-key": getEnvironment().API_KEY,
            },
            //  Avoid hard-coding test values if they are't important for what is being tested. Just use randomUUID, don't install a package for something so simple.
            uri: `users/${randomUUID()}/profile`,
            // Requests can have plain-text bodies
            body: "some text",
            // or bodies serialized to JSON
            json: {
                some: "thing",
            },
        });

        assert.strictEqual(response.status, 401);
    });

    it("should return profile", async () => {
        const response = await request(
            // Wrap the request argument in `withBearer` to add a valid bearer header to the request.
            await withBearer(
                // The first argument is the contents of the bearer token as it will be seen by `getBearer` in the handler.
                { sub: "its me", scopes: "admin tech" },
                { uri: `users/${randomUUID()}/profile?q=stuff` },
            ),
        );

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, { items: [] });
    });

    // Test for idempotency
    it("should be idempotent", async () => {
        // The first simulating a request that times out
        await request(
            await withBearer(
                { sub: "its me", scopes: "admin tech" },
                { uri: `users/${randomUUID()}/profile?q=stuff` },
            ),
        );
        // The retry request
        const response = await request(
            await withBearer(
                { sub: "its me", scopes: "admin tech" },
                { uri: `users/${randomUUID()}/profile?q=stuff` },
            ),
        );

        // The response of the second request should be the same as if it was the only one.
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body, { items: [] });
    });
});
```

The test/env.txt file that provides default environment variables in tests could look like this:

```ini
# test/env.txt
API_KEY=our-secret
OTHER_SERVICE_BASE_URL=https://example.com/api/
OTHER_SERVICE_API_KEY=some-key
```

HTTP requests can time out as seen from the client. If they do, clients will retry, so the entrypoints need to be idempotent. For getting and updating resources, consider adding a `revision` number that is incremented on update, in order to track the order of updates.

### Methods and paths

- `get`: for side-effect free reads. Get a list of resources with path `bananas`, get a single resource with path `bananas/*` where the last segment is the ID.
- `put`: for changing full resource. Use ID for the resource in the path, e.g. `bananas/*`.
- `patch`: like `put` but with partial body.
- `delete`: for changing full resource. Use ID for the resource in the path, e.g. `bananas/*`.
- `post`: on e.g. the path `bananas`, either for reads with large complicated queries, or for one-off sending of messages that cannot have an ID, that cannot be idempotent and where idempotency does not matter.

## Event Handlers

Event handlers are used for asynchronous processing in a publish/subscribe event driven architecture. Assume the delivery is at-least-once, so it needs to be idempotent if feasible. Any unhandled exceptions will trigger a retry. This example shows the features of entrypoints used to handle events:

```ts
import { objectSpreadable, on } from "@movogo-io/service/event";

// Setup the handler using the `on` function. First argument is the topic to handle, typically a noun, the second is the type, typically a verb in past tense indicating what happened to the topic. In addition to the context (see below), the handler is passed a subject which is the ID of the entity in the topic this event is about, the `event` it self with is a parsed JSON object with data about the event, the `timestamp` which is the time the event occurred, and a `messageId` which is the ID of the event, which can be used to track duplicates. The latter two are rarely used, and sometime the event has no data in which case `event` is also not used.
on("account", "locked", (context, subject, event, timestamp, messageId) => {
    const { what } = objectSpreadable(event);
    // TODO: Handle the event
});
```

These endpoints are tested in files with the same name in the test directory using mocha like this:

```ts
import { emit } from "@movogo-io/service/test/event";
import { randomUUID } from "node:crypto";

describe("account locked", () => {
    it("should keep quite", async () => {
        // Event handlers are triggered using the `emit` function which takes arguments matching the `on` handler registration function: `emit(topic, type, subject, data?, messageId?, { attributes?, onBehalfOf? })`. Handlers with a filter are matched like the bus matches them, on `attributes`. `emit` returns false, with one warning logged, when every handler for the topic and type was excluded by its filter, and true when no handler listens at all.
        await emit("account", "locked", randomUUID(), {
            what: new Date(),
        });
        // TODO: Assert side-effects
    });

    // TODO: More tests
});
```

If for some reason processing an event takes a long time, the same events may be processed again, so the entrypoints need to be idempotent.

## Scheduled jobs

Scheduled jobs allow code to run regularly on a schedule without any explicit trigger. Any unhandled exceptions will not trigger a retry, but the handler will be triggered again at the next scheduled time. As such, it does not make sense for them to be idempotent. This example shows the features of entrypoints running on a schedule:

```ts
import { setInterval } from "@movogo-io/service/timer";

// Setup the handler using the `setInterval` function. The first argument is the CRON schedule, the second argument is the handler. The handler is passed the time it was triggered matching the CRON expression. Here, the handler is triggered every hour on the hour.
setInterval("0 */1 * * *", async (context, { triggerTime }) => {
    // TODO: implement handler
});
```

These endpoints are tested in files with the same name in the test directory using mocha like this:

```ts
import { clockStrikes } from "@movogo-io/service/test/timer";

describe("scheduled jobs", () => {
    it("should keep quite", async () => {
        // Scheduled jobs are triggered using the `clockStrikes` function which takes a Date that needs to match the CRON schedule, but otherwise can be any time. Note that if the service has multiple schedules, all the matching schedules will be triggered.
        await clockStrikes(new Date(2025, 9, 24, 20, 0));
        // TODO: Assert side-effects
    });

    // TODO: More tests
});
```

## Context

All entrypoint callbacks are provided a `context`. You can use it as follows:

```ts
async (context) => {
    // Publish events. Here the 'locked' event is published on the 'account' topic with subject userId and data { reason: 'rate-limit' }. Only emit events when asked to, as they typically interact with the entire system.
    await context.emit("account", "locked", userId, { reason: "rate-limit" });
    // The full signature is `emit(topic, type, subject, data?, messageId?, attributes?)`. `attributes` are exact strings consumers filter on, put beside the event, not in it: at most four, names matching `^[a-z][A-Za-z0-9]{0,63}$` and none of the reserved `operationId`, `clientId`, `clientIp`, `clientPort`, `userAgent`, `content-encoding`, `onBehalfOfUserId`, `onBehalfOfOrg` or anything starting with `AWS.` / `Amazon.`; values non-empty, at most 256 characters, no control characters. The subject is non-empty, under 100 characters, without line breaks or control characters. Emit throws before anything is sent when a rule is broken. Do not invent attributes for announcements: the contract package's helpers supply them.

    // Log using `context.log`. All handlers come with built-in begin and end logging with all necessary context, as well as built-in logging of uncaught exceptions, so it's very you need to do this. Include the error as-is from the catch clause as the second argument if you have it, otherwise pass undefined. The third argument is arbitrary structured data that will be attached to the log entry. Use level "trace" for frequent logging, "debug" for entries that may be useful for debugging, "info" for status updates in long running processes, "warn" to call attention to things that are odd but may directly cause an error, and "error" if something has gone wrong. Do not log and rethrow, since uncaught errors are logged automatically, so only catch and log errors if you need to proceed with other things afterwards.
    context.log.warn("Something odd.", new Error("Error message"), { extra: "structured data" });
    // The wall clock time
    const now = context.now();

    // context.env is the environment, where any deployment specific information is stored
    // Note that BASE_URL variables end in a slash, so they can be concatenated with relative paths
    await fetch(context.env.SERVICE_BASE_URL + "?q=stuff", {
        headers: {
            // When requesting **our own endpoints**, include the headers from `httpRequestHeaders`. This will pass along information such as client ID, user agent, IP address, always an `x-request-id` (the operation id minted for this invocation, which every response also echoes as `x-request-id`), and `x-on-behalf-of-user-id` / `x-on-behalf-of-org` when `context.attribution.onBehalfOf` is set.
            ...httpRequestHeaders(context),

            // **DO NOT** use `httpRequestHeaders` when requesting **endpoints not owned by us**. Instead, pass **only** a user agent:
            "user-agent": "MyBusinessService/1",
        },
        // `context.signal` is the AbortSignal for the whole handler. Pass it along to async functions.
        signal: context.signal,
    });
};
```

### Filtering events

A handler that only wants some of a topic's events declares a filter in its configuration, and the bus delivers only events whose attributes match: every key of the filter present on the event with a value strictly equal to one of the listed values. Exact strings only, one to five keys, distinct values, at most 150 combinations.

```ts
import { on } from "@movogo-io/service/event";
// Requires `@movogo-io/contract` 0.6.0 or later, which ships the filter helpers in its `schema` entry.
import { announcementFilter } from "@movogo-io/contract/schema";
// The `announcements` entries come from the producer's documents package, the same entries `followChanges` takes.
import { announcements as rentals } from "@movogo-io/rentals-documents";

// Take the filter from the contract package's helpers (`announcementFilter(...entries)` over the `announcements` entries of the resources followed, `actionFilter(entry, actions)` for one resource's audited actions, which is lossy as the contract package's instructions explain), never spell attribute names by hand. A service on a contract older than 0.6.0 spells the one documented shape, `{ filter: { resource: ["rental"] } }`, and a reviewer checks it against the announcing service's registry.
on("document", "changed", { filter: announcementFilter(rentals.rental) }, async (context, subject, event) => {
    // ...
});
```

A filter change takes up to 15 minutes to propagate after a deploy, and selection is not correctness: the handler still checks the event and discards what it does not handle.

### Utilities

**arraySpreadable**

Like `objectSpreadable`, `arraySpreadable` provides a type-safe way of spreading JSON to arrays by returning an empty array if the argument is not an array:

```ts
const [a, b, c] = arraySpreadable(json);
```

**missing**

```ts
// `missing` is a TypeScript helper that can be used an expression and that returns `never`. It always throws an error that says the argument is missing. Use after the `??` operator to make an expression that is possibly undefined well-defined.
fetch(context.env.SERVICE_BASE_URL ?? missing("SERVICE_BASE_URL environment variable"));
```

**Testing**

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

If a handler does a fetch to **endpoints not owned by us**, consider using creating a helper mock server using Nodejs' built-in `createServer` in the `node:http` module and use environment variable to direct the handler to hit that mock, and use it in all relevant tests. Put such mocks at the bottom of the test files that need them. For **our own endpoints** and public external endpoints that doesn't mutate anything, just let the fetch run as-is against an already deployed service configured in env.txt. Ask if you do not know where it's deployed.

## Related Packages

npm install and use the following packages if relevant:

**fetch**: **DO USE** the `@riddance/fetch` package rather than the built-in `fetch`.
**docs**: **DO USE** the `@riddance/docs` package as document database to store end-user provided data if needed.

Re-read your instructions after you install packages.
