import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../frontend/src/index.css'
import './comparison.css'

// Explicit query switch allows identical fixture, viewport and app for A/B captures.
document.documentElement.dataset.prototypeVariant = new URLSearchParams(location.search).get('ui') === 'proposal' ? 'proposal' : 'baseline'
import { installOfflineTransport } from './offlineTransport'

// Install the network sandbox BEFORE evaluating App and its imported modules.
installOfflineTransport()

void Promise.all([import('../../frontend/src/App'), import('../../frontend/src/store/useGenerationStore')]).then(([{ default: App }, { useGenerationStore }]) => {
  // Static sample metrics, not real hardware readings. Preserve the production monitor UI.
  useGenerationStore.getState().setSystemStats({
    cpu_pct: 23, ram_used_gb: 18.4, ram_total_gb: 64, ram_pct: 29,
    gpu_pct: 37, vram_used_gb: 9.2, vram_total_gb: 24, vram_pct: 38,
    vram_free_gb: 14.8, ts: Date.now(),
  })
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  )
})
