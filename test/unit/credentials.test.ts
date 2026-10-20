import { afterEach, describe, expect, it } from 'vitest'
import { resolveCredentials, toBasicAuth } from '../../src/core/credentials.js'

describe('toBasicAuth', () => {
  it('treats a bare string as a token', () => {
    expect(toBasicAuth('abc123')).toEqual({ username: 'token', password: 'abc123' })
  })

  it('accepts user/pass aliases', () => {
    expect(toBasicAuth({ user: 'token', pass: 'xyz' })).toEqual({
      username: 'token',
      password: 'xyz',
    })
  })

  it('accepts username/password', () => {
    expect(
      toBasicAuth({ username: 'you@example.com', password: 'hunter2' }),
    ).toEqual({ username: 'you@example.com', password: 'hunter2' })
  })

  it('prefers username over user', () => {
    expect(toBasicAuth({ user: 'a', username: 'b', pass: 'p' })).toEqual({
      username: 'b',
      password: 'p',
    })
  })

  it('never throws on missing fields', () => {
    expect(toBasicAuth({})).toEqual({ username: '', password: '' })
  })
})

describe('resolveCredentials', () => {
  const env = process.env['SURGE_TOKEN']

  afterEach(() => {
    if (env === undefined) delete process.env['SURGE_TOKEN']
    else process.env['SURGE_TOKEN'] = env
  })

  it('prefers the per-call override', () => {
    process.env['SURGE_TOKEN'] = 'env-token'
    expect(resolveCredentials('override', { token: 'client-token' })).toBe(
      'override',
    )
  })

  it('falls back to the client token', () => {
    delete process.env['SURGE_TOKEN']
    expect(resolveCredentials(undefined, { token: 'client-token' })).toBe(
      'client-token',
    )
  })

  it('falls back to client email+password', () => {
    delete process.env['SURGE_TOKEN']
    expect(
      resolveCredentials(undefined, { email: 'a@b.c', password: 'pw' }),
    ).toEqual({ username: 'a@b.c', password: 'pw' })
  })

  it('falls back to SURGE_TOKEN env', () => {
    process.env['SURGE_TOKEN'] = 'env-token'
    expect(resolveCredentials(undefined, undefined)).toBe('env-token')
  })

  it('returns null when nothing is configured', () => {
    delete process.env['SURGE_TOKEN']
    expect(resolveCredentials(undefined, undefined)).toBeNull()
  })
})
