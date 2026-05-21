// =============================================================================
//  useSeismic.js  —  INERTIX
//  Lógica de parseo con auto-detección inteligente
// =============================================================================

import { useState, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
//  Constantes
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
  { id: 'space', label: 'Espacio / Tabulación' },
  { id: 'comma', label: 'Coma  ( , )' },
  { id: 'semi',  label: 'Punto y coma  ( ; )' },
]

// ---------------------------------------------------------------------------
//  Funciones de parseo base
// ---------------------------------------------------------------------------
function getColRegex(colSep) {
  if (colSep === 'comma') return /,+/
  if (colSep === 'semi')  return /;+/
  return /[\s\t]+/
}

function normalizeDecimal(text, decSep) {
  if (decSep === 'comma') return text.replace(/,/g, '.')
  return text
}

function splitLine(line, colSep, decSep) {
  let s = line.trim()
  if (!s) return []

  // Si el separador de columnas es coma pero también es el decimal → conflicto
  // En ese caso, primero separar por columnas y luego normalizar
  if (colSep === 'comma' && decSep === 'dot') {
    // Coma es separador de columnas, punto es decimal → normal
    return s.split(getColRegex(colSep)).filter(p => p.length > 0).map(p => Number(p.trim())).filter(n => !isNaN(n))
  }

  if (colSep === 'semi') {
    // Punto y coma separa columnas
    const parts = s.split(getColRegex(colSep)).filter(p => p.length > 0)
    return parts.map(p => Number(normalizeDecimal(p.trim(), decSep))).filter(n => !isNaN(n))
  }

  // Separador = espacio/tab
  // Primero normalizar decimal, luego separar por espacios
  s = normalizeDecimal(s, decSep)
  return s.split(getColRegex(colSep)).filter(p => p.length > 0).map(Number).filter(n => !isNaN(n))
}

function isNumericLine(line, colSep, decSep) {
  return splitLine(line, colSep, decSep).length > 0
}

// ---------------------------------------------------------------------------
//  AUTO-DETECCIÓN INTELIGENTE
// ---------------------------------------------------------------------------

// Detecta separador decimal y de columnas analizando el archivo
function autoDetectSeparators(rawLines, sampleStart, sampleEnd) {
  let hasSemicolons = false
  let hasTabs = false
  let hasCommasBetweenNumbers = false   // 1.23,4.56 → coma es separador
  let hasCommasAsDecimal = false        // 0,001 → coma es decimal
  let hasDots = false

  const end = Math.min(sampleEnd, sampleStart + 30)

  for (let i = sampleStart; i <= end; i++) {
    const line = rawLines[i]
    if (!line || !line.trim()) continue

    if (line.includes(';')) hasSemicolons = true
    if (line.includes('\t')) hasTabs = true
    if (line.includes('.')) hasDots = true

    // Analizar comas
    const commaMatches = line.matchAll(/(\d),(\d)/g)
    for (const m of commaMatches) {
      const before = line.substring(Math.max(0, m.index - 5), m.index + 1)
      const after = line.substring(m.index + 1, m.index + 7)

      // Si hay punto en el mismo número → coma es separador de columnas
      // Ej: "1.234,5.678"
      if (before.includes('.') || after.includes('.')) {
        hasCommasBetweenNumbers = true
      } else {
        // Mirar si hay 3 dígitos después de la coma (patrón decimal europeo)
        const afterComma = line.substring(m.index + 2, m.index + 10)
        const digitsAfter = afterComma.match(/^\d+/)
        if (digitsAfter && digitsAfter[0].length <= 3 && !afterComma.match(/^\d+[\s\t]/)) {
          // Podría ser decimal: 0,001 o 12,5
          hasCommasAsDecimal = true
        } else {
          hasCommasBetweenNumbers = true
        }
      }
    }
  }

  // Decidir separador de columnas
  let colSep = 'space'
  if (hasSemicolons) colSep = 'semi'
  else if (hasCommasBetweenNumbers && !hasCommasAsDecimal) colSep = 'comma'

  // Decidir separador decimal
  let decSep = 'dot'
  if (hasCommasAsDecimal && !hasDots && !hasCommasBetweenNumbers) decSep = 'comma'
  if (colSep === 'semi' && hasCommasAsDecimal) decSep = 'comma'  // ; para columnas, , para decimal

  return { colSep, decSep }
}

// Detecta rango de datos numéricos
export function detectDataRange(rawLines, colSep, decSep) {
  let start = -1, end = -1
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim() && isNumericLine(rawLines[i], colSep, decSep)) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) { start = 0; end = Math.max(0, rawLines.length - 1) }
  return { start, end }
}

// Cuenta columnas consistentes en una muestra
function detectColumnCount(rawLines, start, end, colSep, decSep) {
  const counts = {}
  const sampleEnd = Math.min(start + 20, end)
  for (let i = start; i <= sampleEnd; i++) {
    const n = splitLine(rawLines[i], colSep, decSep).length
    if (n > 0) counts[n] = (counts[n] || 0) + 1
  }
  // Columna más frecuente
  let maxCount = 0, maxCols = 1
  for (const [cols, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; maxCols = Number(cols) }
  }
  return maxCols
}

// Detecta si una columna es monótonamente creciente (→ probablemente tiempo)
function isMonotonicallyIncreasing(rawLines, start, end, colSep, decSep, colIdx) {
  let prev = -Infinity
  let count = 0
  const sampleEnd = Math.min(start + 50, end)
  for (let i = start; i <= sampleEnd; i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length <= colIdx) continue
    const val = parts[colIdx]
    if (val <= prev) return false
    prev = val
    count++
  }
  return count >= 3  // al menos 3 valores crecientes
}

// Detecta dt desde columna de tiempo
function detectDt(rawLines, start, end, colSep, decSep, colIdx) {
  const vals = []
  const sampleEnd = Math.min(start + 10, end)
  for (let i = start; i <= sampleEnd; i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > colIdx) vals.push(parts[colIdx])
    if (vals.length >= 3) break
  }
  if (vals.length >= 2) return vals[1] - vals[0]
  return 0.01
}

// Auto-detección completa del formato
export function autoDetectAll(rawLines) {
  // Paso 1: Encontrar primeras líneas numéricas para analizar separadores
  let firstNumeric = 0
  for (let i = 0; i < Math.min(rawLines.length, 50); i++) {
    if (rawLines[i].trim() && /[-+]?\d/.test(rawLines[i])) {
      firstNumeric = i; break
    }
  }

  // Paso 2: Detectar separadores
  const { colSep, decSep } = autoDetectSeparators(rawLines, firstNumeric, rawLines.length - 1)

  // Paso 3: Detectar rango de datos
  const range = detectDataRange(rawLines, colSep, decSep)

  // Paso 4: Contar columnas
  const nCols = detectColumnCount(rawLines, range.start, range.end, colSep, decSep)

  // Paso 5: Determinar formato
  let format = 'single'
  let accelCol = 1
  let timeCol = 1
  let dt = 0.01
  let dtDetected = false

  if (nCols >= 6) {
    // Muchos valores por línea → formato horizontal (wrapped)
    format = 'horizontal'
  } else if (nCols === 1) {
    format = 'single'
  } else if (nCols === 2) {
    // Checar si la primera columna es tiempo (monótonamente creciente)
    if (isMonotonicallyIncreasing(rawLines, range.start, range.end, colSep, decSep, 0)) {
      format = 'time_accel'
      timeCol = 1
      accelCol = 2
      dt = detectDt(rawLines, range.start, range.end, colSep, decSep, 0)
      dtDetected = true
    } else {
      // 2 columnas pero la primera no es tiempo → podría ser 2 aceleraciones
      format = 'multi_col'
      accelCol = 1
    }
  } else if (nCols >= 3 && nCols <= 5) {
    // Múltiples columnas: checar si la primera es tiempo
    if (isMonotonicallyIncreasing(rawLines, range.start, range.end, colSep, decSep, 0)) {
      format = 'multi_col'
      timeCol = 1
      accelCol = 2
      dt = detectDt(rawLines, range.start, range.end, colSep, decSep, 0)
      dtDetected = true
    } else {
      format = 'multi_col'
      accelCol = 1
    }
  }

  return {
    colSep, decSep,
    start: range.start, end: range.end,
    nCols, format,
    accelCol, timeCol,
    dt, dtDetected,
  }
}

// ---------------------------------------------------------------------------
//  Parsear datos según configuración
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
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      for (const val of parts) {
        accelRawArr.push(val)
        accelArr.push(val * factor)
      }
    }
  } else if (format === 'single') {
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (!parts.length) continue
      accelRawArr.push(parts[0])
      accelArr.push(parts[0] * factor)
    }
  } else if (format === 'time_accel') {
    const tIdx = (timeCol || 1) - 1
    const aIdx = (accelCol || 2) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length < 2) continue
      if (parts[tIdx] !== undefined) timeArr.push(parts[tIdx])
      const aVal = parts[aIdx] !== undefined ? parts[aIdx] : 0
      accelRawArr.push(aVal)
      accelArr.push(aVal * factor)
    }
  } else if (format === 'multi_col') {
    const aIdx = (accelCol || 1) - 1
    const tIdx = (timeCol || 1) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length <= aIdx) continue
      // Solo agregar tiempo si existe y es columna diferente a aceleración
      if (tIdx !== aIdx && parts.length > tIdx) timeArr.push(parts[tIdx])
      accelRawArr.push(parts[aIdx])
      accelArr.push(parts[aIdx] * factor)
    }
  }

  // Determinar dt
  let dt = manualDt
  let dtDetected = false
  if (timeArr.length >= 2) {
    const detectedDt = timeArr[1] - timeArr[0]
    if (detectedDt > 0) {
      dt = detectedDt
      dtDetected = true
    }
  }

  return {
    accelArr, accelRawArr, timeArr,
    dt, dtDetected,
    hasTime: timeArr.length >= 2,
    npts: accelArr.length,
  }
}

// ---------------------------------------------------------------------------
//  Exportar resultados
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
  t += '\n# ' + '-'.repeat(W * (dampings.length + 1) - 2) + '\n'

  for (let i = 0; i < periods.length; i++) {
    t += pad(periods[i].toFixed(8), W)
    Sa.forEach(c => { t += pad(c[i].toFixed(8), W) })
    t += '\n'
  }

  const blob = new Blob([t], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'espectro_respuesta.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
  const [detectedConfig, setDetectedConfig] = useState(null)

  const parsedRef = useRef({ accel: null, dt: null })

  // Cargar archivo → auto-detectar → abrir modal con valores pre-llenados
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

      // Auto-detección completa
      const detected = autoDetectAll(lines)
      setDetectedConfig(detected)
      setShowModal(true)
    }
    reader.readAsText(file)
  }, [])

  // Aplicar configuración del modal
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

    // Downsample para gráfica
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
    detectedConfig,
    handleFile, applyConfig,
  }
}
