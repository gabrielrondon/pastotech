'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgendaEvent {
  type: string
  count: number
  label: string
  month: number
  year: number
}
interface AgendaWeek {
  week: number
  label: string
  events: AgendaEvent[]
}
interface AgendaMonth {
  month: number
  year: number
  label: string
  weeks: AgendaWeek[]
}

// ─── Event config ─────────────────────────────────────────────────────────────
const EVENT_CONFIG: Record<string, { color: string; bg: string; emoji: string }> = {
  imminent_birth: { color: 'text-red-600',    bg: 'bg-red-100',    emoji: '❤️' },
  delayed_birth:  { color: 'text-gray-700',   bg: 'bg-gray-200',   emoji: '❓' },
  empty_cow:      { color: 'text-purple-600', bg: 'bg-purple-100', emoji: '🔮' },
  low_activity:   { color: 'text-orange-600', bg: 'bg-orange-100', emoji: '📉' },
  high_activity:  { color: 'text-green-600',  bg: 'bg-green-100',  emoji: '📈' },
  weaning:        { color: 'text-yellow-600', bg: 'bg-yellow-100', emoji: '🌕' },
  health_alert:   { color: 'text-blue-600',   bg: 'bg-blue-100',   emoji: '➕' },
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['agenda'],
    queryFn: async () => {
      const res = await api.get<{ data: AgendaMonth[] }>('/animals/agenda')
      return res.data.data
    },
  })

  const months = data ?? []
  const [activeMonth, setActiveMonth] = useState(0)
  const [activeWeek, setActiveWeek] = useState(3) // default current week

  const currentMonth = months[activeMonth]
  const currentWeekData = currentMonth?.weeks?.find((w) => w.week === activeWeek)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
        <p className="text-gray-500 text-sm mt-0.5">Eventos e alertas do rebanho</p>
      </div>

      {/* Month tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-16 h-9 bg-gray-100 rounded-t animate-pulse mx-1" />
            ))
          : months.map((m, i) => {
              const shortLabel = new Date(m.year, m.month - 1).toLocaleString('pt-BR', {
                month: 'short',
              })
              return (
                <button
                  key={`${m.year}-${m.month}`}
                  onClick={() => { setActiveMonth(i); setActiveWeek(3) }}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors capitalize',
                    activeMonth === i
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {shortLabel}
                </button>
              )
            })}
      </div>

      {currentMonth && (
        <>
          {/* Week selector */}
          <div className="flex gap-2 mb-6">
            {currentMonth.weeks.map((wk) => (
              <button
                key={wk.week}
                onClick={() => setActiveWeek(wk.week)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  activeWeek === wk.week
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                Semana {wk.week}
              </button>
            ))}
          </div>

          {/* Events */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {currentWeekData && (
              <div className="p-2 border-b border-gray-50 text-xs text-gray-400 px-4 py-2.5">
                {currentWeekData.label}
              </div>
            )}

            {(!currentWeekData || currentWeekData.events.length === 0) ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                Nenhum evento nesta semana
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {currentWeekData.events.map((ev, i) => {
                  const cfg = EVENT_CONFIG[ev.type] ?? EVENT_CONFIG.health_alert
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base',
                        cfg.bg
                      )}>
                        {cfg.emoji}
                      </div>
                      <div className="flex-1">
                        <span className={cn('font-medium text-sm', cfg.color)}>
                          {ev.count} {ev.label}
                        </span>
                      </div>
                      <span className="text-gray-300 text-sm">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3">
        {Object.entries(EVENT_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs', cfg.bg)}>
              {cfg.emoji}
            </span>
            <span className="capitalize">{key.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
