# Context

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

## Filtering events

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

## Utilities

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
