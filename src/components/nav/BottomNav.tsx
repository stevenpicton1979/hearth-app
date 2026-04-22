'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './navItems'
import {
  HomeIcon,
  ListBulletIcon,
  ChartPieIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  FlagIcon,
  Cog6ToothIcon,
  BriefcaseIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  ListBulletIcon as ListBulletIconSolid,
  ChartPieIcon as ChartPieIconSolid,
  ArrowPathIcon as ArrowPathIconSolid,
  ArrowTrendingUpIcon as ArrowTrendingUpIconSolid,
  FlagIcon as FlagIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  BriefcaseIcon as BriefcaseIconSolid,
  TagIcon as TagIconSolid,
} from '@heroicons/react/24/solid'

const ICON_MAP: Record<string, { outline: React.ElementType; solid: React.ElementType }> = {
  home: { outline: HomeIcon, solid: HomeIconSolid },
  list: { outline: ListBulletIcon, solid: ListBulletIconSolid },
  'chart-pie': { outline: ChartPieIcon, solid: ChartPieIconSolid },
  briefcase: { outline: BriefcaseIcon, solid: BriefcaseIconSolid },
  repeat: { outline: ArrowPathIcon, solid: ArrowPathIconSolid },
  tag: { outline: TagIcon, solid: TagIconSolid },
  'trending-up': { outline: ArrowTrendingUpIcon, solid: ArrowTrendingUpIconSolid },
  target: { outline: FlagIcon, solid: FlagIconSolid },
  settings: { outline: Cog6ToothIcon, solid: Cog6ToothIconSolid },
}

// Show only the 5 most important items in the bottom tab bar
const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter(item =>
  ['home', 'list', 'chart-pie', 'trending-up', 'settings'].includes(item.icon)
)

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50">
      <div className="flex">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const icons = ICON_MAP[item.icon]
          const Icon = isActive ? icons.solid : icons.outline

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-gray-500'
              }`}
            >
              <Icon className="h-6 w-6 mb-0.5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
