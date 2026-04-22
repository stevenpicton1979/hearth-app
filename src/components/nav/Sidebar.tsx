'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HearthLogo } from '@/components/HearthLogo'
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

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 bg-white border-r border-gray-200">
      <div className="flex items-center h-16 px-4 border-b border-gray-200">
        <Link href="/dashboard">
          <HearthLogo className="h-8 w-8" showWordmark />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const icons = ICON_MAP[item.icon]
          const Icon = isActive ? icons.solid : icons.outline

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">My Household</p>
      </div>
    </aside>
  )
}
