import { useEffect } from 'react'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, useRouteError } from 'react-router-dom'
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AppShell } from './components/layout/AppShell'
import { GeneratePage } from './pages/GeneratePage'
import { LoRAsPage } from './pages/LoRAsPage'
import { TagsPage } from './pages/TagsPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { DatasetStudioPage } from './pages/DatasetStudioPage'
import { useGenerationStore } from './store/useGenerationStore'
import { API_CACHE_BUSTER, API_CACHE_MAX_AGE, createIndexedDBPersister } from './utils/queryCachePersister'
import { SettingsDraftBoundary } from './pages/SettingsPage/components/SettingsDraftBoundary'

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
      <Route index element={<GeneratePage />} />
      <Route path="/studio" element={<DatasetStudioPage />} />
      <Route path="/loras" element={<LoRAsPage />} />
      <Route path="/tags" element={<TagsPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings" element={<SettingsDraftBoundary><SettingsPage /></SettingsDraftBoundary>} />
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
