import { customer } from '../routes/customer.js'
import { customerV2 } from '../routes/customer-v2.js'
import { health } from '../routes/health.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, customer, customerV2])
    }
  }
}

export { router }
