import { request } from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'

describe('echo', () => {
    it('should kick json back', async () => {
        const response = await request({
            method: 'POST',
            uri: 'echo/step',
            json: { message: 'hi' },
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.headers['x-in-response-to'], 'http://localhost/echo/step')
        assert.strictEqual(response.headers.time, undefined)
        assert.deepStrictEqual(response.body, { message: 'hi' })
    })

    it('should handle missing body', async () => {
        const response = await request({
            method: 'POST',
            uri: 'echo/step',
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.headers['x-in-response-to'], 'http://localhost/echo/step')
        assert.strictEqual(response.headers.time, undefined)
        assert.strictEqual(response.body, undefined)
    })

    it('should handle text', async () => {
        const response = await request({
            method: 'POST',
            uri: 'echo/step',
            body: 'some text',
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.headers['x-in-response-to'], 'http://localhost/echo/step')
        assert.deepStrictEqual(response.body, 'some text')
    })

    it('should serialize body', async () => {
        const now = new Date()
        const response = await request({
            method: 'POST',
            uri: 'echo/step',
            json: { now },
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.headers['x-in-response-to'], 'http://localhost/echo/step')
        assert.strictEqual(response.headers.time, now.getTime().toString())
        assert.deepStrictEqual(response.body, { now: now.toISOString() })
    })
})
