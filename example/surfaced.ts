import { get, getBearer, objectSpreadable } from '@movogo-io/service/http'

get('surfaced', async (context, request) => {
    // Only @movogo-io/contract names a key like this; a handler of a service never does.
    const { sub } = objectSpreadable(
        await getBearer(context, request, { publicKeyVariable: 'BEARER_PUBLIC_KEY_MCP' }),
    )
    await context.emit('surfaced', 'seen', 'x')
    return {
        body: { sub },
    }
})
