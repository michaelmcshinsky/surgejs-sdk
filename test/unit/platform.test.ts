import { describe, expect, it } from 'vitest'
import {
  PROJECT_LIMITS,
  PUBLISH_RATE_LIMITS,
  SURGE_A_RECORD,
  SURGE_CNAME_TARGET,
  SURGE_DNS,
  SURGE_NAME_SERVERS,
  SURGE_NS_DOMAIN,
  isValidDomain,
  limitViolation,
  previewUrl,
} from '../../src/platform.js'

describe('platform constants', () => {
  it('matches the documented DNS setup', () => {
    expect(SURGE_NAME_SERVERS).toEqual([
      'ns1.surge.world',
      'ns2.surge.world',
      'ns3.surge.world',
      'ns4.surge.world',
    ])
    expect(SURGE_CNAME_TARGET).toBe('geo.surge.world')
    expect(SURGE_A_RECORD).toBe('138.197.235.123')
    expect(SURGE_NS_DOMAIN).toBe('surge.world')
    expect(SURGE_DNS.cname).toBe(SURGE_CNAME_TARGET)
  })

  it('matches the documented project limits', () => {
    expect(PROJECT_LIMITS.maxFiles).toBe(10_100)
    expect(PROJECT_LIMITS.maxBytes).toBe(450_000_000)
  })

  it('matches the documented rate limits', () => {
    expect(PUBLISH_RATE_LIMITS.perDomain).toBe(30)
    expect(PUBLISH_RATE_LIMITS.perAccount).toBe(60)
    expect(PUBLISH_RATE_LIMITS.perIp).toBe(240)
    expect(PUBLISH_RATE_LIMITS.windowMinutes).toBe(15)
  })
})

describe('limitViolation', () => {
  it('passes projects within the limits', () => {
    expect(limitViolation(10_100, PROJECT_LIMITS.maxBytes)).toBeNull()
    expect(limitViolation(1, 0)).toBeNull()
    expect(limitViolation(0, PROJECT_LIMITS.maxBytes)).toBeNull()
  })

  it('refuses too many files', () => {
    const v = limitViolation(10_101, 100)
    expect(v).toMatch(/10101 files/)
    expect(v).toMatch(/10100/)
  })

  it('refuses an oversized project', () => {
    const v = limitViolation(1, PROJECT_LIMITS.maxBytes + 1)
    expect(v).toMatch(/platform limit/)
    expect(v).toMatch(/450 MB/)
  })
})

describe('previewUrl', () => {
  it('builds <rev>-<domain>', () => {
    expect(previewUrl('1719852000000', 'my-site.surge.sh')).toBe(
      '1719852000000-my-site.surge.sh',
    )
    expect(previewUrl(42, 'example.com')).toBe('42-example.com')
  })
})

describe('isValidDomain', () => {
  it('accepts normal domains', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('my-site.surge.sh')).toBe(true)
    expect(isValidDomain('a.b.c.example.co.uk')).toBe(true)
    expect(isValidDomain('sub.example.com')).toBe(true)
  })

  it('rejects junk', () => {
    expect(isValidDomain('')).toBe(false)
    expect(isValidDomain('nodots')).toBe(false)
    expect(isValidDomain('has space.com')).toBe(false)
    expect(isValidDomain('-leading.example.com')).toBe(false)
    expect(isValidDomain('trailing-.example.com')).toBe(false)
    expect(isValidDomain('example.com.')).toBe(false)
    expect(isValidDomain('me@example.com')).toBe(false)
    expect(isValidDomain(`x.${'a'.repeat(64)}.com`)).toBe(false)
  })
})
