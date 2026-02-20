'use client'
import { Beef, MapPin, Bell, Cpu, TrendingUp, Activity, AlertTriangle, Info, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Herd } from '@/types'

interface Alert {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  is_read: boolean
  created_at: string
}

interface Overview {
  total_animals: number
  active_animals: number
  total_zones: number
  occupied_zones: number
  alerts_today: number
  devices_online: number
  devices_offline: number
  avg_gmd?: number
}

export default function DashboardPage() {
  const { data: overview } = useQuery<Overview>({
    queryKey: ['stats-overview'],
    queryFn: () => api.get('/stats/overview').then((r) => r.data.data),
  })

  const { data: herds } = useQuery<Herd[]>({
    queryKey: ['herds'],
    queryFn: () => api.get('/herds').then((r) => r.data.data ?? []),
  })

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => api.get('/stats/alerts').then((r) => r.data.data ?? []),
    refetchInterval: 30_000,
  })

  const fmt = (v?: number) => v != null ? String(v) : '—'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral da sua fazenda</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KpiCard icon={Beef}       label="Animais ativos"  value={fmt(overview?.active_animals)} color="green" />
        <KpiCard icon={MapPin}     label="Zonas ocupadas"  value={fmt(overview?.occupied_zones)} color="blue" />
        <KpiCard icon={Bell}       label="Alertas hoje"    value={fmt(overview?.alerts_today)}   color="amber" />
        <KpiCard icon={Cpu}        label="Devices online"  value={fmt(overview?.devices_online)} color="violet" />
        <KpiCard icon={TrendingUp} label="GMD médio"       value={overview?.avg_gmd != null ? `${overview.avg_gmd.toFixed(1)} kg` : '—'} color="emerald" />
        <KpiCard icon={Activity}   label="Devices offline" value={fmt(overview?.devices_offline)} color="red" />
      </div>

      {/* Alerts + Herds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Alertas recentes</h2>
          {alerts.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-10">
              Nenhum alerta — tudo certo!
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className={`flex gap-3 p-3 rounded-lg border ${
                  a.is_read ? 'bg-gray-50 border-gray-100' :
                  a.severity === 'critical' ? 'bg-red-50 border-red-100' :
                  a.severity === 'warning'  ? 'bg-amber-50 border-amber-100' :
                                              'bg-blue-50 border-blue-100'
                }`}>
                  <span className={`mt-0.5 flex-shrink-0 ${
                    a.severity === 'critical' ? 'text-red-500' :
                    a.severity === 'warning'  ? 'text-amber-500' : 'text-blue-500'
                  }`}>
                    {a.severity === 'critical' ? <Zap className="w-4 h-4" /> :
                     a.severity === 'warning'  ? <AlertTriangle className="w-4 h-4" /> :
                                                 <Info className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${a.is_read ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
                      {a.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {!a.is_read && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                      a.severity === 'critical' ? 'bg-red-500' :
                      a.severity === 'warning'  ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Animais por lote</h2>
          {herds && herds.length > 0 ? (
            <ul className="space-y-3">
              {herds.map((h) => (
                <li key={h.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: h.color ?? '#22c55e' }}
                    />
                    <span className="text-sm text-gray-700 truncate max-w-[140px]">{h.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{h.animal_count ?? 0}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-400 text-center py-10">
              Sem lotes cadastrados
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: 'green' | 'blue' | 'amber' | 'violet' | 'emerald' | 'red'
}) {
  const colors = {
    green:   'bg-green-50 text-green-600',
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
    violet:  'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
