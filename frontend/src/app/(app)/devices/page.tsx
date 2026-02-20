'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wifi, WifiOff, Battery, BatteryLow, Trash2, Link, Unlink, Radio } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Device, Antenna } from '@/types'

type Tab = 'devices' | 'antennas'

export default function DevicesPage() {
  const [tab, setTab] = useState<Tab>('devices')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispositivos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Colares GPS e antenas da fazenda</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { v: 'devices', l: 'Colares / Brincos GPS' },
          { v: 'antennas', l: 'Antenas' },
        ] as { v: Tab; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === v
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'devices'  && <DevicesTab />}
      {tab === 'antennas' && <AntennasTab />}
    </div>
  )
}

// ─── DEVICES TAB ──────────────────────────────────────────────────────────────
function DevicesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await api.get<{ data: Device[] }>('/devices')
      return res.data.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, animalId }: { id: string; animalId: string | null }) =>
      api.post(`/devices/${id}/assign`, { animal_id: animalId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  const devices = data ?? []
  const online  = devices.filter((d) => d.is_active && isOnline(d.last_ping_at)).length
  const offline = devices.length - online

  return (
    <>
      {/* Summary pills */}
      <div className="flex gap-3 mb-5">
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-2.5">
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-sm font-semibold text-green-700">{online} online</span>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
          <WifiOff className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-500">{offline} offline</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar dispositivo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <AddDeviceForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['devices'] })
            setShowForm(false)
          }}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">UID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-green-600">Animal</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Bateria</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Último ping</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && devices.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">
                Nenhum dispositivo cadastrado
              </td></tr>
            )}
            {devices.map((d) => {
              const online = isOnline(d.last_ping_at)
              return (
                <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      online ? 'bg-green-400' : 'bg-gray-300'
                    )} />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-700">{d.device_uid}</td>
                  <td className="px-4 py-3.5 text-gray-500 capitalize">{d.type}</td>
                  <td className="px-4 py-3.5">
                    {d.animal_tag
                      ? <span className="text-green-700 font-medium">{d.animal_tag}</span>
                      : <span className="text-gray-400 text-xs italic">Não atribuído</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <BatteryIndicator pct={d.battery_pct} />
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs text-gray-400">
                    {d.last_ping_at ? formatRelative(d.last_ping_at) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {d.animal_id ? (
                        <button
                          title="Desatribuir animal"
                          onClick={() => assignMutation.mutate({ id: d.id, animalId: null })}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          title="Atribuir animal"
                          onClick={() => {/* TODO: open assign modal */}}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:bg-green-50 hover:text-green-500 transition-colors"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        title="Eliminar"
                        onClick={() => deleteMutation.mutate(d.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-red-200 hover:bg-red-50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── ANTENNAS TAB ─────────────────────────────────────────────────────────────
function AntennasTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['antennas'],
    queryFn: async () => {
      const res = await api.get<{ data: Antenna[] }>('/devices/antennas')
      return res.data.data
    },
  })

  const antennas = data ?? []

  return (
    <>
      <div className="flex justify-end mb-5">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova antena
        </button>
      </div>

      {showForm && (
        <AddAntennaForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['antennas'] })
            setShowForm(false)
          }}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-green-600">Nome</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Latitude</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Longitude</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Raio (m)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && antennas.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">
                Nenhuma antena cadastrada
              </td></tr>
            )}
            {antennas.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    a.is_active ? 'bg-green-400' : 'bg-gray-300'
                  )} />
                </td>
                <td className="px-4 py-3.5 font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-gray-400" />
                    {a.name}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">
                  {a.lat.toFixed(6)}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">
                  {a.lng.toFixed(6)}
                </td>
                <td className="px-4 py-3.5 text-right text-gray-600">
                  {a.radius_m.toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Add Device Form ──────────────────────────────────────────────────────────
function AddDeviceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [uid, setUid] = useState('')
  const [type, setType] = useState('collar')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post<{ data: { api_key: string } }>('/devices', { device_uid: uid, type })
      setApiKey(res.data.data.api_key)
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

  if (apiKey) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
        <p className="font-semibold text-green-800 mb-1">Dispositivo criado!</p>
        <p className="text-xs text-green-700 mb-3">
          Guarde esta chave API — ela não será exibida novamente.
        </p>
        <div className="bg-white rounded-lg border border-green-200 px-4 py-3 font-mono text-xs text-gray-700 break-all">
          {apiKey}
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
        >
          Fechar
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Novo dispositivo</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">UID do dispositivo *</label>
          <input required value={uid} onChange={(e) => setUid(e.target.value)}
            placeholder="Ex: GPS-001" className={inputCls} />
        </div>
        <div className="w-36">
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option value="collar">Colar</option>
            <option value="ear_tag">Brinco</option>
          </select>
        </div>
        <button type="submit" disabled={loading}
          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
          {loading ? 'Criando...' : 'Criar'}
        </button>
      </form>
    </div>
  )
}

// ─── Add Antenna Form ─────────────────────────────────────────────────────────
function AddAntennaForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius_m: '3000' })
  const [loading, setLoading] = useState(false)
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/devices/antennas', {
        name: form.name,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radius_m: parseInt(form.radius_m),
      })
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Nova antena</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 items-end">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="Ex: Antena Norte" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Latitude *</label>
          <input required type="number" step="any" value={form.lat}
            onChange={(e) => set('lat', e.target.value)} placeholder="-23.5505" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Longitude *</label>
          <input required type="number" step="any" value={form.lng}
            onChange={(e) => set('lng', e.target.value)} placeholder="-46.6333" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Raio (m)</label>
          <input type="number" value={form.radius_m}
            onChange={(e) => set('radius_m', e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOnline(lastPing: string | null | undefined): boolean {
  if (!lastPing) return false
  return Date.now() - new Date(lastPing).getTime() < 5 * 60 * 1000 // 5 min
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

function BatteryIndicator({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-gray-300 text-xs">—</span>
  const isLow = pct < 20
  return (
    <div className={cn('inline-flex items-center gap-1', isLow ? 'text-red-400' : 'text-gray-500')}>
      {isLow ? <BatteryLow className="w-4 h-4" /> : <Battery className="w-4 h-4" />}
      <span className="text-xs">{pct}%</span>
    </div>
  )
}
