// =============================================================================
//  useSeismic.js  —  INERTIX
//  Lógica de parseo, delimitación y estado del registro sísmico
//  Soporta: 1 columna, 2 columnas, multi-columna, horizontal (wrapped)
// =============================================================================

import { useState, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
//  Constantes de formato
// ---------------------------------------------------------------------------
export const FORMAT_TYPES = [
  { id: 'single',     label: 'Una aceleración por línea' },
  { id: 'time_accel', label: 'Tiempo + Aceleración por línea' },
  { id: 'multi_col',  label: 'Múltiples columnas (elegir cuál)' },
  { id: 'horizontal', label: 'Múltiples valores por línea (horizontal)' },
]

export const DECIMAL_SEPS = [
  { id: 'dot',   label: 'Punto  ( 0.001 )', char: '.' },
  { id: 'comma', label: 'Coma  ( 0,001 )',  char: ',' },
]

export const COL_SEPS = [
  { id: 'space', label: 'Espacio / Tabulación', regex: /[\s\t]+/ },
  { id: 'comma', label: 'Coma  ( , )',          regex: /,/ },
  { id: 'semi',  label: 'Punto y coma  ( ; )',  regex: /;/ },
]

// ---------------------------------------------------------------------------
//  Funciones de parseo
// ---------------------------------------------------------------------------
function normalizeDecimal(line, decSep) {
  if (decSep === 'comma') {
    // Reemplazar coma decimal por punto
    return line.replace(/,/g, '.')
  }
  return line
}

function splitLine(line, colSep, decSep) {
  // Primero normalizar decimales
  let s = normalizeDecimal(line.trim(), decSep)
  // Luego separar columnas
  const sep = COL_SEPS.find(c => c.id === colSep)
  const parts = s.split(sep ? sep.regex : /[\s\t]+/).filter(p => p.length > 0)
  return parts.map(Number).filter(n => !isNaN(n))
}

function isNumericLine(line, colSep, decSep) {
  const parts = splitLine(line, colSep, decSep)
  return parts.length > 0
}

export function detectDataRange(rawLines, colSep, decSep) {
  let start = -1, end = -1
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim() && isNumericLine(rawLines[i], colSep, decSep)) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) { start = 0; end = 0 }
  return { start, end }
}

function detectNumColumns(rawLines, start, end, colSep, decSep) {
  let maxCols = 0
  const sampleEnd = Math.min(start + 10, end)
  for (let i = start; i <= sampleEnd; i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > maxCols) maxCols = parts.length
  }
  return maxCols
}

export function autoDetectFormat(rawLines, start, end, colSep, decSep) {
  const nCols = detectNumColumns(rawLines, start, end, colSep, decSep)
  if (nCols >= 5) return { format: 'horizontal', accelCol: 1, timeCol: 1, nCols }
  if (nCols === 1) return { format: 'single', accelCol: 1, timeCol: 1, nCols }
  if (nCols === 2) return { format: 'time_accel', accelCol: 2, timeCol: 1, nCols }
  return { format: 'multi_col', accelCol: 2, timeCol: 1, nCols }
}

// ---------------------------------------------------------------------------
//  Parsear datos según configuración del modal
// ---------------------------------------------------------------------------
export function parseFileData(rawLines, config) {
  const {
    userStart, userEnd, format, accelCol, timeCol,
    colSep, decSep, scaleFactor, manualDt, unitFactor
  } = config

  const accelArr = []
  const accelRawArr = []
  const timeArr = []

  const factor = unitFactor * scaleFactor

  if (format === 'horizontal') {
    // Todos los valores son aceleraciones, leídos de izquierda a derecha
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      for (const val of parts) {
        accelRawArr.push(val)
        accelArr.push(val * factor)
      }
    }
  } else if (format === 'single') {
    // 1 valor por línea = aceleración
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (!parts.length) continue
      accelRawArr.push(parts[0])
      accelArr.push(parts[0] * factor)
    }
  } else if (format === 'time_accel') {
    // 2 columnas: tiempo + aceleración
    const tIdx = (timeCol || 1) - 1
    const aIdx = (accelCol || 2) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length < 2) continue
      timeArr.push(parts[tIdx] !== undefined ? parts[tIdx] : 0)
      accelRawArr.push(parts[aIdx] !== undefined ? parts[aIdx] : 0)
      accelArr.push((parts[aIdx] !== undefined ? parts[aIdx] : 0) * factor)
    }
  } else if (format === 'multi_col') {
    // Múltiples columnas, usuario elige cuál es aceleración y cuál tiempo
    const aIdx = (accelCol || 2) - 1
    const tIdx = (timeCol || 1) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length <= aIdx) continue
      if (parts[tIdx] !== undefined) timeArr.push(parts[tIdx])
      accelRawArr.push(parts[aIdx])
      accelArr.push(parts[aIdx] * factor)
    }
  }

  // Detectar dt
  let dt = manualDt
  let dtDetected = false
  if (timeArr.length >= 2) {
    dt = timeArr[1] - timeArr[0]
    dtDetected = true
  }

  return {
    accelArr, accelRawArr, timeArr,
    dt, dtDetected,
    hasTime: timeArr.length >= 2,
    npts: accelArr.length,
  }
}

// ---------------------------------------------------------------------------
//  Exportar resultados a .txt
// ---------------------------------------------------------------------------
export function exportTxt(periods, Sa, dampings, fileName, newmarkType, unit) {
  const nm = newmarkType === 0
    ? 'Aceleración Constante (beta=1/4, gamma=1/2)'
    : 'Aceleración Lineal (beta=1/6, gamma=1/2)'
  const W = 22
  const pad = (s, w) => String(s).padEnd(w)

  let t = '# ============================================================\n'
  t += '# INERTIX - Espectro de Pseudoaceleración\n'
  t += `# Método: Newmark-Beta - ${nm}\n`
  t += `# Registro: ${fileName}\n`
  t += `# Unidad: ${unit}\n`
  t += `# Curvas xi (%): ${dampings.join('  ')}\n`
  t += '# ============================================================\n#\n'
  t += pad('# Periodo(s)', W)
  dampings.forEach(d => { t += pad(`Sa_xi=${d}%[cm/s2]`, W) })
  t += '\n'
  t += '# ' + '-'.repeat(W * (dampings.length + 1) - 2) + '\n'

  for (let i = 0; i < periods.length; i++) {
    t += pad(periods[i].toFixed(8), W)
    Sa.forEach(c => { t += pad(c[i].toFixed(8), W) })
    t += '\n'
  }

  const blob = new Blob([t], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'espectro_respuesta.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
//  Hook principal
// ---------------------------------------------------------------------------
export function useSeismic() {
  const [rawLines,      setRawLines]      = useState([])
  const [fileName,      setFileName]      = useState(null)
  const [fileInfo,      setFileInfo]      = useState(null)
  const [accelChart,    setAccelChart]    = useState(null)
  const [status,        setStatus]        = useState(null)
  const [showModal,     setShowModal]     = useState(false)

  const parsedRef = useRef({ accel: null, dt: null })

  // -------------------------------------------------------------------------
  //  Cargar archivo — solo lee las líneas, abre el modal
  // -------------------------------------------------------------------------
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setAccelChart(null)
    setFileInfo(null)
    setStatus(null)
    parsedRef.current = { accel: null, dt: null }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/)
      setRawLines(lines)
      setShowModal(true)  // Abre el modal de configuración
    }
    reader.readAsText(file)
  }, [])

  // -------------------------------------------------------------------------
  //  Aplicar configuración del modal y parsear
  // -------------------------------------------------------------------------
  const applyConfig = useCallback((config) => {
    const result = parseFileData(rawLines, config)

    if (!result.accelArr.length) {
      setFileInfo(null)
      setAccelChart(null)
      parsedRef.current = { accel: null, dt: null }
      setStatus({ type: 'error', msg: 'No se encontraron datos numéricos con esta configuración.' })
      setShowModal(false)
      return
    }

    parsedRef.current = { accel: result.accelArr, dt: result.dt }

    // Downsample para gráfica (máx 2000 puntos)
    const step = Math.max(1, Math.floor(result.accelRawArr.length / 2000))
    const chart = []
    for (let i = 0; i < result.accelRawArr.length; i += step) {
      chart.push({
        t: parseFloat((i * result.dt).toFixed(4)),
        a: parseFloat(result.accelRawArr[i].toFixed(6))
      })
    }

    setAccelChart(chart)
    setFileInfo({
      npts: result.npts,
      dt: result.dt.toFixed(6),
      dtDetected: result.dtDetected,
      hasTime: result.hasTime,
      format: config.format,
    })
    setStatus(null)
    setShowModal(false)
  }, [rawLines])

  return {
    rawLines, fileName, fileInfo, accelChart,
    status, setStatus, parsedRef,
    showModal, setShowModal,
    handleFile, applyConfig,
  }
}
