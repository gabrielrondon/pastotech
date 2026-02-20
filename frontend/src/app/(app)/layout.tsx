import { Sidebar } from '@/components/layout/sidebar'
import { Providers } from '@/app/providers'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <div className="relative flex-shrink-0">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </Providers>
  )
}
