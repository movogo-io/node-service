A cloud-agnostic, **stateless**, **zero-trust** microservice: simple enough to read all of it in one go. Root files are entrypoints, with a same-named test in `test/` for each; `bin/` holds the rare command-line tool.

- **Three entrypoint types, one registration per file.** HTTP (`get`, `put`, `patch`, `post`, `del`): a client that times out retries, so every request converges on a rerun. Event handlers (`on`): delivery is at least once, and a throw redelivers. Scheduled jobs (`setInterval`): a throw is not retried; the job runs again at its next time. New entrypoints are hard to change once deployed: plan them. See @movogo-io/service#http and @movogo-io/service#events-and-timers.
- **Stateless.** Module-level variables do not survive from one invocation to the next.
- **Any error log pages a site reliability engineer, and fails the test that caused it.** Never log at error for an expected refusal; `allowErrorLogs()` only in a test of a genuine error. Do not catch and log what is rethrown: uncaught errors are logged once by the host.
- **Never fail silently.** An entrypoint that did not do its job throws or logs an error.
- **Read the time with `context.now()`, never `new Date()`**, so tests can move it; pass `context.signal` to anything async. No environment-specific value is hard-coded: it comes from `context.env`.
- **`httpRequestHeaders(context)` goes only to our own services**, through `@movogo-io/fetch`. An external provider gets a plain `user-agent` and `@riddance/fetch`. Documents are stored through `@movogo-io/docs`.
- **Endpoints stay backwards compatible**; breaking changes are fine inside the service.
- **Tests treat entrypoints as black boxes.** Drive them with `request`, `emit` and `clockStrikes`, and check a side effect through another entrypoint, never by reading storage. See @movogo-io/service#testing.
- **Pin `@movogo-io/service` together with every platform package that peers `@movogo-io/host`.** The test run refuses a lockfile that installs two hosts.
