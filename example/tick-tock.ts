import { setInterval } from '@movogo-io/service/timer'

setInterval('0 */1 * * *', async (context, { triggerTime }) => {
    await context.emit('clock', 'struck', 'clock')
    if (triggerTime.getHours() % 2) {
        context.log.info('Tock')
    } else {
        context.log.info('Tick')
    }
})
