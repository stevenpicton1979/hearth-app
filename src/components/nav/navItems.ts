export interface NavItem {
  label: string
  href: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'home' },
  { label: 'Transactions', href: '/transactions', icon: 'list' },
  { label: 'Spending', href: '/spending', icon: 'chart-pie' },
  { label: 'Business', href: '/business', icon: 'briefcase' },
  { label: 'Subscriptions', href: '/subscriptions', icon: 'repeat' },
  { label: 'Mappings', href: '/mappings', icon: 'tag' },
  { label: 'Net Worth', href: '/net-worth', icon: 'trending-up' },
  { label: 'Goals', href: '/goals', icon: 'target' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
]
