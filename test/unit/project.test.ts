import { describe, expect, it } from 'vitest'
import {
  createIgnorer,
  htmlReferences,
  singleFile,
  DEFAULT_IGNORES,
} from '../../src/stream/project.js'

describe('singleFile', () => {
  it('publishes an html file at the root as index.html', () => {
    expect(singleFile('page.html')).toEqual({ as: 'index.html' })
    expect(singleFile('page.HTM')).toEqual({ as: 'index.html' })
  })

  it('refuses non-HTML single files', () => {
    const result = singleFile('site.zip')
    expect('refused' in result).toBe(true)
    if ('refused' in result) {
      expect(result.refused).toContain('site.zip')
      expect(result.refused).toContain('folder')
    }
  })
})

describe('createIgnorer', () => {
  it('applies the Surge defaults', () => {
    const ig = createIgnorer()
    expect(ig.ignores('.git')).toBe(true)
    expect(ig.ignores('.git/config')).toBe(true)
    expect(ig.ignores('.env')).toBe(true)
    expect(ig.ignores('node_modules')).toBe(true)
    expect(ig.ignores('bower_components')).toBe(true)
    expect(ig.ignores('index.html')).toBe(false)
    expect(ig.ignores('assets/app.js')).toBe(false)
  })

  it('layers .surgeignore on top of the defaults', () => {
    const ig = createIgnorer('dist/\n*.map\n')
    // directory patterns match the directory path (with trailing slash),
    // which is how the scanner queries them
    expect(ig.ignores('dist/')).toBe(true)
    expect(ig.ignores('app.js.map')).toBe(true)
    expect(ig.ignores('.git')).toBe(true)
    expect(ig.ignores('index.html')).toBe(false)
  })

  it('exposes the default rule set', () => {
    expect(DEFAULT_IGNORES).toContain('.git')
    expect(DEFAULT_IGNORES).toContain('node_modules')
  })
})

describe('htmlReferences', () => {
  it('collects relative src/href paths', () => {
    const html = `
      <link href="/assets/app.css" rel="stylesheet">
      <script src="js/main.js"></script>
      <img src='img/logo.png'>
      <a href="about.html">About</a>
    `
    expect(htmlReferences(html)).toEqual([
      'assets/app.css',
      'js/main.js',
      'img/logo.png',
      'about.html',
    ])
  })

  it('skips absolute URLs, protocol-relative, query, and fragments', () => {
    const html = `
      <script src="https://cdn.example.com/x.js"></script>
      <script src="//cdn.example.com/y.js"></script>
      <a href="https://example.com">x</a>
      <a href="#top">top</a>
      <a href="/page?q=1#frag">q</a>
    `
    // /page?q=1#frag → "page" (query/fragment stripped, leading slash dropped)
    expect(htmlReferences(html)).toEqual(['page'])
  })

  it('deduplicates and caps at 200', () => {
    const parts: string[] = []
    for (let i = 0; i < 250; i++) parts.push(`<img src="img/${i}.png">`)
    const refs = htmlReferences(parts.join('\n'))
    expect(refs.length).toBe(200)
    const dup = htmlReferences('<img src="a.png"><img src="a.png">')
    expect(dup).toEqual(['a.png'])
  })

  it('decodes percent-encoding', () => {
    expect(htmlReferences('<img src="img/my%20logo.png">')).toEqual([
      'img/my logo.png',
    ])
  })
})
