import { describe, expect, it } from 'vitest'
import {
  SurgeAuthError,
  SurgeConflictError,
  SurgeError,
  SurgeHttpError,
  SurgeNetworkError,
  SurgeNotFoundError,
  SurgePermissionError,
  SurgeRateLimitError,
  SurgeValidationError,
  describeStatus,
  errorFromResponse,
} from '../../src/core/errors.js'

describe('errorFromResponse', () => {
  it('maps status codes to typed errors', () => {
    expect(errorFromResponse(401, {})).toBeInstanceOf(SurgeAuthError)
    expect(errorFromResponse(403, {})).toBeInstanceOf(SurgePermissionError)
    expect(errorFromResponse(404, {})).toBeInstanceOf(SurgeNotFoundError)
    expect(errorFromResponse(409, {})).toBeInstanceOf(SurgeConflictError)
    expect(errorFromResponse(400, {})).toBeInstanceOf(SurgeValidationError)
    expect(errorFromResponse(422, {})).toBeInstanceOf(SurgeValidationError)
    expect(errorFromResponse(429, {})).toBeInstanceOf(SurgeRateLimitError)
    expect(errorFromResponse(500, {})).toBeInstanceOf(SurgeHttpError)
  })

  it('reads the messages/details shape', () => {
    const err = errorFromResponse(422, {
      messages: ['domain must be valid.'],
      details: { domain: 'must be valid.' },
    })
    expect(err.messages).toEqual(['domain must be valid.'])
    expect(err.details).toEqual({ domain: 'must be valid.' })
    expect(err.status).toBe(422)
    expect(err.message).toBe('domain must be valid.')
  })

  it('falls back to a single message', () => {
    const err = errorFromResponse(404, { message: 'Not Found' })
    expect(err.messages).toEqual(['Not Found'])
  })

  it('falls back to the errors array', () => {
    const err = errorFromResponse(403, { errors: ['nope'] })
    expect(err.messages).toEqual(['nope'])
  })

  it('uses the reason header when the body is empty', () => {
    const err = errorFromResponse(403, '', { reason: 'Rate limited' })
    expect(err.messages).toEqual(['Rate limited'])
    expect(err).toBeInstanceOf(SurgePermissionError)
  })

  it('describes a bodyless failure instead of reading as success', () => {
    const err = errorFromResponse(500, '')
    expect(err.messages).toEqual(['request failed (500)'])
    expect(err.status).toBe(500)
  })

  it('describes redirects distinctly', () => {
    expect(describeStatus(301)).toBe('endpoint redirected (301)')
    expect(describeStatus(502)).toBe('request failed (502)')
  })

  it('keeps headers on the error', () => {
    const err = errorFromResponse(429, null, { 'retry-after': '900' })
    expect(err.headers).toEqual({ 'retry-after': '900' })
  })
})

describe('SurgeError', () => {
  it('is an Error with a cause', () => {
    const cause = new Error('socket hang up')
    const err = new SurgeNetworkError('fetch failed', { cause })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SurgeError)
    expect(err.cause).toBe(cause)
  })
})
