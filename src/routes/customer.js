import Joi from 'joi'

import { createCustomer, getAccessToken } from '../lib/salesforce/index.js'

const customer = {
  method: 'POST',
  path: '/customer',
  options: {
    validate: {
      payload: Joi.object({
        lastName: Joi.string().trim().required()
      })
    }
  },
  handler: async (request, h) => {
    const { payload } = request
    const { access_token: accessToken } = await getAccessToken()

    const result = await createCustomer(payload, accessToken)

    return h.response(result.body).code(result.status)
  }
}

export { customer }
