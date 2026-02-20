'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Filter, CheckSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatRelativeTime, animalAge } from '@/lib/utils'
import type { Animal, PaginatedResponse } from '@/types'

const SEX_ICON: Record<string, string> = { female: '🐄', male: '🐂' }

export default function AnimalsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sexFilter, setSexFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['animals', page, search, sexFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(search && { q: search }),
        ...(sexFilter && { sex: sexFilter }),
      })
      const res = await api.get<PaginatedResponse<Animal>>(`/animals?${params}`)
      return res.data
    },
    placeholderData: (prev) => prev,
  })

  const animals = data?.data ?? []
  const total = data?.total ?? 0

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === animals.length ? new Set() : new Set(animals.map((a) => a.id))
    )
  }, [animals])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Animais</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} animais ativos</p>
        </div>
        <button className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Novo animal
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white w-72">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por brinco ou nome..."
            className="text-sm outline-none flex-1 bg-transparent"
          />
        </div>

        <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white p-1">
          {[{ v: '', l: 'Todos' }, { v: 'female', l: '🐄 Fêmeas' }, { v: 'male', l: '🐂 Machos' }].map(
            ({ v, l }) => (
              <button
                key={v}
                onClick={() => { setSexFilter(v); setPage(1) }}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  sexFilter === v ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                {l}
              </button>
            )
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
            <CheckSquare className="w-4 h-4" />
            <span>{selected.size} selecionados</span>
            <button className="font-medium hover:underline">Mover</button>
            <button className="font-medium hover:underline">Vacinar</button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          <span>Filtros avançados</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === animals.length && animals.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Crotal</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Idade</th>
              <th className="text-left px-4 py-3 font-medium text-green-600">Última localização</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Lote</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!isLoading && animals.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  Nenhum animal encontrado
                </td>
              </tr>
            )}
            {animals.map((a) => (
              <tr key={a.id} className={cn('hover:bg-gray-50/50 transition-colors',
                selected.has(a.id) && 'bg-green-50/50')}>
                <td className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </td>
                <td className="px-4 py-3.5">
                  <Link href={`/animals/${a.id}`} className="flex items-center gap-2 group">
                    <span className="text-lg">{SEX_ICON[a.sex] ?? '🐄'}</span>
                    <span className={cn('font-medium group-hover:text-green-600 transition-colors',
                      a.name ? 'text-green-600' : 'text-gray-700')}>
                      {a.name ?? a.ear_tag}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-gray-500 font-mono text-xs">{a.ear_tag}</td>
                <td className="px-4 py-3.5 text-gray-600">{animalAge(a.birth_date)}</td>
                <td className="px-4 py-3.5">
                  {a.last_seen_at ? (
                    <span className="text-green-600 text-xs">
                      {formatRelativeTime(a.last_seen_at)}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">Sem dados</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {a.herd_name && (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: a.herd_color ?? '#22c55e' }}
                      />
                      {a.herd_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    {a.sex === 'female' && (
                      <>
                        <RegBtn label="Prenhez" color="pink" />
                        <RegBtn label="Parto" color="green" />
                        <RegBtn label="Aborto" color="red" />
                      </>
                    )}
                    <RegBtn label="Baixa" color="gray" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              ←
            </button>
            {Array.from({ length: Math.min(5, Math.ceil(total / 50)) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn('px-3 py-1.5 rounded-lg border text-xs',
                  page === p
                    ? 'bg-green-600 text-white border-green-600'
                    : 'border-gray-200 hover:bg-gray-50'
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= total}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RegBtn({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    pink: 'text-pink-300 hover:bg-pink-50 hover:text-pink-500',
    green: 'text-green-300 hover:bg-green-50 hover:text-green-600',
    red: 'text-red-300 hover:bg-red-50 hover:text-red-500',
    gray: 'text-gray-300 hover:bg-gray-100 hover:text-gray-600',
  }
  return (
    <button
      title={label}
      className={cn(
        'px-2 py-1 rounded text-[10px] font-medium transition-colors',
        colors[color] ?? colors.gray
      )}
    >
      {label}
    </button>
  )
}
