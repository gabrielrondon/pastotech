'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Herd } from '@/types'

const PRESET_COLORS = [
  '#22c55e', '#3b82f6', '#ec4899', '#f59e0b',
  '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16',
]

export default function HerdsPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#22c55e')

  const { data, isLoading } = useQuery({
    queryKey: ['herds'],
    queryFn: async () => {
      const res = await api.get<{ data: Herd[] }>('/herds')
      return res.data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/herds', { name: newName, color: newColor }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['herds'] })
      setCreating(false)
      setNewName('')
      setNewColor('#22c55e')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/herds/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['herds'] }),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lotes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Agrupamento de animais por categoria</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo lote
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="font-medium text-gray-800 mb-4">Novo lote</h3>
          <div className="flex items-center gap-4">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do lote"
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-transform',
                    newColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newName || createMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Criar
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Herds list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-12">Cor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Nome</th>
              <th className="text-right px-4 py-3 font-medium text-green-600">Animais</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Localização</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                Nenhum lote cadastrado. Crie o primeiro!
              </td></tr>
            )}
            {(data ?? []).map((herd) => (
              <tr key={herd.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-4">
                  <span
                    className="w-8 h-8 rounded-full block border-2 border-white shadow-sm"
                    style={{ backgroundColor: herd.color }}
                  />
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={`/animals?herd_id=${herd.id}`}
                    className="font-semibold text-gray-900 hover:text-green-600 transition-colors"
                  >
                    {herd.name}
                  </Link>
                </td>
                <td className={cn('px-4 py-4 text-right font-semibold',
                  herd.animal_count > 0 ? 'text-green-600' : 'text-gray-400')}>
                  {herd.animal_count}
                </td>
                <td className="px-4 py-4 text-gray-500">{herd.zone_name ?? '—'}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(herd.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-300 hover:text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
