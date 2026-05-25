import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, loadTheme } from './lib/enterprise.js'

// Apply persisted theme as early as possible to avoid a flash of light-theme.
applyTheme(loadTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
