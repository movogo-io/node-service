# HTTP Requests

Authorization in a service on `@movogo-io/contract` goes through `requireScopes` and `requireApiKey` (see `@movogo-io/contract#scopes`): the example below shows the host's primitives underneath them, not the pattern to copy.

This example shows the features of HTTP request handling entrypoints:

```ts
import { acceptForwardedAttribution, badRequest, forbidden, get, getBearer, objectSpreadable } from "@movogo-io/service/http";

// get is the method, it can also be `put`, `patch`, `post`, and `del`. First argument is the path. It can contain `*` as a single segment wildcard, or end in `**` to match any number of segments.
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

## Raw bodies

A webhook signed with an HMAC over the bytes the sender sent cannot be verified against a parsed body, since re-serialized JSON loses the sender's whitespace and key order. `rawBody: true` hands the handler the body unparsed, as `string | undefined`:

```ts
import { forbidden, post } from "@movogo-io/service/http";
import { createHmac, timingSafeEqual } from "node:crypto";

post("signed", { rawBody: true }, (context, request) => {
    if (typeof request.body !== "string") {
        throw forbidden();
    }
    const expected = createHmac("sha256", context.env.KEY ?? "").update(request.body).digest();
    const actual = Buffer.from(request.headers["x-signature"] ?? "", "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw forbidden();
    }
    const event: unknown = JSON.parse(request.body);
    // ...
});
```

In tests, send the exact signed string with `body`. A `json` option reaches a raw-body handler as `JSON.stringify` of it, so the handler sees the same shape as in production.

## Methods and paths

- `get`: for side-effect free reads. Get a list of resources with path `bananas`, get a single resource with path `bananas/*` where the last segment is the ID.
- `put`: for changing full resource. Use ID for the resource in the path, e.g. `bananas/*`.
- `patch`: like `put` but with partial body.
- `delete`: for changing full resource. Use ID for the resource in the path, e.g. `bananas/*`.
- `post`: on e.g. the path `bananas`, either for reads with large complicated queries, or for one-off sending of messages that cannot have an ID, that cannot be idempotent and where idempotency does not matter.
