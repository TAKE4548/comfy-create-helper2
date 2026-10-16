import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../frontend/src/index.css'
import { installOfflineTransport } from './offlineTransport'

// Install the network sandbox BEFORE evaluating App and its imported modules.
installOfflineTransport()

void import('../../frontend/src/App').then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  )
})
