import Link from 'next/link'
import {
  BanknotesIcon,
  CurrencyDollarIcon,
  ArrowUpTrayIcon,
  TagIcon,
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'

const SECTIONS = [
  {
    href: '/settings/accounts',
    icon: BanknotesIcon,
    label: 'Bank Accounts',
    description: 'Manage connected accounts',
  },
  {
    href: '/settings/budgets',
    icon: CurrencyDollarIcon,
    label: 'Budgets',
    description: 'Set monthly spending limits',
  },
  {
    href: '/settings/categories',
    icon: AdjustmentsHorizontalIcon,
    label: 'Categories',
    description: 'Hide, rename or add categories',
  },
  {
    href: '/mappings',
    icon: TagIcon,
    label: 'Merchant Mappings',
    description: 'Edit category rules',
  },
  {
    href: '/import',
    icon: ArrowUpTrayIcon,
    label: 'Import CSV',
    description: 'Upload bank export files',
  },
  {
    href: '/settings/export',
    icon: ArrowDownTrayIcon,
    label: 'Export & Data',
    description: 'Download transactions as CSV',
  },
]

export default function SettingsPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="space-y-3">
        {SECTIONS.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
          >
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
              <Icon className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <div className="font-medium text-gray-900">{label}</div>
              <div className="text-sm text-gray-500">{description}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
