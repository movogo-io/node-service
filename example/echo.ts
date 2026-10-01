import { objectSpreadable, post } from '@movogo-io/service/http'

post('echo/*', (_, request) => {
    const { now } = objectSpreadable(request.body)
    return {
        headers: {
            'x-in-response-to': request.url.href,
            ...(typeof now === 'string' && { time: new Date(now).getTime().toString() }),
        },
        body: request.body,
    }
})
