import Joi from 'joi'

const customerV2 = {
  method: 'POST',
  path: '/customerv2',
  options: {
    validate: {
      payload: Joi.object({
        message: Joi.string().trim().required()
      })
    }
  },
  handler: (_request, h) => h.response({ message: 'Hi' })
}

export { customerV2 }
