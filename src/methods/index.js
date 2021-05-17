const nodeFetch = require('node-fetch')
// Webpack will sometimes export default exports in different places
const fetch = nodeFetch.default || nodeFetch

const { getOperations } = require('../operations')

const { addBody } = require('./body')
const { parseResponse, getFetchError } = require('./response')
const { shouldRetry, waitForRetry, MAX_RETRY } = require('./retry')
const { getUrl } = require('./url')

// For each OpenAPI operation, add a corresponding method.
// The `operationId` is the method name.
const getMethods = function ({ basePath, defaultHeaders, agent, globalParams }) {
  const operations = getOperations()
  const methods = operations.map((method) => getMethod({ method, basePath, defaultHeaders, agent, globalParams }))
  return Object.assign({}, ...methods)
}

const getMethod = function ({ method, basePath, defaultHeaders, agent, globalParams }) {
  return {
    [method.operationId](params, opts) {
      return callMethod({ method, basePath, defaultHeaders, agent, globalParams, params, opts })
    },
  }
}

const callMethod = async function ({ method, basePath, defaultHeaders, agent, globalParams, params, opts }) {
  const requestParams = { ...globalParams, ...params }
  const url = getUrl(method, basePath, requestParams)
  const response = await makeRequestOrRetry({ url, method, defaultHeaders, agent, requestParams, opts })

  const parsedResponse = await parseResponse(response)
  return parsedResponse
}

const getOpts = function ({ method: { verb, parameters }, defaultHeaders, agent, requestParams: { body }, opts }) {
  const optsA = addHttpMethod(verb, opts)
  const optsB = addDefaultHeaders(defaultHeaders, optsA)
  const optsC = addBody(body, parameters, optsB)
  const optsD = addAgent(agent, optsC)
  return optsD
}

// Add the HTTP method based on the OpenAPI definition
const addHttpMethod = function (verb, opts) {
  return { ...opts, method: verb.toUpperCase() }
}

// Assign default HTTP headers
const addDefaultHeaders = function (defaultHeaders, opts) {
  return { ...opts, headers: { ...defaultHeaders, ...opts.headers } }
}

// Assign fetch agent (like for example HttpsProxyAgent) if there is one
const addAgent = function (agent, opts) {
  if (agent) {
    return { ...opts, agent }
  }
  return opts
}

const makeRequestOrRetry = async function ({ url, method, defaultHeaders, agent, requestParams, opts }) {
  // Using a loop is simpler here
  // eslint-disable-next-line fp/no-loops
  for (let index = 0; index <= MAX_RETRY; index++) {
    const optsA = getOpts({ method, defaultHeaders, agent, requestParams, opts })
    // eslint-disable-next-line no-await-in-loop
    const { response, error } = await makeRequest(url, optsA)

    if (shouldRetry({ response, error }) && index !== MAX_RETRY) {
      // eslint-disable-next-line no-await-in-loop
      await waitForRetry(response)
      continue
    }

    if (error !== undefined) {
      throw error
    }

    return response
  }
}

const makeRequest = async function (url, opts) {
  try {
    const response = await fetch(url, opts)
    return { response }
  } catch (error) {
    const errorA = getFetchError(error, url, opts)
    return { error: errorA }
  }
}

module.exports = { getMethods }
