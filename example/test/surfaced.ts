import {
    allowErrorLogs,
    createBearerToken,
    getEmitted,
    getEmittedEnvelopes,
    request,
    setEnvironment,
    withBearer,
} from '@movogo-io/service/test/http'
import { getLoggedEntries } from '@movogo-io/service/test/context'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

// spell-checker: ignore secp
// The same shape as the mock's own pair: an SPKI public and a SEC1 private body, no armour.
const mcp = generateKeyPairSync('ec', {
    namedCurve: 'secp384r1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'sec1', format: 'der' },
})
const mcpPublicKey = mcp.publicKey.toString('base64')
const mcpPrivateKey = mcp.privateKey.toString('base64')

describe('surfaced', () => {
    it('should throw when the named key is not set', async () => {
        using _ = allowErrorLogs()
        const token = await createBearerToken(
            { BEARER_PRIVATE_KEY: mcpPrivateKey },
            { sub: '🤫', org: 'acme' },
            { expiresIn: 60 },
        )
        const response = await request({
            uri: `surfaced`,
            headers: { authorization: `Bearer ${token}` },
        })

        assert.strictEqual(response.status, 500)
        assert.deepStrictEqual(getEmitted(), [])
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'error')
                .map(e => (e.error as Error | undefined)?.message),
            ['Please set the BEARER_PUBLIC_KEY_MCP environment variable to extract bearer.'],
        )
    })

    it('should throw when the named key is not set and there is no token', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `surfaced` })

        assert.strictEqual(response.status, 500)
    })

    it('should forbid without a token', async () => {
        using _ = allowErrorLogs()
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const response = await request({ uri: `surfaced` })

        assert.strictEqual(response.status, 401)
    })

    it('should forbid a token signed with the default key', async () => {
        using _ = allowErrorLogs()
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const response = await request(
            await withBearer({ sub: '🤫', org: 'acme' }, { uri: `surfaced` }),
        )

        assert.strictEqual(response.status, 401)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should forbid an expired token signed with the named key', async () => {
        using _ = allowErrorLogs()
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const token = await createBearerToken(
            { BEARER_PRIVATE_KEY: mcpPrivateKey },
            { sub: '🤫', org: 'acme' },
            { expiresIn: -60 },
        )
        const response = await request({
            uri: `surfaced`,
            headers: { authorization: `Bearer ${token}` },
        })

        assert.strictEqual(response.status, 401)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should refuse forwarded attribution', async () => {
        using _ = allowErrorLogs()
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const token = await createBearerToken(
            { BEARER_PRIVATE_KEY: mcpPrivateKey },
            { sub: '🤫', org: 'acme' },
            { expiresIn: 60 },
        )
        const response = await request({
            uri: `surfaced`,
            headers: { authorization: `Bearer ${token}`, 'x-on-behalf-of-user-id': 'intruder' },
        })

        assert.strictEqual(response.status, 400)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should forbid a token signed with the named key where no key is named', async () => {
        using _ = allowErrorLogs()
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const token = await createBearerToken(
            { BEARER_PRIVATE_KEY: mcpPrivateKey },
            { sub: '🤫', org: 'acme' },
            { expiresIn: 60 },
        )
        const response = await request({
            uri: `authorized?q=stuff`,
            headers: { authorization: `Bearer ${token}` },
        })

        assert.strictEqual(response.status, 401)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should verify a token signed with the named key', async () => {
        setEnvironment({ BEARER_PUBLIC_KEY_MCP: mcpPublicKey })
        const token = await createBearerToken(
            { BEARER_PRIVATE_KEY: mcpPrivateKey },
            { sub: '🤫', org: 'acme' },
            { expiresIn: 60 },
        )
        const response = await request({
            uri: `surfaced`,
            headers: { authorization: `Bearer ${token}` },
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { sub: '🤫' })
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'surfaced',
                type: 'seen',
                subject: 'x',
                messageId: undefined,
                attributes: {},
                onBehalfOf: { userId: '🤫', org: 'acme' },
            },
        ])
    })
})
