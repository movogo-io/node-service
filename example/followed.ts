import { on } from '@movogo-io/service/event'

on('document', 'changed', { filter: { resource: ['rental', 'invoice'] } }, (context, subject) => {
    context.log.info('followed', undefined, { subject })
})
