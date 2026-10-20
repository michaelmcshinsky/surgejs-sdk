import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readCname, writeCname } from '../../src/cname.js'
import { TempProject } from '../helpers/temp-project.js'

describe('readCname', () => {
  it('reads the CNAME file', () => {
    const dir = new TempProject().file('CNAME', 'example.com\n')
    try {
      expect(readCname(dir.path)).toEqual({
        domain: 'example.com',
        source: 'cname',
      })
    } finally {
      dir.cleanup()
    }
  })

  it('CNAME wins over package.json', () => {
    const dir = new TempProject()
      .file('CNAME', 'from-cname.example.com')
      .file(
        'package.json',
        JSON.stringify({ surge: { domain: 'from-pkg.example.com' } }),
      )
    try {
      expect(readCname(dir.path)).toEqual({
        domain: 'from-cname.example.com',
        source: 'cname',
      })
    } finally {
      dir.cleanup()
    }
  })

  it('falls back to package.json surge.domain', () => {
    const dir = new TempProject().file(
      'package.json',
      JSON.stringify({ name: 'x', surge: { domain: 'pkg.example.com' } }),
    )
    try {
      expect(readCname(dir.path)).toEqual({
        domain: 'pkg.example.com',
        source: 'package.json',
      })
    } finally {
      dir.cleanup()
    }
  })

  it('returns null when nothing declares a domain', () => {
    const dir = new TempProject().file('index.html', 'x')
    try {
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('ignores an invalid CNAME value', () => {
    const dir = new TempProject().file('CNAME', 'not a domain')
    try {
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('treats an empty CNAME as absent', () => {
    const dir = new TempProject().file('CNAME', '\n\n')
    try {
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('reads only the first line (CRLF-safe)', () => {
    const dir = new TempProject().file('CNAME', 'example.com\r\nextra\r\n')
    try {
      expect(readCname(dir.path)?.domain).toBe('example.com')
    } finally {
      dir.cleanup()
    }
  })
})

describe('writeCname', () => {
  it('writes the domain with a trailing newline', () => {
    const dir = new TempProject().file('index.html', 'x')
    try {
      expect(writeCname(dir.path, 'example.com')).toBe(true)
      expect(readFileSync(join(dir.path, 'CNAME'), 'utf8')).toBe('example.com\n')
    } finally {
      dir.cleanup()
    }
  })

  it('never overwrites an existing CNAME (CLI parity)', () => {
    const dir = new TempProject().file('CNAME', 'kept.example.com\n')
    try {
      expect(writeCname(dir.path, 'other.example.com')).toBe(false)
      expect(readFileSync(join(dir.path, 'CNAME'), 'utf8')).toBe(
        'kept.example.com\n',
      )
    } finally {
      dir.cleanup()
    }
  })

  it('refuses an invalid domain', () => {
    const dir = new TempProject()
    try {
      expect(() => writeCname(dir.path, 'not a domain')).toThrow(TypeError)
    } finally {
      dir.cleanup()
    }
  })

  it('round-trips with readCname', () => {
    const dir = new TempProject().file('index.html', 'x')
    try {
      writeCname(dir.path, 'roundtrip.example.com')
      expect(readCname(dir.path)).toEqual({
        domain: 'roundtrip.example.com',
        source: 'cname',
      })
    } finally {
      dir.cleanup()
    }
  })

  it('reads a CNAME written with platform line endings', () => {
    const dir = new TempProject()
    try {
      writeFileSync(join(dir.path, 'CNAME'), 'windows.example.com\n')
      expect(readCname(dir.path)?.domain).toBe('windows.example.com')
    } finally {
      dir.cleanup()
    }
  })
})
