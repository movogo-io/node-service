import {
    acceptForwardedAttribution,
    forbidden,
    get,
    httpRequestHeaders,
} from '@movogo-io/service/http'

get('forwarded', async (context, request) => {
    if (request.headers['api-key'] !== context.env.KEY) {
        throw forbidden()
    }
    acceptForwardedAttribution(context, request)
    await context.emit('forwarded', 'seen', 'x')
    // Only the attribution headers: the rest of httpRequestHeaders carries the minted request id.
    return {
        body: Object.fromEntries(
            Object.entries(httpRequestHeaders(context)).filter(([name]) =>
                name.startsWith('x-on-behalf-of-'),
            ),
        ),
    }
})
