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
import {
  BellRing,
  Code,
  DollarSign,
  Gauge,
  GitBranch,
  KeyRound,
  ScrollText,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

import {
  FEATURES_HEADING_ACCENT,
  FEATURES_HEADING_LABEL,
  FEATURES_HEADING_LEAD,
  HOME_FEATURES,
  HOME_FEATURES_EXTRA,
} from '../../constants'

const FEATURE_ICONS: Record<string, LucideIcon> = {
  BellRing,
  Code,
  DollarSign,
  Gauge,
  GitBranch,
  KeyRound,
  ScrollText,
  Shield,
}

const ACCENT_TEXT: Record<string, string> = {
  amber: 'text-amber-400',
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  violet: 'text-violet-400',
}

const CONCURRENCY_BARS = [
  { id: 'bar-1', height: 38 },
  { id: 'bar-2', height: 62 },
  { id: 'bar-3', height: 45 },
  { id: 'bar-4', height: 78 },
  { id: 'bar-5', height: 56 },
  { id: 'bar-6', height: 92 },
  { id: 'bar-7', height: 70 },
  { id: 'bar-8', height: 84 },
  { id: 'bar-9', height: 48 },
  { id: 'bar-10', height: 66 },
] as const

const PROTOCOL_TAGS = [
  'OpenAI',
  'Anthropic',
  'Gemini',
  'DeepSeek',
  'Qwen',
  'Llama',
] as const

export function Features() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 py-24 md:py-32'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-16 max-w-lg'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t(FEATURES_HEADING_LABEL)}
          </p>
          <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
            {t(FEATURES_HEADING_LEAD)}
            <br />
            <span className='from-indigo-500 to-cyan-400 bg-gradient-to-r bg-clip-text text-transparent'>
              {t(FEATURES_HEADING_ACCENT)}
            </span>
          </h2>
        </AnimateInView>

        {/* Bento grid */}
        <div className='border-border/40 bg-border/40 grid gap-px overflow-hidden rounded-xl border md:grid-cols-3'>
          {HOME_FEATURES.map((feature, index) => {
            const Icon = FEATURE_ICONS[feature.iconName]
            const accent = ACCENT_TEXT[feature.accent] ?? ACCENT_TEXT.blue

            return (
              <AnimateInView
                key={feature.id}
                delay={index * 100}
                animation='scale-in'
                className={`bg-background group hover:bg-muted/20 p-7 transition-colors duration-300 md:p-8 ${feature.span}`}
              >
                <div className='mb-3 flex items-center gap-3'>
                  <span className='border-border/40 bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums'>
                    {feature.num}
                  </span>
                  <Icon className={`size-4 ${accent}`} aria-hidden='true' />
                  <h3 className='text-sm font-semibold'>{t(feature.title)}</h3>
                </div>
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {t(feature.description)}
                </p>

                {feature.id === 'protocol' && (
                  <div className='mt-4 grid grid-cols-3 gap-2'>
                    {PROTOCOL_TAGS.map((tag) => (
                      <div
                        key={tag}
                        className='border-border/30 bg-muted/20 text-muted-foreground flex items-center justify-center rounded-lg border px-3 py-2 text-xs transition-colors duration-300 hover:border-blue-500/30 hover:bg-blue-500/5'
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                )}

                {feature.id === 'billing' && (
                  <div className='border-border/40 bg-muted/15 mt-4 rounded-lg border p-3'>
                    <div className='text-muted-foreground/60 text-[10px] font-bold tracking-[0.12em] uppercase'>
                      {t('Last request')}
                    </div>
                    <div className='mt-2 flex items-baseline gap-1.5'>
                      <span className='text-emerald-400 font-mono text-lg font-semibold'>
                        1,284
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {t('tokens')}
                      </span>
                    </div>
                    <div className='text-muted-foreground/70 mt-1 font-mono text-[11px]'>
                      {t('settled instantly')}
                    </div>
                  </div>
                )}

                {feature.id === 'failover' && (
                  <div className='mt-4 space-y-2'>
                    {['route-a', 'route-b', 'route-c'].map((route, index) => (
                      <div key={route} className='flex items-center gap-2'>
                        <span
                          className={`size-1.5 rounded-full ${
                            index === 0
                              ? 'bg-emerald-500'
                              : 'bg-muted-foreground/30'
                          }`}
                        />
                        <span className='text-muted-foreground font-mono text-xs'>
                          {route}
                        </span>
                        <div className='bg-border/40 h-px flex-1' />
                        <span className='text-muted-foreground/60 text-[10px] tabular-nums'>
                          {index === 0 ? t('active') : t('standby')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {feature.id === 'throughput' && (
                  <div className='mt-4 flex items-end gap-1.5'>
                    {CONCURRENCY_BARS.map((bar) => (
                      <div
                        key={bar.id}
                        className='from-violet-500/70 to-cyan-400/70 flex-1 rounded-t bg-gradient-to-t'
                        style={{ height: `${bar.height * 0.5}px` }}
                      />
                    ))}
                  </div>
                )}
              </AnimateInView>
            )
          })}
        </div>

        {/* Additional features row */}
        <div className='mt-12 grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12'>
          {HOME_FEATURES_EXTRA.map((feature, index) => {
            const Icon = FEATURE_ICONS[feature.iconName]
            return (
              <AnimateInView
                key={feature.title}
                delay={index * 100}
                animation='fade-up'
                className='flex flex-col items-center text-center'
              >
                <div className='text-muted-foreground border-border/50 bg-muted/30 group-hover:text-foreground mb-3 flex size-12 items-center justify-center rounded-xl border transition-colors'>
                  {Icon ? (
                    <Icon className='size-5' strokeWidth={1.5} aria-hidden='true' />
                  ) : null}
                </div>
                <h3 className='mb-1.5 text-sm font-semibold'>{t(feature.title)}</h3>
                <p className='text-muted-foreground max-w-[200px] text-xs leading-relaxed'>
                  {t(feature.description)}
                </p>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
