import { getHandlers } from '@movogo-io/host/registry'
import { triggerTimer } from '@movogo-io/host/timer'
import { CronTime } from 'cron'
import { createMockContext } from './setup.js'

export * from './context.js'

export async function clockStrikes(time: Date): Promise<void> {
    const matching = getHandlers('timer')
        .map(withCron)
        // spell-checker: ignore millis
        .filter(
            h =>
                h[cron].getNextDateFrom(new Date(time.getTime() - 1)).toMillis() === time.getTime(),
        )
    await Promise.allSettled(
        matching.map(async handler => {
            const { log, context, success, flush } = createMockContext(
                {},
                handler.config,
                handler.meta,
            )
            log.trace('Found handler', undefined, {
                handler: {
                    schedule: handler.schedule,
                },
            })
            await triggerTimer(log, context, handler, { triggerTime: time }, success)
            await flush()
        }),
    )
}

const cron = Symbol()

function withCron<T extends { schedule: string; [cron]?: CronTime }>(
    handler: T,
): T & { [cron]: CronTime } {
    if (Object.hasOwn(handler, cron)) {
        return handler as T & { [cron]: CronTime }
    }
    handler[cron] = new CronTime(handler.schedule)
    return handler as T & { [cron]: CronTime }
}
