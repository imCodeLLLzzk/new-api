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
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  BRAND,
  HERO_BADGE,
  HERO_BASE_URL_HINT,
  HERO_BASE_URL_LABEL,
  HERO_CLIENTS_LABEL,
  HERO_DESCRIPTION,
  HERO_DOCS_CTA,
  HERO_DASHBOARD_CTA,
  HERO_PRIMARY_CTA,
  HERO_SECONDARY_CTA,
  HERO_TITLE_ACCENT,
  HERO_TITLE_LEAD,
  HOME_CLIENTS,
} from '../../constants'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl = (status?.docs_link as string | undefined) || BRAND.site

  const renderDocsButton = () => {
    const isExternal = docsUrl.startsWith('http')
    if (isExternal) {
      return (
        <Button
          variant='outline'
          className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
          <span>{t(HERO_DOCS_CTA)}</span>
        </Button>
      )
    }
    return (
      <Button
        variant='outline'
        className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
        <span>{t(HERO_DOCS_CTA)}</span>
      </Button>
    )
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-36 lg:pb-28'>
      {/* Radial gradient background */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.12]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.62 0.19 285 / 80%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.72 0.13 215 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 40% 80%, oklch(0.66 0.14 320 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
      {/* Grid pattern */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.08]'
      />

      <div className='mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8'>
        {/* Left Column: title, description, actions, base URL */}
        <div className='flex flex-col items-start text-left lg:col-span-6'>
          <div
            className='landing-animate-fade-up mb-5 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-[11px] font-medium text-indigo-600 opacity-0 shadow-xs dark:border-indigo-400/20 dark:bg-indigo-400/5 dark:text-indigo-300'
            style={{ animationDelay: '0ms' }}
          >
            <span className='relative flex size-1.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75' />
              <span className='relative inline-flex size-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400' />
            </span>
            <span>{t(HERO_BADGE)}</span>
          </div>

          <h1
            className='landing-animate-fade-up text-[clamp(2.25rem,4.5vw,3.25rem)] leading-[1.15] font-bold tracking-tight'
            style={{ animationDelay: '60ms' }}
          >
            {t(HERO_TITLE_LEAD)}
            <br />
            <span className='bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent'>
              {t(HERO_TITLE_ACCENT)}
            </span>
          </h1>

          <p
            className='landing-animate-fade-up text-muted-foreground/80 mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-[15px]'
            style={{ animationDelay: '120ms' }}
          >
            {t(HERO_DESCRIPTION)}
          </p>

          <div
            className='landing-animate-fade-up mt-8 flex flex-wrap items-center gap-3 opacity-0'
            style={{ animationDelay: '180ms' }}
          >
            {props.isAuthenticated ? (
              <>
                <Button
                  className='group h-11 rounded-lg px-5 text-sm font-medium'
                  render={<Link to='/dashboard' />}
                >
                  {t(HERO_DASHBOARD_CTA)}
                  <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                </Button>
                {renderDocsButton()}
              </>
            ) : (
              <>
                <Button
                  className='group h-11 rounded-lg px-5 text-sm font-medium'
                  render={<Link to='/sign-up' />}
                >
                  {t(HERO_PRIMARY_CTA)}
                  <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                </Button>
                <Button
                  variant='outline'
                  className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
                  render={<Link to='/pricing' />}
                >
                  {t(HERO_SECONDARY_CTA)}
                </Button>
                {renderDocsButton()}
              </>
            )}
          </div>

          {/* Base URL card — the single line every client needs to change */}
          <div
            className='landing-animate-fade-up border-border/40 bg-muted/15 mt-10 w-full max-w-xl overflow-hidden rounded-xl border opacity-0 shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] backdrop-blur-xs'
            style={{ animationDelay: '240ms' }}
          >
            <div className='border-border/40 flex items-center justify-between border-b px-4 py-2.5'>
              <span className='text-muted-foreground/60 text-[10px] font-bold tracking-[0.15em] uppercase'>
                {t(HERO_BASE_URL_LABEL)}
              </span>
              <CopyButton
                value={BRAND.baseUrl}
                size='sm'
                variant='ghost'
                className='text-muted-foreground/70 hover:text-foreground size-7'
                iconClassName='size-3.5'
              />
            </div>
            <div className='px-4 py-3.5'>
              <code className='text-foreground/90 font-mono text-sm break-all'>
                {BRAND.baseUrl}
              </code>
              <p className='text-muted-foreground/60 mt-2 text-xs leading-relaxed'>
                {t(HERO_BASE_URL_HINT)}
              </p>
            </div>
          </div>

          {/* Client compatibility pills */}
          <div
            className='landing-animate-fade-up mt-8 w-full max-w-xl opacity-0'
            style={{ animationDelay: '300ms' }}
          >
            <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
              {t(HERO_CLIENTS_LABEL)}
            </span>
            <div className='mt-3 flex flex-wrap gap-2'>
              {HOME_CLIENTS.slice(0, 4).map((client) => (
                <span
                  key={client.name}
                  className='border-border/40 bg-muted/15 text-foreground/75 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium'
                >
                  {getLobeIcon(client.icon, 16)}
                  {client.name}
                </span>
              ))}
              <span className='text-muted-foreground/60 border-border/40 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium'>
                +{HOME_CLIENTS.length - 4}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: relay terminal demo */}
        <div
          className='landing-animate-fade-up flex w-full justify-center opacity-0 lg:col-span-6'
          style={{ animationDelay: '320ms' }}
        >
          <HeroTerminalDemo className='mt-8 lg:mt-0' />
        </div>
      </div>
    </section>
  )
}
