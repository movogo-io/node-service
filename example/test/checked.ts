import { allowErrorLogs, request } from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'

describe('checked', () => {
    it('should forbid', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `check` })

        assert.strictEqual(response.status, 401)
    })

    it('should authorize', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `check?key=my-key` })

        assert.strictEqual(response.status, 403)
    })

    it('should check', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `check?key=%f0%9f%A4%aB` })

        assert.strictEqual(response.status, 400)
    })

    it('should check', async () => {
        const response = await request({ uri: `check?key=%f0%9f%A4%aB&q=stuff` })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, { items: [] })
    })
})
