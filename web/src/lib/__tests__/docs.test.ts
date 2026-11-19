/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { buildDocsUrl, docsLocale } from '../docs'

describe('docsLocale', () => {
  it('maps Chinese interface languages to the Chinese documentation', () => {
    expect(docsLocale('zhCN')).toBe('zh')
    expect(docsLocale('zhTW')).toBe('zh')
    expect(docsLocale('zh-CN')).toBe('zh')
  })

  it('maps every other interface language to the English documentation', () => {
    expect(docsLocale('en')).toBe('en')
    expect(docsLocale('fr')).toBe('en')
    expect(docsLocale('ru')).toBe('en')
    expect(docsLocale('ja')).toBe('en')
    expect(docsLocale('vi')).toBe('en')
  })

  it('falls back to English when no language is known', () => {
    expect(docsLocale()).toBe('en')
    expect(docsLocale('')).toBe('en')
  })
})

describe('buildDocsUrl', () => {
  it('places the locale between the site root and the page path', () => {
    expect(buildDocsUrl('https://docs.luiai.cc.cd', 'quickstart', 'zhCN')).toBe(
      'https://docs.luiai.cc.cd/zh/docs/quickstart'
    )
    expect(buildDocsUrl('https://docs.luiai.cc.cd', 'quickstart', 'fr')).toBe(
      'https://docs.luiai.cc.cd/en/docs/quickstart'
    )
  })

  it('accepts a configured base that already ends with /docs', () => {
    expect(buildDocsUrl('https://docs.luiai.cc.cd/docs', 'api', 'en')).toBe(
      'https://docs.luiai.cc.cd/en/docs/api'
    )
  })

  it('falls back to the default site and the documentation index', () => {
    expect(buildDocsUrl(undefined, undefined, 'zhCN')).toBe(
      'https://docs.luiai.cc.cd/zh/docs'
    )
  })
})
