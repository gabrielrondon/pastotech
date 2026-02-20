'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Trash2, Users, Droplets, MapPin, Move } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatHectares } from '@/lib/utils'
import type { Zone, ZoneGroup, KeyPoint, Perimeter } from '@/types'

type Tab = 'zones' | 'groups' | 'keypoints' | 'perimeters'

export default function ZonesPage() {
  const [tab, setTab] = useState<Tab>('zones')
  const [search, setSearch] = useState('')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zonas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestão de piquetes e pastagens</p>
        </div>
        <button className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Nova zona
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(['zones', 'groups', 'keypoints', 'perimeters'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = {
            zones: 'Zonas', groups: 'Grupos de zonas',
            keypoints: 'Pontos clave', perimeters: 'Perímetros',
          }
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {labels[t]}
            </button>
          )
        })}
      </div>

      {tab === 'zones' && <ZonesTab search={search} setSearch={setSearch} />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'keypoints' && <KeyPointsTab />}
      {tab === 'perimeters' && <PerimetersTab />}
    </div>
  )
}

// =============================================
// ZONES TAB
// =============================================
function ZonesTab({ search, setSearch }: { search: string; setSearch: (s: string) => void }) {
  const [showActive, setShowActive] = useState(true)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const res = await api.get<{ data: Zone[] }>('/zones')
      return res.data.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/zones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  })

  const filtered = (data ?? []).filter((z) => {
    const matchSearch = search === '' || z.name.toLowerCase().includes(search.toLowerCase())
    const matchActive = !showActive || z.is_active
    return matchSearch && matchActive
  })

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setShowActive(!showActive)}
          className={cn(
            'relative inline-flex h-6 w-11 rounded-full transition-colors',
            showActive ? 'bg-green-500' : 'bg-gray-200'
          )}
        >
          <span className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
            showActive ? 'translate-x-5' : ''
          )} />
        </button>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white w-72">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar zona..."
            className="text-sm outline-none flex-1 bg-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-12">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Nome</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Hectares</th>
              <th className="text-right px-4 py-3 font-medium text-green-600">Animais</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">UGM/ha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo de pasto</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Nenhuma zona encontrada</td></tr>
            )}
            {filtered.map((z) => (
              <tr key={z.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className={cn(
                    'w-10 h-5 rounded-full relative transition-colors',
                    z.is_active ? 'bg-green-500' : 'bg-gray-300'
                  )}>
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      z.is_active ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </div>
                </td>
                <td className="px-4 py-3.5 font-medium text-gray-900">{z.name}</td>
                <td className="px-4 py-3.5 text-right text-gray-600">{formatHectares(z.area_ha)}</td>
                <td className={cn('px-4 py-3.5 text-right font-semibold',
                  (z.animal_count ?? 0) > 0 ? 'text-green-600' : 'text-gray-400')}>
                  {z.animal_count ?? 0}
                </td>
                <td className="px-4 py-3.5 text-right text-gray-600">
                  {(z.ugm_ha ?? 0) > 0 ? (z.ugm_ha ?? 0).toFixed(2) : '0'}
                </td>
                <td className="px-4 py-3.5 text-gray-500">{z.grass_type ?? '—'}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-2">
                    <ActionBtn icon={Move} label="Mover animais" onClick={() => {}} />
                    <ActionBtn icon={Users} label="Atribuir animais" onClick={() => {}} />
                    <ActionBtn icon={Pencil} label="Editar zona" onClick={() => {}} />
                    <ActionBtn icon={Trash2} label="Eliminar zona" danger
                      onClick={() => deleteMutation.mutate(z.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// =============================================
// GROUPS TAB
// =============================================
function GroupsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['zone-groups'],
    queryFn: async () => {
      const res = await api.get<{ data: ZoneGroup[] }>('/zones/groups')
      return res.data.data
    },
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {isLoading && <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>}
      {!isLoading && (data ?? []).length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">Nenhum grupo cadastrado</div>
      )}
      <div className="divide-y divide-gray-50">
        {(data ?? []).map((g) => (
          <div key={g.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50">
            <span className="font-medium text-gray-900">{g.name}</span>
            <div className="flex items-center gap-8 text-sm">
              <span className={cn('font-semibold', g.animal_count > 0 ? 'text-green-600' : 'text-gray-400')}>
                {g.animal_count} animais
              </span>
              <span className="text-gray-500">{g.zone_count} zonas</span>
              <span className="text-gray-400 hover:text-gray-600 cursor-pointer">→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================
// KEY POINTS TAB
// =============================================
function KeyPointsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['keypoints'],
    queryFn: async () => {
      const res = await api.get<{ data: KeyPoint[] }>('/zones/keypoints')
      return res.data.data
    },
  })

  const iconMap: Record<string, React.ReactNode> = {
    water: <Droplets className="w-4 h-4 text-blue-500" />,
    barn: <MapPin className="w-4 h-4 text-amber-500" />,
    gate: <MapPin className="w-4 h-4 text-gray-500" />,
    vet: <MapPin className="w-4 h-4 text-red-500" />,
    other: <MapPin className="w-4 h-4 text-gray-400" />,
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500 w-12">Estado</th>
            <th className="text-left px-4 py-3 font-medium text-green-600">Nome</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Ícone</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading && <tr><td colSpan={4} className="text-center py-10 text-gray-400">Carregando...</td></tr>}
          {(data ?? []).map((kp) => (
            <tr key={kp.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-3.5">
                <div className={cn('w-10 h-5 rounded-full relative', kp.is_active ? 'bg-green-500' : 'bg-gray-300')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow', kp.is_active ? 'translate-x-5' : 'translate-x-0.5')} />
                </div>
              </td>
              <td className="px-4 py-3.5 font-medium text-gray-900">{kp.name}</td>
              <td className="px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                  {iconMap[kp.icon] ?? iconMap.other}
                </div>
              </td>
              <td className="px-4 py-3.5">
                <div className="flex items-center justify-end gap-2">
                  <ActionBtn icon={Pencil} label="Editar" onClick={() => {}} />
                  <ActionBtn icon={Trash2} label="Eliminar" danger onClick={() => {}} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =============================================
// PERIMETERS TAB
// =============================================
function PerimetersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['perimeters'],
    queryFn: async () => {
      const res = await api.get<{ data: Perimeter[] }>('/zones/perimeters')
      return res.data.data
    },
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Nome do grupo</th>
            <th className="text-right px-4 py-3 font-medium text-green-600">Hectares</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading && <tr><td colSpan={3} className="text-center py-10 text-gray-400">Carregando...</td></tr>}
          {(data ?? []).map((p) => (
            <tr key={p.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-4 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-4 text-right font-semibold text-green-600">{formatHectares(p.area_ha)}</td>
              <td className="px-4 py-4">
                <div className="flex justify-end gap-2">
                  <ActionBtn icon={Pencil} label="Editar" onClick={() => {}} />
                  <ActionBtn icon={Trash2} label="Eliminar" danger onClick={() => {}} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =============================================
// Shared action button
// =============================================
function ActionBtn({ icon: Icon, label, onClick, danger = false }: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'w-8 h-8 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors text-[10px] font-medium',
        danger
          ? 'text-red-300 hover:bg-red-50 hover:text-red-500'
          : 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
