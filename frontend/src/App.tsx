import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<GeneratePage />} />
            <Route path="/studio" element={<DatasetStudioPage />} />
            <Route path="/loras" element={<LoRAsPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}

export default App
