'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Star, MoreVertical, MapPin } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { cn, animalAge, formatDate } from '@/lib/utils'
import type { Animal } from '@/types'

const FarmMap = dynamic(() => import('@/components/map/FarmMap'), { ssr: false })

type AnimalTab = 'activity' | 'ficha' | 'cria' | 'engorde'

export default function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<AnimalTab>('activity')

  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal', id],
    queryFn: async () => {
      const res = await api.get<{ data: Animal }>(`/animals/${id}`)
      return res.data.data
    },
  })

  const { data: activity } = useQuery({
    queryKey: ['animal-activity', id],
    queryFn: async () => {
      const res = await api.get<{ data: any[] }>(`/animals/${id}/activity`)
      return res.data.data
    },
    enabled: tab === 'activity',
  })

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mb-4" />
        <div className="h-40 bg-gray-100 rounded" />
      </div>
    )
  }

  if (!animal) return null

  const last24h = activity?.slice(-1)[0]?.km_day ?? 0
  const herdAvg = activity?.slice(-1)[0]?.avg_herd ?? 0
  const weeklyTotal = activity?.reduce((s: number, d: any) => s + d.km_day, 0) ?? 0

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex-1 mx-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-mono">
              {animal.sex === 'female' ? 'Vaca' : 'Touro'} · {animalAge(animal.birth_date)}
            </span>
            <span className="text-base font-bold text-gray-900">{animal.ear_tag}</span>
            {animal.name && <span className="font-bold text-gray-900">— {animal.name}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {animal.herd_name && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: animal.herd_color ?? '#22c55e' }} />
                {animal.herd_name}
              </span>
            )}
            {animal.zone_name && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                <MapPin className="w-3 h-3" />
                {animal.zone_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-lg hover:bg-gray-100"><Star className="w-5 h-5 text-gray-400" /></button>
          <button className="p-1.5 rounded-lg hover:bg-gray-100"><MoreVertical className="w-5 h-5 text-gray-400" /></button>
          {/* Animal silhouette */}
          <div className="w-12 h-12 flex items-center justify-center text-3xl">
            {animal.sex === 'female' ? '🐄' : '🐂'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white">
        {([
          { v: 'activity', l: 'Atividade' },
          { v: 'ficha', l: 'Ficha' },
          { v: 'cria', l: 'Cría' },
          { v: 'engorde', l: 'Engorde' },
        ] as { v: AnimalTab; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-6 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === v
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {tab === 'activity' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map trail */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-50">
                  <h3 className="font-medium text-gray-800 text-sm">Trilha GPS — últimas 24h</h3>
                </div>
                <div className="h-64">
                  <FarmMap
                    farmId={animal.farm_id}
                    animals={[animal]}
                    zones={[]}
                    keyPoints={[]}
                  />
                </div>
              </div>

              {/* Activity chart */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-800 text-sm">Km percorridos/dia vs média do rebanho</h3>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={activity ?? []} barCategoryGap="20%">
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} unit="km" />
                    <Tooltip
                      formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)} km`, '']}
                      labelFormatter={(l) => `Dia ${l}`}
                    />
                    <Bar dataKey="km_day" radius={[4, 4, 0, 0]}>
                      {(activity ?? []).map((_: any, i: number) => (
                        <Cell key={i} fill="#16a34a" />
                      ))}
                    </Bar>
                    <Bar dataKey="avg_herd" radius={[4, 4, 0, 0]} fill="#fbbf24" opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stats sidebar */}
            <div className="space-y-4">
              {/* Last 24h */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-3">Últimas 24h</p>
                <div className="space-y-3">
                  <Stat label="Percorrido" value={`${last24h.toFixed(2)} km`} highlight />
                  <Stat label="Média do rebanho" value={`${herdAvg.toFixed(2)} km`} />
                  <Stat label="Total semanal" value={`${weeklyTotal.toFixed(2)} km`} />
                </div>
              </div>

              {/* Alerts */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-3">Resumo de alertas (12 meses)</p>
                <div className="grid grid-cols-2 gap-3">
                  <AlertBox label="Fora de zona" count={0} />
                  <AlertBox label="Atividade baixa" count={0} />
                </div>
              </div>

              {/* Device */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-2">Dispositivo associado</p>
                <p className="text-sm text-gray-500 italic">Sem dispositivo</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'ficha' && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-lg">
            <h3 className="font-semibold text-gray-800 mb-5">Dados</h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Crotal / ID" value={animal.ear_tag} />
              <InfoField label="Nome" value={animal.name ?? '—'} />
              <InfoField label="Raça" value={animal.breed ?? '—'} />
              <InfoField label="Nascimento" value={animal.birth_date ? formatDate(animal.birth_date) : '—'} />
              <InfoField label="Causa alta" value={animal.entry_reason ?? '—'} />
              <InfoField label="Status" value={animal.status} />
            </div>
          </div>
        )}

        {tab === 'cria' && (
          <div className="max-w-2xl">
            <p className="text-sm text-gray-500 mb-4">
              Aqui você pode adicionar{' '}
              <span className="text-green-600 font-medium">cobrições, prenhezes, partos, abortos e mais</span>
              {' '}para controle reprodutivo.
            </p>
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm py-16">
              Nenhum evento reprodutivo registrado
            </div>
          </div>
        )}

        {tab === 'engorde' && (
          <div className="max-w-2xl">
            <p className="text-sm text-gray-500 mb-4">
              Registre o peso do animal e acompanhe a{' '}
              <span className="text-green-600 font-medium">ganância média diária</span>
              {' '}entre cada pesagem.
            </p>
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm py-16">
              Nenhuma pesagem registrada
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={cn('font-semibold', highlight ? 'text-green-600' : 'text-gray-700')}>{value}</span>
    </div>
  )
}

function AlertBox({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-2xl font-bold text-gray-800">{count}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value ?? '—'}</p>
    </div>
  )
}
