'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface BreedingStats {
  total_females: number
  covered: number
  pregnant: number
  births_ytd: number
  abortions_ytd: number
  weaned_ytd: number
  pregnancy_rate: number
  birth_rate: number
}

interface FatteningHerd {
  herd_id: string
  herd_name: string
  herd_color: string
  animal_count: number
  avg_gmd: number
  avg_weight: number
}

interface ProfitabilityStats {
  total_health_cost_cents: number
  currency: string
  sales_count: number
  cost_per_animal_cents: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
type Trend = 'up' | 'down' | 'flat'
function TrendIcon({ trend, good }: { trend: Trend; good: 'up' | 'down' }) {
  const isGood = trend === good
  const isFlat = trend === 'flat'
  if (isFlat) return <Minus className="w-4 h-4 text-gray-400" />
  return isGood
    ? <TrendingUp className="w-4 h-4 text-green-500" />
    : <TrendingDown className="w-4 h-4 text-red-400" />
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  good = 'up',
}: {
  label: string
  value: string | number
  sub?: string
  trend?: Trend
  good?: 'up' | 'down'
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {trend && <TrendIcon trend={trend} good={good} />}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
type Tab = 'breeding' | 'fattening' | 'profitability'

export default function StatsPage() {
  const [tab, setTab] = useState<Tab>('breeding')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estatísticas</h1>
        <p className="text-gray-500 text-sm mt-0.5">Indicadores zootécnicos e econômicos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-8">
        {([
          { v: 'breeding', l: 'Reprodução' },
          { v: 'fattening', l: 'Engorde' },
          { v: 'profitability', l: 'Rentabilidade' },
        ] as { v: Tab; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === v
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'breeding'     && <BreedingTab />}
      {tab === 'fattening'    && <FatteningTab />}
      {tab === 'profitability' && <ProfitabilityTab />}
    </div>
  )
}

// ─── BREEDING TAB ─────────────────────────────────────────────────────────────
function BreedingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats-breeding'],
    queryFn: async () => {
      const res = await api.get<{ data: BreedingStats }>('/stats/breeding')
      return res.data.data
    },
  })

  if (isLoading) return <StatsLoader />
  if (!data) return null

  const funnelData = [
    { name: 'Fêmeas', value: data.total_females, fill: '#6b7280' },
    { name: 'Cobertas', value: data.covered, fill: '#3b82f6' },
    { name: 'Prenhas', value: data.pregnant, fill: '#8b5cf6' },
    { name: 'Partos', value: data.births_ytd, fill: '#22c55e' },
  ]

  const eventData = [
    { name: 'Partos', value: data.births_ytd, fill: '#22c55e' },
    { name: 'Abortos', value: data.abortions_ytd, fill: '#ef4444' },
    { name: 'Desmamados', value: data.weaned_ytd, fill: '#f59e0b' },
  ]

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total de fêmeas"
          value={data.total_females}
        />
        <KpiCard
          label="Taxa de prenhez"
          value={`${data.pregnancy_rate.toFixed(1)}%`}
          sub={`${data.pregnant} prenhas`}
          trend={data.pregnancy_rate >= 60 ? 'up' : data.pregnancy_rate >= 40 ? 'flat' : 'down'}
        />
        <KpiCard
          label="Taxa de parição"
          value={`${data.birth_rate.toFixed(1)}%`}
          sub={`${data.births_ytd} partos no ano`}
          trend={data.birth_rate >= 70 ? 'up' : data.birth_rate >= 50 ? 'flat' : 'down'}
        />
        <KpiCard
          label="Desmamados"
          value={data.weaned_ytd}
          sub="no ano"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Funnel chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-medium text-gray-800 text-sm mb-5">Funil reprodutivo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical" barCategoryGap="20%">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: number | undefined) => [v ?? 0, 'Animais']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Events bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-medium text-gray-800 text-sm mb-5">Eventos reprodutivos (ano)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={eventData} barCategoryGap="35%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number | undefined) => [v ?? 0, 'Eventos']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {eventData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <h3 className="font-medium text-gray-800 text-sm">Resumo da campanha</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Fêmeas aptas', value: data.total_females },
            { label: 'Cobertas', value: data.covered },
            { label: 'Diagnóstico de prenhez +', value: data.pregnant },
            { label: 'Partos no ano', value: data.births_ytd },
            { label: 'Abortos no ano', value: data.abortions_ytd },
            { label: 'Desmamados no ano', value: data.weaned_ytd },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between px-5 py-3 text-sm">
              <span className="text-gray-600">{label}</span>
              <span className="font-semibold text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── FATTENING TAB ────────────────────────────────────────────────────────────
function FatteningTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats-fattening'],
    queryFn: async () => {
      const res = await api.get<{ data: FatteningHerd[] }>('/stats/fattening')
      return res.data.data
    },
  })

  if (isLoading) return <StatsLoader />

  const herds = data ?? []

  const chartData = herds.map((h) => ({
    name: h.herd_name,
    gmd: parseFloat(h.avg_gmd.toFixed(3)),
    fill: h.herd_color ?? '#22c55e',
  }))

  const overallGmd =
    herds.length > 0
      ? herds.reduce((sum, h) => sum + h.avg_gmd, 0) / herds.length
      : 0

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          label="GMD médio geral"
          value={`${overallGmd.toFixed(3)} kg/dia`}
          trend={overallGmd >= 0.8 ? 'up' : overallGmd >= 0.5 ? 'flat' : 'down'}
        />
        <KpiCard
          label="Lotes em engorde"
          value={herds.length}
          sub="com pesagem registrada"
        />
        <KpiCard
          label="Melhor GMD"
          value={herds.length > 0 ? `${Math.max(...herds.map((h) => h.avg_gmd)).toFixed(3)} kg/dia` : '—'}
        />
      </div>

      {/* GMD by herd chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-medium text-gray-800 text-sm mb-5">GMD médio por lote (kg/dia)</h3>
        {herds.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            Nenhuma pesagem registrada
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} unit=" kg" />
              <Tooltip formatter={(v: number | undefined) => [`${v ?? 0} kg/dia`, 'GMD']} />
              <Bar dataKey="gmd" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Herd table */}
      {herds.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Lote</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Animais</th>
                <th className="text-right px-4 py-3 font-medium text-green-600">GMD (kg/dia)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Peso médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {herds.map((h) => (
                <tr key={h.herd_id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: h.herd_color ?? '#22c55e' }}
                      />
                      <span className="font-medium text-gray-900">{h.herd_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600">{h.animal_count}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-green-600">
                    {h.avg_gmd.toFixed(3)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600">
                    {h.avg_weight > 0 ? `${h.avg_weight.toFixed(0)} kg` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── PROFITABILITY TAB ────────────────────────────────────────────────────────
function ProfitabilityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats-profitability'],
    queryFn: async () => {
      const res = await api.get<{ data: ProfitabilityStats }>('/stats/profitability')
      return res.data.data
    },
  })

  if (isLoading) return <StatsLoader />
  if (!data) return null

  const currency = data.currency ?? 'BRL'

  // Placeholder monthly cost data (real implementation would need a monthly breakdown endpoint)
  const monthlyPlaceholder = [
    { mes: 'Set', custo: 0 },
    { mes: 'Out', custo: 0 },
    { mes: 'Nov', custo: 0 },
    { mes: 'Dez', custo: 0 },
    { mes: 'Jan', custo: 0 },
    { mes: 'Fev', custo: data.total_health_cost_cents / 100 },
  ]

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          label="Custo sanitário total"
          value={formatCurrency(data.total_health_cost_cents, currency)}
          trend={data.total_health_cost_cents === 0 ? 'flat' : 'down'}
          good="down"
        />
        <KpiCard
          label="Custo por animal"
          value={formatCurrency(data.cost_per_animal_cents, currency)}
          sub="média sanitária"
          trend={data.cost_per_animal_cents < 5000 ? 'up' : data.cost_per_animal_cents < 15000 ? 'flat' : 'down'}
        />
        <KpiCard
          label="Vendas no ano"
          value={data.sales_count}
          sub="animais vendidos"
          trend={data.sales_count > 0 ? 'up' : 'flat'}
        />
      </div>

      {/* Monthly cost chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-medium text-gray-800 text-sm mb-5">
          Custo sanitário mensal ({currency})
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyPlaceholder}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number | undefined) => [formatCurrency((v ?? 0) * 100, currency), 'Custo']}
            />
            <Line
              type="monotone"
              dataKey="custo"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 4, fill: '#22c55e' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cost breakdown note */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
        <p className="text-sm font-medium text-amber-800 mb-1">Custo sanitário</p>
        <p className="text-xs text-amber-700">
          Reflete apenas os eventos de saúde com custo registrado (vacinas, medicamentos, tratamentos).
          Para uma análise completa de rentabilidade, registe os custos de alimentação e mão de obra
          nas seções correspondentes.
        </p>
      </div>
    </div>
  )
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function StatsLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
}
