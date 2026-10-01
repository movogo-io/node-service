/* eslint-disable no-console */
import {
    ClientInfo,
    createContext,
    LogEntry,
    LogLevel,
    LogTransport,
} from '@movogo-io/host/context'
import { FullConfiguration, Metadata, setMeta } from '@movogo-io/host/registry'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { EOL } from 'node:os'
import { basename, extname, join, relative, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
    Environment,
    JsonSafeObject,
    type Attribution,
    type EventAttributes,
    type JsonObject,
    type JsonSafe,
    type Stringified,
} from '../context.js'

async function readEnv() {
    try {
        const envText = await readFile('test/env.txt', 'utf-8')
        return Object.fromEntries(
            envText
                .split('\n')
                .filter(l => l.length !== 0 && !l.startsWith('#'))
                .map(line => {
                    const ix = line.indexOf('=')
                    return [line.slice(0, ix).trim(), line.slice(ix + 1).trim()]
                }),
        )
    } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') {
            return {}
        }
        throw e
    }
}

async function assertSingleHost() {
    let lockText: string
    try {
        lockText = await readFile('package-lock.json', 'utf-8')
    } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') {
            return
        }
        throw e
    }
    const { packages } = JSON.parse(lockText) as { packages?: { [path: string]: unknown } }
    // Nested too: npm puts a second copy under a dependency when the hoisted one does not
    // satisfy its peer range, and that copy is as much a second registry as a top-level one.
    const hosts = Object.keys(packages ?? {}).filter(path => hostPathPattern.test(path))
    if (hosts.length > 1) {
        throw new Error(
            `More than one host installed (${hosts.join(', ')} in package-lock.json): the entrypoints register in one host instance while the mock and the platform packages run through another, and the attribution the other getBearer sets is silently missing. Pin @movogo-io/service together with the platform packages that peer @movogo-io/host, so one host is installed.`,
        )
    }
}

const hostPathPattern = /(^|\/)node_modules\/@(riddance|movogo-io)\/host$/u

async function readConfig() {
    const packageJson = JSON.parse(await readFile('package.json', 'utf-8')) as {
        name: string
        config?: object
    }
    return packageJson
}

let testContext: TestContext | undefined

export const mochaHooks = {
    async beforeAll() {
        await assertSingleHost()
        const { name, config } = await readConfig()
        const dir = process.cwd()
        const files = (await readdir('.')).filter(
            file => extname(file) === '.ts' && !file.endsWith('.d.ts'),
        )
        for (const file of files) {
            const base = basename(file, '.ts')
            setMeta(name, base, 'test-mock', config)
            await import(pathToFileURL(join(dir, base + '.js')).toString())
        }
    },

    async beforeEach() {
        const env = await readEnv()
        if (testContext) {
            throw new Error('Context exists.')
        }
        // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
        testContext = new TestContext(env)
    },

    afterEach: async function checkLog(this: Mocha.Context) {
        if (!testContext) {
            throw new Error('Test context lost.')
        }
        const test = this.currentTest
        if (test) {
            const title = test.fullTitle()
            if (test.isFailed()) {
                await testContext.log.dumpLog(title)
            }
            if (testContext.log.failed) {
                if (!test.isFailed()) {
                    await testContext.log.dumpLog(title)
                    throw new Error(
                        `"${title}" passed but subsequently failed because errors was logged during the test. Add using _ = allowErrorLogs() if the error log entries are expected.`,
                    )
                }
            }
        }
        // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
        testContext = undefined
    },
}

export function jsonRoundtrip<T extends JsonSafe>(obj: T | undefined): Stringified<T> | undefined {
    if (obj === undefined) {
        return undefined
    }
    // eslint-disable-next-line unicorn/prefer-structured-clone
    return JSON.parse(JSON.stringify(obj)) as Stringified<T>
}

export function createMockContext(
    client: ClientInfo,
    config?: FullConfiguration,
    meta?: Metadata,
    attribution?: Attribution,
) {
    const ctx = getTestContext()
    return createContext(
        client,
        [ctx.log],
        {
            sendEvent(
                topic: string,
                type: string,
                subject: string,
                data: JsonSafeObject | undefined,
                messageId: string | undefined,
                signal: AbortSignal,
                extras?: { attributes?: EventAttributes; attribution?: Attribution },
            ) {
                signal.throwIfAborted()
                ctx.emitted.push({
                    topic,
                    type,
                    subject,
                    data: jsonRoundtrip(data),
                    messageId,
                })
                const onBehalfOf = extras?.attribution?.onBehalfOf
                ctx.envelopes.push({
                    topic,
                    type,
                    subject,
                    messageId,
                    attributes: { ...extras?.attributes },
                    onBehalfOf:
                        onBehalfOf &&
                        (onBehalfOf.org === undefined
                            ? { userId: onBehalfOf.userId }
                            : { userId: onBehalfOf.userId, org: onBehalfOf.org }),
                })
                return Promise.resolve()
            },
        },
        { default: 15 },
        new AbortController(),
        config,
        meta,
        ctx.env,
        () => ctx.now(),
        attribution,
    )
}

export function getTestContext(): TestContext {
    if (!testContext) {
        throw new Error('No test is running.')
    }
    return testContext
}

class MockLogger implements LogTransport {
    failOnErrorLogs = true
    failed = false
    #entries: LogEntry[] = []
    readonly #startTime = Math.round(performance.now() * 10_000)

    getEntries() {
        return [...this.#entries]
    }

    clear() {
        this.#entries = []
        this.failOnErrorLogs = true
        this.failed = false
    }

    sendEntries(entries: LogEntry[]) {
        if (this.failOnErrorLogs && entries.some(e => e.level === 'error' || e.level === 'fatal')) {
            this.failed = true
        }
        this.#entries.push(...entries)
        return undefined
    }

    async dumpLog(testTitle: string) {
        if (this.#entries.length === 0) {
            return
        }

        const p = this.writeLog()
        const errors = this.#entries.filter(e => e.level === 'fatal' || e.level === 'error')
        if (errors.length !== 0) {
            console.error(testTitle + ' error log:')
            for (const e of errors) {
                console.error(`@${this.#msSinceStart(e)}ms ${levelString(e.level)} ${e.message}`)
                if (e.error) {
                    console.error(e.error)
                }
            }
        }
        const logFile = await p
        if (logFile) {
            console.info(
                `Full log of "${testTitle}" saved to .${sep}${relative(process.env.PROJECT_DIRECTORY ?? process.cwd(), logFile)}`,
            )
        }
    }

    async writeLog() {
        try {
            const resultPath = join('test', 'results')
            await mkdir(resultPath, { recursive: true })
            const name = join(
                resultPath,
                'log-' + new Date().toISOString().replaceAll(':', '') + '.json',
            )
            await writeFile(
                name,
                `[${this.#entries
                    .map(e =>
                        JSON.stringify(
                            {
                                timeOffset: this.#msSinceStart(e),
                                ...JSON.parse(e.json),
                            },
                            undefined,
                            '  ',
                        ),
                    )
                    .join(',' + EOL)}]`,
            )
            return name
        } catch (e) {
            console.error(`Error saving log:`)
            console.error(e)
            console.log('Full log:')
            for (const entry of this.#entries) {
                console.log(
                    `@${this.#msSinceStart(entry)}ms ${levelString(entry.level)} ${entry.message}`,
                )
                if (entry.error) {
                    console.log(entry.error)
                }
            }
            return undefined
        }
    }

    #msSinceStart(entry: LogEntry) {
        return (Math.round(entry.timestamp * 10_000) - this.#startTime) / 10_000
    }
}

function levelString(level: LogLevel) {
    switch (level) {
        case 'trace':
            return '[TRACE]  '
        case 'debug':
            return '[DEBUG]  '
        case 'info':
            return '[INFO]   '
        case 'warning':
            return '[WARNING]'
        case 'error':
            return '[ERROR]  '
        case 'fatal':
            return '[FATAL]  '
        default:
            return ' '.repeat(9)
    }
}

type Event = {
    topic: string
    type: string
    subject: string
    data?: JsonObject
    messageId: string | undefined
}

export type Envelope = {
    topic: string
    type: string
    subject: string
    messageId: string | undefined
    attributes: { [name: string]: string }
    onBehalfOf: { userId: string; org?: string } | undefined
}

class TestContext {
    readonly log: MockLogger
    environment: { [key: string]: string }

    emitted: Event[] = []
    envelopes: Envelope[] = []

    frozenTime: number | undefined
    timeShift = 0

    constructor(env: Environment) {
        this.environment = {
            BEARER_PUBLIC_KEY:
                'MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAESKk7sgjLJNz4erSkGiuFRQCUZiVELR4VjqrWS01kKxZSthAKuX5A4ib8ODd2le/4m99vBIKpDKWP6CT/LvhzcXstSxz4VaOkbczfo3VUvKREi0yUZLasKB5oQP2AGAyr',
            BEARER_PRIVATE_KEY:
                'MIGkAgEBBDCuIjzsQ+q0iCuyEiLq9vFfZ6Lj6/vxlZDxLanGoO88yL9V0EsZbofwvpW4cb32++SgBwYFK4EEACKhZANiAARIqTuyCMsk3Ph6tKQaK4VFAJRmJUQtHhWOqtZLTWQrFlK2EAq5fkDiJvw4N3aV7/ib328EgqkMpY/oJP8u+HNxey1LHPhVo6RtzN+jdVS8pESLTJRktqwoHmhA/YAYDKs=',
            ...env,
        }
        this.log = new MockLogger()
    }

    get env() {
        return this.environment
    }
    now(): Date {
        if (this.frozenTime !== undefined) {
            return new Date(this.frozenTime + this.timeShift * 1000)
        }
        const d = new Date()
        d.setUTCSeconds(d.getUTCSeconds() + this.timeShift)
        return d
    }
}
