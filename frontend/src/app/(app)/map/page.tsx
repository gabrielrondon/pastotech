'use client'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Animal, Zone } from '@/types'

const FarmMap = dynamic(() => import('@/components/map/FarmMap'), { ssr: false })

export default function MapPage() {
  const farmId = useAuthStore((s) => s.farm?.id ?? '')

  const { data: animals = [] } = useQuery<Animal[]>({
    queryKey: ['animals'],
    queryFn: () => api.get('/animals').then((r) => r.data.data ?? []),
    enabled: !!farmId,
  })

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ['zones'],
    queryFn: () => api.get('/zones').then((r) => r.data.data ?? []),
    enabled: !!farmId,
  })

  return (
    <div className="h-[calc(100vh-0px)] w-full p-4">
      <FarmMap
        farmId={farmId}
        animals={animals}
        zones={zones}
        keyPoints={[]}
      />
    </div>
  )
}
