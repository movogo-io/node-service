import {
    allowErrorLogs,
    getEmitted,
    getEmittedEnvelopes,
    request,
    withBearer,
} from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'

describe('authorized', () => {
    it('should forbid', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `authorized` })

        assert.strictEqual(response.status, 401)
    })

    it('should authorize', async () => {
        using _ = allowErrorLogs()
        const response = await request(await withBearer({ sub: 'its me' }, { uri: `authorized` }))

        assert.strictEqual(response.status, 403)
    })

    it('should check', async () => {
        using _ = allowErrorLogs()
        const response = await request(await withBearer({ sub: '🤫' }, { uri: `authorized` }))

        assert.strictEqual(response.status, 400)
    })

    it('should check', async () => {
        const response = await request(
            await withBearer({ sub: '🤫' }, { uri: `authorized?q=stuff` }),
        )

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { items: [] })
    })

    it('should attribute emits to the verified token', async () => {
        const response = await request(
            await withBearer({ sub: '🤫', org: 'acme' }, { uri: `authorized?q=stuff` }),
        )

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(getEmitted(), [
            {
                topic: 'authorized',
                type: 'seen',
                subject: '🤫',
                data: undefined,
                messageId: undefined,
            },
        ])
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'authorized',
                type: 'seen',
                subject: '🤫',
                messageId: undefined,
                attributes: {},
                onBehalfOf: { userId: '🤫', org: 'acme' },
            },
        ])
    })

    it('should attribute nothing without an org', async () => {
        const response = await request(
            await withBearer({ sub: '🤫' }, { uri: `authorized?q=stuff` }),
        )

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'authorized',
                type: 'seen',
                subject: '🤫',
                messageId: undefined,
                attributes: {},
                onBehalfOf: undefined,
            },
        ])
    })

    it('should refuse forwarded attribution', async () => {
        using _ = allowErrorLogs()
        const response = await request(
            await withBearer(
                { sub: '🤫', org: 'acme' },
                {
                    uri: `authorized?q=stuff`,
                    headers: { 'x-on-behalf-of-user-id': 'intruder' },
                },
            ),
        )

        assert.strictEqual(response.status, 400)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should refuse forwarded attribution whatever the header case', async () => {
        using _ = allowErrorLogs()
        const response = await request(
            await withBearer(
                { sub: '🤫', org: 'acme' },
                {
                    uri: `authorized?q=stuff`,
                    headers: { 'X-On-Behalf-Of-Org': 'intruders' },
                },
            ),
        )

        assert.strictEqual(response.status, 400)
        assert.deepStrictEqual(getEmitted(), [])
    })
})
