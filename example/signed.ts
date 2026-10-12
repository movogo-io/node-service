import { forbidden, post } from '@movogo-io/service/http'
import { createHmac, timingSafeEqual } from 'node:crypto'

post('signed', { rawBody: true }, (context, request) => {
    if (typeof request.body !== 'string') {
        throw forbidden()
    }
    const expected = createHmac('sha256', context.env.KEY ?? '')
        .update(request.body)
        .digest()
    const actual = Buffer.from(request.headers['x-signature'] ?? '', 'hex')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw forbidden()
    }
    return { body: { received: request.body } }
})
