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
import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      id='lui-logo'
      viewBox='0 0 64 64'
      xmlns='http://www.w3.org/2000/svg'
      height='24'
      width='24'
      fill='none'
      className={cn('size-6', className)}
      {...props}
    >
      <title>LUI</title>
      <defs>
        <linearGradient id='luiLogoGradient' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stopColor='#6D5BF5' />
          <stop offset='0.5' stopColor='#4F46E5' />
          <stop offset='1' stopColor='#06B6D4' />
        </linearGradient>
      </defs>
      <rect width='64' height='64' rx='15' fill='url(#luiLogoGradient)' />
      <path
        d='M21 14v29a6 6 0 0 0 6 6h9.5'
        stroke='#fff'
        strokeWidth='10'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <circle cx='47' cy='22' r='5.6' fill='#fff' />
      <circle cx='53.5' cy='35' r='3.4' fill='#fff' opacity='0.92' />
    </svg>
  )
}
