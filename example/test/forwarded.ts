import {
    allowErrorLogs,
    getEmitted,
    getEmittedEnvelopes,
    request,
} from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'

describe('forwarded', () => {
    it('should forbid', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `forwarded` })

        assert.strictEqual(response.status, 403)
        assert.deepStrictEqual(getEmitted(), [])
    })

    it('should accept forwarded attribution', async () => {
        const response = await request({
            uri: `forwarded`,
            headers: {
                'api-key': '🤫',
                'x-on-behalf-of-user-id': 'u1',
                'x-on-behalf-of-org': 'o1',
            },
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, {
            'x-on-behalf-of-user-id': 'u1',
            'x-on-behalf-of-org': 'o1',
        })
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'forwarded',
                type: 'seen',
                subject: 'x',
                messageId: undefined,
                attributes: {},
                onBehalfOf: { userId: 'u1', org: 'o1' },
            },
        ])
    })

    it('should accept forwarded attribution whatever the header case', async () => {
        const response = await request({
            uri: `forwarded`,
            headers: { 'api-key': '🤫', 'X-On-Behalf-Of-User-Id': 'u1' },
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { 'x-on-behalf-of-user-id': 'u1' })
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'forwarded',
                type: 'seen',
                subject: 'x',
                messageId: undefined,
                attributes: {},
                onBehalfOf: { userId: 'u1' },
            },
        ])
    })

    it('should forward nothing when nothing was forwarded', async () => {
        const response = await request({
            uri: `forwarded`,
            headers: { 'api-key': '🤫' },
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, {})
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'forwarded',
                type: 'seen',
                subject: 'x',
                messageId: undefined,
                attributes: {},
                onBehalfOf: undefined,
            },
        ])
    })
})
