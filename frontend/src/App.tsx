import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, useRouteError } from 'react-router-dom'
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AppShell } from './components/layout/AppShell'
import { RouteLoadFallback } from './components/common/LazyBoundary'
import { useGenerationStore } from './store/useGenerationStore'
import { API_CACHE_BUSTER, API_CACHE_MAX_AGE, createIndexedDBPersister } from './utils/queryCachePersister'
import { SettingsDraftBoundary } from './pages/SettingsPage/components/SettingsDraftBoundary'

const GeneratePage = lazy(() => import('./pages/GeneratePage').then((m) => ({ default: m.GeneratePage })))
const DatasetStudioPage = lazy(() => import('./pages/DatasetStudioPage').then((m) => ({ default: m.DatasetStudioPage })))
const LoRAsPage = lazy(() => import('./pages/LoRAsPage').then((m) => ({ default: m.LoRAsPage })))
const TagsPage = lazy(() => import('./pages/TagsPage').then((m) => ({ default: m.TagsPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const withRouteSuspense = (page: ReactNode) => <Suspense fallback={<RouteLoadFallback />}>{page}</Suspense>

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 10, // 10分
    },
  },
})

const persister = createIndexedDBPersister()
const excludedQueryKeys = ['comfy-object-info', 'snapshots', 'workflow-presets', 'prompt-metadata']

function RethrowRouteError(): never {
  throw useRouteError()
}

export function createAppRoutes() {
  return createRoutesFromElements(
    <Route element={<AppShell />} errorElement={<RethrowRouteError />}>
      <Route index element={withRouteSuspense(<GeneratePage />)} />
      <Route path="/studio" element={withRouteSuspense(<DatasetStudioPage />)} />
      <Route path="/loras" element={withRouteSuspense(<LoRAsPage />)} />
      <Route path="/tags" element={withRouteSuspense(<TagsPage />)} />
      <Route path="/history" element={withRouteSuspense(<HistoryPage />)} />
      <Route path="/settings" element={<SettingsDraftBoundary>{withRouteSuspense(<SettingsPage />)}</SettingsDraftBoundary>} />
    </Route>,
  )
}

const router = createBrowserRouter(createAppRoutes())

function App() {
  const initializeStore = useGenerationStore((state) => state.initialize)

  useEffect(() => {
    initializeStore()
  }, [initializeStore])

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: API_CACHE_MAX_AGE,
        buster: API_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && !excludedQueryKeys.includes(String(query.queryKey[0])),
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  )
}

export default App
