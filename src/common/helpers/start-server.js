import { config } from '../../config.js'

import { createServer } from '../../server.js'
import { startSalesforceListener } from '../../lib/salesforce/index.js'

async function startServer() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  startSalesforceListener(server.logger).catch((error) => {
    server.logger.error({ err: error }, 'Failed to start Salesforce listener')
  })

  return server
}

export { startServer }
