import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root'
import { bootstrapTheme } from './theme/ThemeContext'

// Before React mounts, so a stored light preference never flashes dark first.
bootstrapTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
