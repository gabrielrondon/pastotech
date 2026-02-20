'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Map, Grid2x2, Beef, CalendarDays, HeartPulse,
  BarChart3, Cpu, ShoppingBag, Settings, LogOut,
  ChevronLeft, ChevronRight, Sun, Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'

const NAV = [
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/map',       icon: Map,       label: 'Mapa' },
  { href: '/zones',     icon: Grid2x2,   label: 'Zonas' },
  { href: '/animals',   icon: Beef,      label: 'Animais' },
  { href: '/agenda',    icon: CalendarDays, label: 'Agenda' },
  { href: '/health',    icon: HeartPulse, label: 'Saúde' },
  { href: '/stats',     icon: BarChart3,  label: 'Estatísticas' },
  { href: '/devices',   icon: Cpu,        label: 'Dispositivos' },
  { href: '/marketplace', icon: ShoppingBag, label: 'Marketplace' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, farm, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-white border-r border-gray-100 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-100">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
          <Beef className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-gray-900 text-lg leading-none">PastoTech</span>
        )}
      </div>

      {/* Farm selector */}
      {!collapsed && farm && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Fazenda</p>
          <p className="text-sm font-medium text-gray-700 truncate">{farm.name}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-green-600' : '')} />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 py-3 px-2 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </Link>

        {!collapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-green-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4 flex-shrink-0" />
            : <Moon className="w-4 h-4 flex-shrink-0" />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>}
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50"
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-gray-500" />
          : <ChevronLeft className="w-3 h-3 text-gray-500" />
        }
      </button>
    </aside>
  )
}
