import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../frontend/src/index.css'
import App from '../../frontend/src/App'

// Baseline intentionally uses the real app tree and its real components.
// Visual comparison changes must live outside frontend/src.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
