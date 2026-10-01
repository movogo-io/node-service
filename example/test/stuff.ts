import {
    allowErrorLogs,
    emit,
    getEmitted,
    getEmittedEnvelopes,
    getLoggedEntries,
} from '@movogo-io/service/test/event'
import assert from 'node:assert/strict'

describe('stuff event', () => {
    it('throws on bad subject', async () => {
        using _ = allowErrorLogs()
        await emit('stuff', 'happened', '1', {
            what: 'this',
        })

        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info'),
            [],
        )
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'error')
                .map(e => e.message),
            ['Event END'],
        )
    })

    it('throws on bad data', async () => {
        using _ = allowErrorLogs()
        await emit('stuff', 'happened', '1234', {
            what: 3,
        })

        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info'),
            [],
        )
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'error')
                .map(e => e.message),
            ['Event END'],
        )
    })

    it('gets the message', async () => {
        await emit('stuff', 'happened', '1234', {
            what: new Date(),
        })

        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            ['So it did'],
        )
    })

    it('carries the forwarded claim on to what the handler emits', async () => {
        const delivered = await emit('stuff', 'happened', '1234', { what: 'this' }, undefined, {
            onBehalfOf: { userId: 'user-1', org: 'org-1' },
        })

        assert.strictEqual(delivered, true)
        assert.deepStrictEqual(getEmitted(), [
            {
                topic: 'stuff',
                type: 'noted',
                subject: '1234',
                data: undefined,
                messageId: undefined,
            },
        ])
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'stuff',
                type: 'noted',
                subject: '1234',
                messageId: undefined,
                attributes: {},
                onBehalfOf: { userId: 'user-1', org: 'org-1' },
            },
        ])
    })

    it('carries no claim when the event brought none', async () => {
        const delivered = await emit('stuff', 'happened', '1234', { what: 'this' })

        assert.strictEqual(delivered, true)
        assert.deepStrictEqual(getEmittedEnvelopes(), [
            {
                topic: 'stuff',
                type: 'noted',
                subject: '1234',
                messageId: undefined,
                attributes: {},
                onBehalfOf: undefined,
            },
        ])
    })

    it('reports success for a type nobody handles', async () => {
        const delivered = await emit('stuff', 'ignored', '1234', { what: 'this' })

        assert.strictEqual(delivered, true)
        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info'),
            [],
        )
    })
})
