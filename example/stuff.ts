import { objectSpreadable, on } from '@movogo-io/service/event'

on('stuff', 'happened', async (context, subject, event) => {
    const { what } = objectSpreadable(event)
    if (typeof what !== 'string') {
        throw new TypeError('Unexpected event data.')
    }
    if (subject.length < 4) {
        throw new Error('Unsupported subject')
    }
    context.log.info('So it did')
    // What this handler emits carries on the attribution the event arrived with.
    await context.emit('stuff', 'noted', subject)
})
