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
import { ArrowRight, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'

import {
  BRAND,
  CTA_DESCRIPTION,
  CTA_FOOTNOTE,
  CTA_HEADING_ACCENT,
  CTA_HEADING_LEAD,
  HERO_PRIMARY_CTA,
  HERO_SECONDARY_CTA,
} from '../../constants'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 py-24 md:py-32'>
      {/* Gradient mesh background */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 opacity-20 dark:opacity-[0.08]'
        style={{
          background: [
            'radial-gradient(ellipse 50% 50% at 30% 50%, oklch(0.62 0.19 285 / 70%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 40% at 70% 40%, oklch(0.72 0.13 215 / 50%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      <AnimateInView
        className='mx-auto max-w-2xl text-center'
        animation='scale-in'
      >
        <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-4xl'>
          {t(CTA_HEADING_LEAD)}
          <br />
          <span className='from-indigo-400 via-blue-400 to-cyan-400 bg-gradient-to-r bg-clip-text text-transparent'>
            {t(CTA_HEADING_ACCENT)}
          </span>
        </h2>
        <p className='text-muted-foreground/80 mx-auto mt-5 max-w-md text-sm leading-relaxed md:text-base'>
          {t(CTA_DESCRIPTION)}
        </p>

        <div className='mt-8 flex items-center justify-center gap-3'>
          <Button className='group rounded-lg' render={<Link to='/sign-up' />}>
            {t(HERO_PRIMARY_CTA)}
            <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
          </Button>
          <Button
            variant='outline'
            className='border-border/50 hover:border-border hover:bg-muted/50 rounded-lg'
            render={<Link to='/pricing' />}
          >
            {t(HERO_SECONDARY_CTA)}
          </Button>
        </div>

        <div className='border-border/40 bg-muted/15 mx-auto mt-8 flex max-w-md items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left'>
          <code className='text-foreground/85 min-w-0 truncate font-mono text-xs'>
            {BRAND.baseUrl}
          </code>
          <div className='flex shrink-0 items-center gap-1'>
            <CopyButton
              value={BRAND.baseUrl}
              size='sm'
              variant='ghost'
              className='text-muted-foreground/70 hover:text-foreground size-7'
              iconClassName='size-3.5'
            />
            <Button
              variant='ghost'
              size='sm'
              className='text-muted-foreground/70 hover:text-foreground size-7'
              render={
                <a
                  href={BRAND.site}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label={t('Official site')}
                />
              }
            >
              <ExternalLink className='size-3.5' />
            </Button>
          </div>
        </div>

        <p className='text-muted-foreground/60 mt-4 text-xs'>
          {t(CTA_FOOTNOTE)}
        </p>
      </AnimateInView>
    </section>
  )
}
