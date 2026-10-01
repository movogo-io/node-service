import { clockStrikes, getLoggedEntries } from '@movogo-io/service/test/timer'
import assert from 'node:assert/strict'

describe('tick-tock', () => {
    it('should tick', async () => {
        await clockStrikes(new Date(2024, 12, 12, 20, 0))

        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            ['Tick'],
        )
    })

    it('should tock', async () => {
        await clockStrikes(new Date(2024, 12, 12, 21, 0))

        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            ['Tock'],
        )
    })

    it('should be quite', async () => {
        await clockStrikes(new Date(2024, 12, 12, 21, 1))

        assert.deepStrictEqual(
            getLoggedEntries()
                .filter(e => e.level === 'info')
                .map(e => e.message),
            [],
        )
    })
})
