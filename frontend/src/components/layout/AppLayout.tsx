import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { Breadcrumb } from './Breadcrumb'

/**
 * Main authenticated layout emulating the UET OASIS look:
 * a top horizontal navbar + breadcrumb bar + centered content area.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TopNav />
      <Breadcrumb />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
