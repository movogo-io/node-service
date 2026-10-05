# Event handlers and scheduled jobs

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
