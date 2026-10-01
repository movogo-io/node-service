import {
    allowErrorLogs,
    freezeTime,
    getEmitted,
    getEmittedEnvelopes,
    getLoggedEntries,
    request,
} from '@movogo-io/service/test/http'
import assert from 'node:assert/strict'

describe('greeting', () => {
    it('should say hi', async () => {
        freezeTime(new Date(Date.UTC(2024, 8, 20, 20, 20)))
        const response = await request({ uri: `greeting/step?who=world` })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(response.body, {
            step: 'step',
            message: 'Hello, world!',
            now: '2024-09-20T20:20:00.000Z',
        })
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            ['here'],
        )
        assert.deepStrictEqual(getEmitted(), [
            {
                topic: 'greeting',
                type: 'sent',
                subject: 'anonymous',
                messageId: undefined,
                data: {
                    message: 'hello',
                    who: 'world',
                },
            },
        ])
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'greeting',
                type: 'sent',
                subject: 'anonymous',
                messageId: undefined,
                attributes: { lang: 'en' },
                onBehalfOf: undefined,
            },
        ])
    })

    it('should refuse a reserved attribute name', async () => {
        using _ = allowErrorLogs()
        const response = await request({ uri: `greeting/step?who=world&bad=1` })

        assert.strictEqual(response.status, 500)
        assert.deepStrictEqual(response.body, undefined)
        assert.deepStrictEqual(getEmitted(), [])
        assert.deepStrictEqual(getEmittedEnvelopes(), [])
    })
})
