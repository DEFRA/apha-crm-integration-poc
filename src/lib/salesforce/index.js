import Boom from '@hapi/boom'

import { CometD } from 'cometd'
import { adapt } from 'cometd-nodejs-client'

import { config } from '../../config.js'

const SALESFORCE_API_VERSION = 'v58.0'

let isAdapted = false
let startPromise
let cometdClient

function ensureAdapted() {
  if (!isAdapted) {
    adapt()
    isAdapted = true
  }
}

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

function getListenerConfig() {
  const enabled = config.get('salesforce.listenerEnabled')
  const channel = config.get('salesforce.streamingChannel')
  const apiVersion = config.get('salesforce.apiVersion')

  return { enabled, channel, apiVersion }
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

async function startSalesforceListener(logger = console) {
  const { enabled, channel, apiVersion } = getListenerConfig()

  if (!enabled) {
    return null
  }

  if (!channel) {
    logger.warn(
      'Salesforce listener is enabled but no channel is configured; skipping subscription'
    )
    return null
  }

  if (cometdClient) {
    return cometdClient
  }

  if (startPromise) {
    return startPromise
  }

  startPromise = (async () => {
    const tokens = await getAccessToken()

    if (!tokens?.access_token || !tokens?.instance_url) {
      throw Boom.badImplementation(
        'Salesforce access token response missing access_token or instance_url'
      )
    }

    ensureAdapted()

    const cometd = new CometD()
    cometdClient = cometd

    const version = apiVersion?.replace(/^\//, '') ?? 'v61.0'
    const normalizedVersion = version.startsWith('v') ? version : `v${version}`
    const url = `${tokens.instance_url}/cometd/${normalizedVersion}/`

    cometd.configure({
      url,
      requestHeaders: { Authorization: `Bearer ${tokens.access_token}` },
      appendMessageTypeToURL: false
    })

    // Salesforce requires long-polling transport
    cometd.unregisterTransport('websocket')

    const handshakeReply = await new Promise((resolve, reject) => {
      cometd.handshake((reply) => {
        if (reply?.successful) {
          resolve(reply)
          return
        }

        const error = Boom.badGateway('Salesforce CometD handshake failed', {
          data: reply
        })
        reject(error)
      })
    })

    logger.info(
      {
        handshake: handshakeReply,
        channel
      },
      'Salesforce listener connected'
    )

    cometd.addListener('/meta/disconnect', (message) => {
      logger.warn({ message }, 'Salesforce listener disconnected')
    })

    cometd.addListener('/meta/connect', (message) => {
      if (!message.successful) {
        logger.error({ message }, 'Salesforce listener connect error')
      }
    })

    cometd.onListenerException = (exception, subscriptionHandle, message) => {
      logger.error(
        {
          err: exception,
          subscriptionHandle,
          message
        },
        'Salesforce listener exception'
      )
    }

    cometd.subscribe(channel, (message) => {
      console.log(
        'Event received and processed:',
        JSON.stringify(message, null, 2)
      )
    })

    return cometd
  })()

  try {
    await startPromise
  } catch (error) {
    startPromise = null
    cometdClient = null
    throw error
  }

  return cometdClient
}

export { createCustomer, getAccessToken, startSalesforceListener }
