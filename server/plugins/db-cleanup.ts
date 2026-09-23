export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event) => {
    const pg = event.context.scoutPg
    if (pg) event.waitUntil(pg.end({ timeout: 5 }))
  })
})
