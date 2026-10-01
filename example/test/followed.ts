import { emit, getLoggedEntries } from '@movogo-io/service/test/event'
import assert from 'node:assert/strict'

describe('followed event', () => {
    it('runs for a resource the filter lists', async () => {
        const delivered = await emit(
            'document',
            'changed',
            'rental-1',
            { id: 'rental-1' },
            undefined,
            { attributes: { resource: 'rental', op: 'update' } },
        )

        assert.strictEqual(delivered, true)
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            ['followed'],
        )
        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'warning'),
            [],
        )
    })

    it('is excluded for a resource the filter does not list', async () => {
        const delivered = await emit(
            'document',
            'changed',
            'equipment-1',
            { id: 'equipment-1' },
            undefined,
            { attributes: { resource: 'equipment' } },
        )

        assert.strictEqual(delivered, false)
        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info'),
            [],
        )
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'warning')
                .map(e => e.message),
            ['Every handler matching the event was excluded by its filter.'],
        )
    })

    it('is excluded when the event carries no attributes', async () => {
        const delivered = await emit('document', 'changed', 'rental-1', { id: 'rental-1' })

        assert.strictEqual(delivered, false)
        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info'),
            [],
        )
        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'warning')
                .map(e => e.message),
            ['Every handler matching the event was excluded by its filter.'],
        )
    })

    it('reports success for a type nobody handles', async () => {
        const delivered = await emit(
            'document',
            'deleted',
            'rental-1',
            { id: 'rental-1' },
            undefined,
            { attributes: { resource: 'rental' } },
        )

        assert.strictEqual(delivered, true)
        assert.deepStrictEqual(
            getLoggedEntries().filter(e => e.level === 'info' || e.level === 'warning'),
            [],
        )
    })
})
