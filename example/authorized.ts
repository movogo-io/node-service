import { badRequest, forbidden, get, getBearer, objectSpreadable } from '@movogo-io/service/http'

get('authorized', async (context, request) => {
    const { sub } = objectSpreadable(await getBearer(context, request))
    if (sub !== '🤫') {
        throw forbidden()
    }
    await context.emit('authorized', 'seen', sub, undefined)
    const query = request.url.searchParams.get('q')
    if (query === null) {
        throw badRequest('None query provided.')
    }
    return {
        body: {
            items: [],
        },
    }
})
