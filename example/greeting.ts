import { get } from '@movogo-io/service/http'

get('greeting/*', async (context, request) => {
    context.log.info('here')
    const who = request.url.searchParams.get('who') ?? 'World'
    if (request.url.searchParams.get('bad') === '1') {
        // A reserved attribute name: the host refuses it before anything reaches the transport.
        await context.emit('greeting', 'sent', 'anonymous', { message: 'hello', who }, undefined, {
            operationId: 'x',
        })
    }
    // Attributes are what consumers filter on: a fixed, enumerable value, never free text such
    // as `who`, which stays in the event data.
    await context.emit('greeting', 'sent', 'anonymous', { message: 'hello', who }, undefined, {
        lang: 'en',
    })
    return {
        body: {
            now: context.now(),
            step: request.url.pathStepAt(1),
            message: `Hello, ${who}!`,
        },
    }
})
