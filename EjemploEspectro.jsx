// =============================================================================
//  EjemploEspectro.jsx  —  Componente de ejemplo para usar useNewmark
//
//  Muestra como:
//    1. Parsear un .txt de registro sismico
//    2. Llamar al nucleo WASM
//    3. Recibir periods[] y Sa[][] listos para graficar
// =============================================================================

import { useState, useCallback } from 'react'
import { useNewmark } from './useNewmark'

// ---------------------------------------------------------------------------
//  Parseador de registro sismico (mismo criterio que el C++ de escritorio)
//  Soporta: 1 columna (solo accel) o 2 columnas (tiempo + accel)
//  Separadores: espacio, tabulacion, coma (decimal o separador)
// ---------------------------------------------------------------------------
function parseSeismicTxt(text, { unitFactor = 1, startLine = 0, endLine = null } = {}) {
  const lines = text.split(/\r?\n/)
  const end   = endLine !== null ? Math.min(endLine, lines.length - 1) : lines.length - 1

  const timeArr  = []
  const accelArr = []

  let twoColumns = null

  for (let i = startLine; i <= end; i++) {
    // Normalizar comas como decimales
    const raw = lines[i].replace(/,(?=\d)/g, '.').trim()
    if (!raw || !/^[-+]?\d/.test(raw)) continue

    const parts = raw.split(/[\s\t]+/).map(Number).filter((n) => !isNaN(n))
    if (parts.length === 0) continue

    if (twoColumns === null) twoColumns = parts.length >= 2

    if (twoColumns && parts.length >= 2) {
      timeArr.push(parts[0])
      accelArr.push(parts[1] * unitFactor)
    } else {
      accelArr.push(parts[0] * unitFactor)
    }
  }

  // Si 1 columna no hay tiempo; se detecta dt desde la app o por defecto 0.01
  return { time: twoColumns ? timeArr : null, accel: accelArr, twoColumns }
}

// Factores de conversion a cm/s²
const UNIT_FACTORS = {
  'cm/s2': 1,
  'm/s2' : 100,
  'g'    : 980.665,
}

// ---------------------------------------------------------------------------
//  Componente de ejemplo
// ---------------------------------------------------------------------------
export default function EjemploEspectro() {
  const { ready, loadError, computeSpectrum } = useNewmark()

  const [status,  setStatus]  = useState('Esperando archivo...')
  const [result,  setResult]  = useState(null)   // { periods, Sa, dampings }
  const [loading, setLoading] = useState(false)

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setStatus('Leyendo archivo...')

    try {
      const text = await file.text()

      // --- Parsear registro ---
      const { accel, twoColumns, time } = parseSeismicTxt(text, {
        unitFactor: UNIT_FACTORS['g'],   // <-- ajusta segun tu registro
      })

      if (accel.length < 2) {
        setStatus('Error: no se encontraron datos numericos.')
        setLoading(false)
        return
      }

      // dt: desde columna de tiempo o valor por defecto
      const dt = twoColumns && time?.length >= 2
        ? time[1] - time[0]
        : 0.01

      setStatus(`Calculando espectro... (${accel.length} puntos, dt=${dt.toFixed(4)}s)`)

      // --- Llamar al nucleo WASM ---
      const dampings = [0, 0.02, 0.05, 0.1]   // 0%, 2%, 5%, 10%

      const { periods, Sa, error } = await computeSpectrum({
        accel    : Float64Array.from(accel),
        dt,
        dampings,
        newmarkType: 0,      // 0 = aceleracion constante
        nPeriods   : 1000,
        TMin       : 0.01,
        TMax       : 10.0,
      })

      if (error) {
        setStatus(`Error WASM: ${error}`)
      } else {
        setResult({ periods, Sa, dampings })
        setStatus(`Espectro calculado. ${periods.length} periodos, ${dampings.length} curvas.`)
      }

    } catch (err) {
      setStatus(`Error inesperado: ${err.message}`)
    }

    setLoading(false)
  }, [computeSpectrum])

  // -------------------------------------------------------------------------
  //  Render minimo (sin dependencia de libreria de graficos)
  //  Conecta result.periods y result.Sa a Recharts, Chart.js, Plotly, etc.
  // -------------------------------------------------------------------------
  return (
    <div style={{ fontFamily: 'monospace', padding: 24 }}>
      <h2>INERTIX — Espectro de Respuesta (WASM)</h2>

      {loadError && (
        <p style={{ color: 'red' }}>Error cargando WASM: {loadError}</p>
      )}

      <p>Estado WASM: <strong>{ready ? '✅ listo' : '⏳ cargando...'}</strong></p>

      <input
        type="file"
        accept=".txt"
        disabled={!ready || loading}
        onChange={handleFile}
      />

      <p>{status}</p>

      {result && (
        <div>
          <p>Primeros 5 valores del espectro (xi=0%):</p>
          <table border="1" cellPadding="4">
            <thead>
              <tr>
                <th>T (s)</th>
                {result.dampings.map((d, i) => (
                  <th key={i}>Sa xi={d*100}% (cm/s²)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td>{result.periods[i].toFixed(4)}</td>
                  {result.Sa.map((curve, j) => (
                    <td key={j}>{curve[i].toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/*
            Para graficar conecta result.periods y result.Sa[i] a tu libreria:
            
            Recharts:
              <LineChart data={result.periods.map((t, i) => ({
                T: t,
                ...Object.fromEntries(result.Sa.map((c, j) => [`xi${j}`, c[i]]))
              }))}>
                <XAxis dataKey="T" />
                ...
              </LineChart>

            Chart.js:
              datasets: result.Sa.map((curve, i) => ({
                label: `xi=${result.dampings[i]*100}%`,
                data: Array.from(curve),
              }))

            Plotly:
              traces: result.Sa.map((curve, i) => ({
                x: Array.from(result.periods),
                y: Array.from(curve),
                name: `xi=${result.dampings[i]*100}%`,
              }))
          */}
        </div>
      )}
    </div>
  )
}
