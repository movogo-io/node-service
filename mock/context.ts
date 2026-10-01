import { LogEntry } from '@movogo-io/host/context'
import { Environment, Json } from '../context.js'
import { getTestContext, type Envelope } from './setup.js'

export function getLoggedEntries(): LogEntry[] {
    return getTestContext().log.getEntries()
}

export function clearLoggedEntries() {
    getTestContext().log.clear()
}

export function getEmitted(): {
    topic: string
    type: string
    subject: string
    data?: Json
    messageId?: string
}[] {
    return [...getTestContext().emitted]
}

/**
What each emit put on the wire beside the event: the emitter's attributes (`{}` when none)
and the claim the context carried, or undefined. `getEmitted()` is unchanged.
*/
export function getEmittedEnvelopes(): Envelope[] {
    return [...getTestContext().envelopes]
}

export function clearEmitted() {
    const ctx = getTestContext()
    ctx.emitted = []
    ctx.envelopes = []
}

export function allowErrorLogs() {
    const l = getTestContext().log
    l.failOnErrorLogs = false
    return {
        [Symbol.dispose]: () => {
            l.failOnErrorLogs = true
        },
    }
}

export function timeShift(seconds: number) {
    getTestContext().timeShift += seconds
}

export function timeShiftTo(when: Date) {
    getTestContext().timeShift = 0
    timeShift((when.getTime() - Date.now()) / 1000)
}

export function freezeTime(when: Date) {
    getTestContext().frozenTime = when.getTime()
}

export function unfreezeTime() {
    getTestContext().frozenTime = undefined
}

export function getEnvironment() {
    return { ...getTestContext().env }
}

export function setEnvironment(env: Partial<Environment>) {
    Object.assign(getTestContext().env, env)
}
