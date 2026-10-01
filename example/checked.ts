import { badRequest, forbidden, get, unauthorized } from '@movogo-io/service/http'

get('check', (context, request) => {
    const key = request.url.searchParams.get('key')
    if (key === null) {
        throw unauthorized()
    }
    if (key !== context.env.KEY) {
        throw forbidden()
    }
    const query = request.url.searchParams.get('q')
    if (query === null) {
        throw badRequest('No query provided.')
    }
    return {
        body: {
            items: [],
        },
    }
})
