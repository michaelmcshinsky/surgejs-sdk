import { describe, expect, it } from 'vitest'
import {
  SurgeHttpError,
  SurgeNetworkError,
  errorFromResponse,
  networkError,
} from '../../src/core/errors.js'

describe('errorFromResponse edges', () => {
  it('accepts a plain-string error body', () => {
    const err = errorFromResponse(500, 'upstream exploded')
    expect(err.messages).toEqual(['upstream exploded'])
    expect(err).toBeInstanceOf(SurgeHttpError)
  })

  it('trims a string body', () => {
    const err = errorFromResponse(502, '  bad gateway \n')
    expect(err.messages).toEqual(['bad gateway'])
  })

  it('ignores a non-string, non-object body shape', () => {
    const err = errorFromResponse(500, 42)
    expect(err.messages).toEqual(['request failed (500)'])
  })

  it('ignores a non-string array in messages', () => {
    const err = errorFromResponse(400, { messages: [1, 2], details: { a: 1 } })
    expect(err.messages).toEqual(['request failed (400)'])
    expect(err.details).toEqual({ a: 1 })
  })

  it('maps 405 to the base HTTP error', () => {
    const err = errorFromResponse(405, { message: 'Method Not Allowed' })
    expect(err).toBeInstanceOf(SurgeHttpError)
    expect(err.status).toBe(405)
  })

  it('prefers messages over a single message', () => {
    const err = errorFromResponse(400, {
      messages: ['first'],
      message: 'second',
    })
    expect(err.messages).toEqual(['first'])
  })
})

describe('networkError', () => {
  it('surfaces a code carried on the error itself', () => {
    const err = networkError(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    )
    expect(err).toBeInstanceOf(SurgeNetworkError)
    expect(err.message).toContain('ENOTFOUND')
    expect(err.cause).toBeTruthy()
  })

  it('handles a non-Error rejection value', () => {
    const err = networkError('weird string failure')
    expect(err.message).toBe('weird string failure')
  })

  it('handles null/undefined', () => {
    expect(networkError(null).message).toBe('unknown error')
    expect(networkError(undefined).message).toBe('unknown error')
  })

  it('omits a code segment when the error has none', () => {
    const err = networkError(new Error('plain'))
    expect(err.message).toBe('plain')
  })

  it('keeps a nested cause reachable via .cause', () => {
    const nested = Object.assign(new Error('inner'), { code: 'ECONNRESET' })
    const err = networkError(Object.assign(new Error('fetch failed'), { cause: nested }))
    expect(err.message).toBe('fetch failed')
    expect((err.cause as { cause?: { code?: string } }).cause?.code).toBe(
      'ECONNRESET',
    )
  })
})
