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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  HOME_MODELS,
  MODELS_HEADING,
  MODELS_HEADING_LABEL,
} from '../../constants'

export function Models() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 pb-24 md:pb-32'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-12 text-center'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t(MODELS_HEADING_LABEL)}
          </p>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t(MODELS_HEADING)}
          </h2>
        </AnimateInView>

        <div className='border-border/40 bg-muted/10 grid grid-cols-3 items-center justify-items-center gap-x-6 gap-y-7 rounded-2xl border px-8 py-10 sm:grid-cols-4 lg:grid-cols-6'>
          {HOME_MODELS.map((model, index) => (
            <AnimateInView
              key={model.name}
              delay={index * 50}
              animation='scale-in'
              className='flex w-full flex-col items-center gap-2.5'
            >
              <div className='flex size-10 items-center justify-center'>
                {getLobeIcon(model.icon, 30)}
              </div>
              <span className='text-muted-foreground text-center text-[11px] font-medium'>
                {model.name}
              </span>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
