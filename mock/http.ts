import { clientFromHeaders, executeRequest } from '@movogo-io/host/http'
import { pathToRegExp, type Method } from '@movogo-io/host/http-registry'
import { getHandlers } from '@movogo-io/host/registry'
import type { JWTPayload } from 'jose'
import { SignJWT } from 'jose/jwt/sign'
import assert from 'node:assert/strict'
import { createPrivateKey } from 'node:crypto'
import { type JsonSafe } from '../context.js'
import { Environment } from '../http.js'
import { getEnvironment } from './context.js'
import { createMockContext, jsonRoundtrip } from './setup.js'

export * from './context.js'

export type Response = {
    headers: { [key: string]: string }
    status: number
    // Used to assert on in tests, so no need for the type system to get in the way
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any
}

type RequestOptions = BodylessRequestOptions | StringRequestOptions | JsonRequestOptions

type BodylessRequestOptions = {
    method?: Method
    uri: string
    headers?: { readonly [key: string]: string }
}

type StringRequestOptions = BodylessRequestOptions & {
    body: string
}

type JsonRequestOptions = BodylessRequestOptions & {
    json: JsonSafe
}

export async function request(options: RequestOptions): Promise<Response> {
    if (options.uri.startsWith('/')) {
        assert.strictEqual(options.uri, options.uri.slice(1), 'Path cannot start with slash.')
    }
    const handlers = getHandlers('http').map(withPathRegExp)
    const matchingHandlers = handlers.filter(
        h => h[pathRegExp].test(options.uri) && h.method === (options.method ?? 'GET'),
    )
    const [handler] = matchingHandlers
    const { log, context, success, flush } = createMockContext(
        clientFromHeaders(options.headers),
        handler?.config,
        handler?.meta,
    )
    if (!handler) {
        log.error('Request END', undefined, {
            handlers: handlers.map(h => ({
                pathPattern: h.pathPattern,
                pathRegExp: h[pathRegExp].toString(),
                method: h.method,
            })),
            response: {
                status: 404,
            },
        })
        return {
            headers: {},
            status: 404,
        }
    }
    if (matchingHandlers.length !== 1) {
        log.error('Multiple matching handlers.', undefined, {
            matchingHandlers: matchingHandlers.map(h => ({
                method: h.method,
                pattern: h.pathPattern,
            })),
        })
        log.error('Request END', undefined, {
            handlers: handlers.map(h => ({
                pathPattern: h.pathPattern,
                pathRegExp: h[pathRegExp].toString(),
                method: h.method,
            })),
            response: {
                status: 500,
            },
        })
        return {
            headers: {},
            status: 500,
        }
    }
    log.trace('Found handler', undefined, {
        handler: {
            pathPattern: handler.pathPattern,
            pathRegExp: handler[pathRegExp].toString(),
            method: handler.method,
        },
    })

    const response = await executeRequest(
        log,
        context,
        handler,
        {
            ...options,
            ...('json' in options && { json: jsonRoundtrip(options.json) }),
            uri: 'http://localhost/' + options.uri,
        },
        success,
    )
    await flush()

    return {
        headers: response.headers,
        status: response.status,
        body: helpfulBody(response.body),
    }
}

function helpfulBody(body: string | Buffer | undefined) {
    if (!body) {
        return undefined
    }
    if (Buffer.isBuffer(body)) {
        try {
            return JSON.parse(body.toString('utf-8')) as JSON
        } catch {
            return body
        }
    }
    try {
        return JSON.parse(body) as JSON
    } catch {
        return body
    }
}

const pathRegExp = Symbol()

function withPathRegExp<T extends { pathPattern: string; [pathRegExp]?: RegExp }>(
    handler: T,
): T & { [pathRegExp]: RegExp } {
    if (Object.hasOwn(handler, pathRegExp)) {
        return handler as T & { [pathRegExp]: RegExp }
    }
    handler[pathRegExp] = pathToRegExp(handler.pathPattern)
    return handler as T & { [pathRegExp]: RegExp }
}

export async function withBearer(
    payload: object,
    requestOptions: RequestOptions,
): Promise<RequestOptions> {
    const token = createBearerToken(getEnvironment(), payload, {
        issuer: 'https://riddance.example.com/oauth/',
        audience: 'https://riddance.example.com/',
        expiresIn: 60, // seconds
    })
    return {
        ...requestOptions,
        headers: {
            ...requestOptions.headers,
            authorization: `Bearer ${await token}`,
        },
    }
}

export type BearerTokenOptions = {
    issuer?: string
    audience?: string | string[]
    subject?: string
    expiresIn: number
}

export async function createBearerToken(
    env: Environment,
    payload: object,
    options: BearerTokenOptions,
): Promise<string> {
    const key = env.BEARER_PRIVATE_KEY
    if (!key) {
        throw new Error(
            'Please set the BEARER_PRIVATE_KEY environment variable to be able to create bearer tokens.',
        )
    }
    const certificate = '-----BEGIN EC PRIVATE KEY-----\n' + key + '\n-----END EC PRIVATE KEY-----'
    const now = Math.floor(Date.now() / 1000)
    return await new SignJWT(payload as JWTPayload)
        .setProtectedHeader({ alg: 'ES384', typ: 'JWT' })
        .setIssuedAt(now)
        .setIssuer(options.issuer ?? 'https://riddance.example.com/oauth/')
        .setAudience(options.audience ?? 'https://riddance.example.com/')
        .setExpirationTime(now + options.expiresIn)
        .sign(createPrivateKey({ key: certificate, format: 'pem', type: 'sec1' }))
}
