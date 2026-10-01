import { filterAccepts } from '@movogo-io/host/attributes'
import { claim } from '@movogo-io/host/attribution'
import { handle } from '@movogo-io/host/event'
import { getHandlers } from '@movogo-io/host/registry'
import { type EventAttributes, type JsonSafeObject } from '../context.js'
import { createMockContext, getTestContext, jsonRoundtrip } from './setup.js'

export * from './context.js'

/**
Delivers an event to every registered handler of its topic and type whose filter, if any,
accepts the attributes, the way SNS would. Returns `true` when every handler that ran
succeeded, or when no handler is registered for the topic and type at all; `false` when
a handler failed, or when every handler of the topic and type was excluded by its filter
(which is logged once as a warning, since it is usually a test emitting the wrong attributes).
`extras.onBehalfOf` seeds the claim each handler sees on `context.attribution`, as a
forwarded SNS message would.
*/
export async function emit(
    topic: string,
    type: string,
    subject: string,
    data: JsonSafeObject | undefined,
    messageId?: string,
    extras?: {
        attributes?: EventAttributes
        onBehalfOf?: { userId: string; org?: string }
    },
): Promise<boolean> {
    const timestamp = getTestContext().now()
    const matchingTopic = getHandlers('event').filter(h => h.topic === topic && h.type === type)
    if (matchingTopic.length === 0) {
        return true
    }
    const matching = matchingTopic.filter(h => filterAccepts(h.config?.filter, extras?.attributes))
    if (matching.length === 0) {
        const { log, flush } = createMockContext({})
        log.warn('Every handler matching the event was excluded by its filter.', undefined, {
            topic,
            type,
            // A handler without a filter accepts everything, so every excluded one has a filter.
            filters: matchingTopic.map(h => h.config?.filter).filter(f => f !== undefined),
        })
        await flush()
        return false
    }
    const serialized = jsonRoundtrip(data)
    const result = await Promise.allSettled(
        matching.map(async handler => {
            const { log, context, success, flush } = createMockContext(
                {},
                handler.config,
                handler.meta,
                extras?.onBehalfOf && {
                    onBehalfOf: claim(extras.onBehalfOf.userId, extras.onBehalfOf.org),
                },
            )
            log.trace('Found handler', undefined, {
                handler: { topic, type },
            })
            const succeeded = await handle(
                log,
                context,
                handler,
                { subject, event: serialized, timestamp, messageId },
                success,
            )
            await flush()
            return succeeded
        }),
    )
    return result.every(r => r.status === 'fulfilled' && r.value)
}
