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

/**
 * Locales the documentation site is published in.
 */
export type DocsLocale = 'zh' | 'en'

/** Documentation site origin, used when the console has no `docs_link` set. */
export const DEFAULT_DOCS_BASE_URL = 'https://docs.luiai.cc.cd'

/**
 * Cookie shared with the documentation site.
 *
 * `localStorage` is isolated per origin, so the documentation site on a
 * subdomain cannot read it. A cookie scoped to the parent domain is shared
 * across subdomains, which lets the docs site inherit the console language.
 */
export const DOCS_LOCALE_COOKIE = 'lui_lang'

export function persistDocsLocale(language?: string | null): void {
  if (typeof document === 'undefined') return

  const host = window.location.hostname
  const domain = host.endsWith('luiai.cc.cd') ? '; domain=.luiai.cc.cd' : ''

  document.cookie = `${DOCS_LOCALE_COOKIE}=${docsLocale(language)}${domain}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Map an interface language onto a documentation locale.
 *
 * Chinese interfaces (simplified and traditional) read the Chinese docs,
 * every other interface language reads the English version.
 */
export function docsLocale(language?: string | null): DocsLocale {
  if (!language) return 'en'
  return language.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Build a documentation URL for the current interface language.
 *
 * The docs site is statically exported and serves every locale under its own
 * path prefix, so links have to carry the locale explicitly.
 *
 * @param baseUrl documentation site origin, e.g. `https://docs.luiai.cc.cd`
 * @param path page path below `/docs`, e.g. `quickstart`
 * @param language current interface language
 */
function normalizeDocsBase(baseUrl?: string | null): string {
  return (baseUrl?.trim() || DEFAULT_DOCS_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/docs$/, '')
}

export function buildDocsUrl(
  baseUrl?: string | null,
  path?: string,
  language?: string | null
): string {
  const base = normalizeDocsBase(baseUrl)
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : ''
  return `${base}/${docsLocale(language)}/docs${suffix}`
}
