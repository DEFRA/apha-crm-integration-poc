import Boom from '@hapi/boom'

import { config } from '../../config.js'

const SALESFORCE_API_VERSION = 'v58.0'

function getSalesforceConfig() {
  const baseUrl = config.get('salesforce.baseUrl')
  const clientId = config.get('salesforce.clientId')
  const clientSecret = config.get('salesforce.clientSecret')

  if (!baseUrl || !clientId || !clientSecret) {
    throw Boom.badImplementation(
      'Salesforce configuration is incomplete. Ensure base URL, client id and secret are set.'
    )
  }

  return { baseUrl, clientId, clientSecret }
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    throw Boom.badGateway('Salesforce responded with invalid JSON', {
      cause: error
    })
  }
}

async function getAccessToken() {
  const { baseUrl, clientId, clientSecret } = getSalesforceConfig()

  const tokenUrl = new URL('/services/oauth2/token', baseUrl)
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw Boom.badGateway('Failed to obtain Salesforce access token', {
      data: payload ?? undefined,
      status: response.status
    })
  }

  return payload
}

async function createCustomer(customerPayload, accessToken) {
  const { baseUrl } = getSalesforceConfig()

  if (!accessToken) {
    throw Boom.badImplementation('Missing Salesforce access token')
  }

  if (!customerPayload?.lastName) {
    throw Boom.badRequest(
      'lastName is required to create a Salesforce customer'
    )
  }

  const url = new URL(
    `/services/data/${SALESFORCE_API_VERSION}/sobjects/Contact`,
    baseUrl
  )

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      LastName: customerPayload.lastName
    })
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw Boom.badGateway('Failed to create Salesforce customer', {
      data: payload ?? undefined,
      status: response.status
    })
  }

  return {
    body: payload,
    status: response.status
  }
}

export { createCustomer, getAccessToken }
