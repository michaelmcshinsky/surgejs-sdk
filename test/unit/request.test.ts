import { describe, expect, it } from 'vitest'
import { basicAuthHeader, headerSafe, joinUrl } from '../../src/core/request.js'

describe('headerSafe', () => {
  it('keeps ordinary printable text', () => {
    expect(headerSafe('hello world')).toBe('hello world')
    expect(headerSafe('tab\there')).toBe('tab\there')
  })

  it('strips emoji and other non-latin1 characters', () => {
    expect(headerSafe('deploy 🚀 now')).toBe('deploy  now')
    expect(headerSafe('—dash')).toBe('dash')
  })

  it('keeps the latin-1 supplement', () => {
    expect(headerSafe('café')).toBe('café')
  })

  it('stringifies non-strings', () => {
    expect(headerSafe(42)).toBe('42')
    expect(headerSafe(true)).toBe('true')
  })
})

describe('basicAuthHeader', () => {
  it('encodes token credentials', () => {
    expect(basicAuthHeader({ username: 'token', password: 'abc' })).toBe(
      `Basic ${Buffer.from('token:abc').toString('base64')}`,
    )
  })

  it('encodes non-ASCII passwords as UTF-8', () => {
    const expected = `Basic ${Buffer.from('user:pässwörd', 'utf8').toString('base64')}`
    expect(basicAuthHeader({ username: 'user', password: 'pässwörd' })).toBe(expected)
  })
})

describe('joinUrl', () => {
  it('joins with exactly one slash', () => {
    expect(joinUrl('https://a.b', '/path')).toBe('https://a.b/path')
    expect(joinUrl('https://a.b/', '/path')).toBe('https://a.b/path')
    expect(joinUrl('https://a.b//', 'path')).toBe('https://a.b/path')
    expect(joinUrl('https://a.b/', 'path')).toBe('https://a.b/path')
    expect(joinUrl('https://a.b', 'path')).toBe('https://a.b/path')
  })

  it('passes absolute URLs through', () => {
    expect(joinUrl('https://a.b', 'https://c.d/x')).toBe('https://c.d/x')
  })

  it('keeps endpoint path segments (unlike URL.resolve)', () => {
    expect(joinUrl('https://a.b/api', '/v1')).toBe('https://a.b/api/v1')
  })
})
