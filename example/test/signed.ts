import { allowErrorLogs, request } from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

describe('signed', () => {
    it('should forbid a wrong signature', async () => {
        using _ = allowErrorLogs()
        const response = await request({
            method: 'POST',
            uri: 'signed',
            headers: { 'x-signature': '00' },
            body: '{"event":"created"}',
        })

        assert.strictEqual(response.status, 403)
    })

    it('should verify the body as sent', async () => {
        const body = '{"event": "created",  "id": 7}'
        const response = await request({
            method: 'POST',
            uri: 'signed',
            headers: { 'x-signature': createHmac('sha256', '🤫').update(body).digest('hex') },
            body,
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { received: body })
    })

    it('should hand a json option over serialized', async () => {
        const response = await request({
            method: 'POST',
            uri: 'signed',
            headers: {
                'x-signature': createHmac('sha256', '🤫')
                    .update('{"event":"created"}')
                    .digest('hex'),
            },
            json: { event: 'created' },
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { received: '{"event":"created"}' })
    })
})
