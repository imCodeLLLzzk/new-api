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
  CLIENTS_HEADING,
  CLIENTS_HEADING_LABEL,
  HOME_CLIENTS,
} from '../../constants'

export function Clients() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 pb-24 md:pb-32'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-12 text-center'>
          <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
            {t(CLIENTS_HEADING_LABEL)}
          </p>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t(CLIENTS_HEADING)}
          </h2>
        </AnimateInView>

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
          {HOME_CLIENTS.map((client, index) => (
            <AnimateInView
              key={client.name}
              delay={index * 40}
              animation='scale-in'
              className='border-border/40 bg-muted/15 hover:border-indigo-500/30 hover:bg-indigo-500/5 flex flex-col items-center gap-3 rounded-2xl border px-3 py-6 transition-colors duration-300'
            >
              <div className='flex size-11 items-center justify-center'>
                {getLobeIcon(client.icon, 34)}
              </div>
              <span className='text-foreground/80 text-center text-xs font-medium'>
                {client.name}
              </span>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
