import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import EjemploEspectro from './EjemploEspectro'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EjemploEspectro />
  </StrictMode>,
)