'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Filter } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { HealthEvent } from '@/types'

// ─── Event type config ────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  disease:    { label: 'Doença',      color: 'text-red-600',    dot: 'bg-red-400' },
  vaccine:    { label: 'Vacina',      color: 'text-blue-600',   dot: 'bg-blue-400' },
  feed:       { label: 'Alimento',    color: 'text-amber-600',  dot: 'bg-amber-400' },
  sanitation: { label: 'Saneamento',  color: 'text-teal-600',   dot: 'bg-teal-400' },
  other:      { label: 'Outro',       color: 'text-gray-600',   dot: 'bg-gray-400' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function groupByMonth(events: HealthEvent[]): Record<string, HealthEvent[]> {
  return events.reduce<Record<string, HealthEvent[]>>((acc, e) => {
    const key = e.started_at.slice(0, 7) // YYYY-MM
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('pt-BR', {
    month: 'long', year: 'numeric',
  })
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function HealthPage() {
  const qc = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['health-events', typeFilter],
    queryFn: async () => {
      const params = typeFilter ? `?event_type=${typeFilter}` : ''
      const res = await api.get<{ data: HealthEvent[] }>(`/health-events${params}`)
      return res.data.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/health-events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['health-events'] }),
  })

  const grouped = groupByMonth(data ?? [])
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saúde</h1>
          <p className="text-gray-500 text-sm mt-0.5">Histórico sanitário do rebanho</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo evento
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {[{ v: '', l: 'Todos' }, ...Object.entries(TYPE_CONFIG).map(([v, c]) => ({ v, l: c.label }))].map(
          ({ v, l }) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                typeFilter === v
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}
            >
              {l}
            </button>
          )
        )}
      </div>

      {/* Create form */}
      {showForm && <CreateEventForm onClose={() => setShowForm(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ['health-events'] })
        setShowForm(false)
      }} />}

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sortedMonths.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Nenhum evento registrado
        </div>
      ) : (
        <div className="space-y-8">
          {sortedMonths.map((month) => (
            <div key={month}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-green-600 capitalize">
                  {monthLabel(month)}
                </h3>
              </div>

              {/* Events in month */}
              <div className="ml-1.5 border-l-2 border-dashed border-gray-200 pl-6 space-y-3">
                {grouped[month].map((ev) => {
                  const cfg = TYPE_CONFIG[ev.event_type] ?? TYPE_CONFIG.other
                  return (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      cfg={cfg}
                      onDelete={() => deleteMutation.mutate(ev.id)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({
  event: ev,
  cfg,
  onDelete,
}: {
  event: HealthEvent
  cfg: { label: string; color: string; dot: string }
  onDelete: () => void
}) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-sm transition-shadow">
      {/* Timeline dot */}
      <div className={cn(
        'absolute -left-[1.85rem] top-5 w-3.5 h-3.5 rounded-full border-2 border-white',
        cfg.dot
      )} />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-sm font-semibold', cfg.color)}>{ev.name}</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {cfg.label}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            {ev.cost_cents > 0 && (
              <span>Custo: <strong className="text-gray-700">{formatCurrency(ev.cost_cents, ev.currency)}</strong></span>
            )}
            {ev.dose_mg_kg && (
              <span>Dose: <strong className="text-gray-700">{ev.dose_mg_kg} mg/kg</strong></span>
            )}
            {ev.quantity_kg && (
              <span>Quantidade: <strong className="text-gray-700">{ev.quantity_kg} kg</strong></span>
            )}
            <span>Animais: <strong className="text-gray-700">{ev.animal_count}</strong></span>
          </div>

          {(ev.animal_name || ev.herd_name) && (
            <p className="text-xs text-gray-400 mt-1">
              {ev.animal_name ?? ev.herd_name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-500">{formatDate(ev.started_at)}</p>
            {ev.ended_at && (
              <p className="text-xs text-gray-400">
                até {formatDate(ev.ended_at)}
                {' · '}
                {Math.round(
                  (new Date(ev.ended_at).getTime() - new Date(ev.started_at).getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                )}{' '}meses
              </p>
            )}
          </div>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-300 hover:text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Form ──────────────────────────────────────────────────────────────
function CreateEventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    event_type: 'disease',
    name: '',
    cost_cents: '',
    animal_count: '1',
    started_at: new Date().toISOString().slice(0, 10),
    ended_at: '',
    dose_mg_kg: '',
    quantity_kg: '',
    description: '',
  })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/health-events', {
        ...form,
        cost_cents: form.cost_cents ? Math.round(parseFloat(form.cost_cents) * 100) : 0,
        animal_count: parseInt(form.animal_count) || 1,
        dose_mg_kg: form.dose_mg_kg ? parseFloat(form.dose_mg_kg) : null,
        quantity_kg: form.quantity_kg ? parseFloat(form.quantity_kg) : null,
        ended_at: form.ended_at || null,
        currency: 'BRL',
      })
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-800">Novo evento de saúde</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <select value={form.event_type} onChange={(e) => set('event_type', e.target.value)} className={inputCls}>
              {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input required value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Mastitis, Aftosa..." className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Custo (R$)</label>
          <input type="number" step="0.01" value={form.cost_cents}
            onChange={(e) => set('cost_cents', e.target.value)} className={inputCls} placeholder="0,00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nº de animais</label>
          <input type="number" min="1" value={form.animal_count}
            onChange={(e) => set('animal_count', e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dose (mg/kg)</label>
          <input type="number" step="0.01" value={form.dose_mg_kg}
            onChange={(e) => set('dose_mg_kg', e.target.value)} className={inputCls} placeholder="opcional" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade (kg)</label>
          <input type="number" step="0.01" value={form.quantity_kg}
            onChange={(e) => set('quantity_kg', e.target.value)} className={inputCls} placeholder="opcional" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data início *</label>
          <input required type="date" value={form.started_at}
            onChange={(e) => set('started_at', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
          <input type="date" value={form.ended_at}
            onChange={(e) => set('ended_at', e.target.value)} className={inputCls} />
        </div>

        <div className="col-span-2 flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
