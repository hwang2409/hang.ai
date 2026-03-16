import Sidebar from './Sidebar'

export default function Layout({ children }) {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg">
        {children}
      </main>
    </div>
  )
}
