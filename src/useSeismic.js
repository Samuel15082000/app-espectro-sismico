// =============================================================================
//  useSeismic.js  —  INERTIX
//  Parseo de registros sísmicos con detección automática de bloques
// =============================================================================

import { useState, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
//  Constantes exportadas
// ---------------------------------------------------------------------------
export const FORMAT_TYPES = [
  { id: 'single',     label: 'Una aceleración por línea' },
  { id: 'time_accel', label: 'Tiempo + Aceleración (2 cols)' },
  { id: 'multi_col',  label: 'Tiempo + varias acels. (elegir columna)' },
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
//  Parseo base
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

export function splitLine(line, colSep, decSep) {
  let s = line.trim()
  if (!s) return []
  if (colSep === 'semi') {
    return s.split(/;+/).filter(p => p.trim())
      .map(p => Number(normalizeDecimal(p.trim(), decSep))).filter(n => !isNaN(n))
  }
  if (colSep === 'comma' && decSep === 'dot') {
    return s.split(/,+/).filter(p => p.trim())
      .map(p => Number(p.trim())).filter(n => !isNaN(n))
  }
  s = normalizeDecimal(s, decSep)
  return s.split(getColRegex(colSep)).filter(p => p).map(Number).filter(n => !isNaN(n))
}

// ---------------------------------------------------------------------------
//  Clasificador de líneas — estricto
//  Rechaza: no-ASCII (α β ≔ ―), cualquier letra salvo e/E, chars de fórmula
// ---------------------------------------------------------------------------
function isProbablyNumericLine(line) {
  const s = line.trim()
  if (!s) return false
  if (/^[#%!$*\/;]/.test(s)) return false
  // No-ASCII → fórmulas, texto especial, binarios
  if (/[^\x00-\x7F]/.test(s)) return false
  // Cualquier letra excepto e/E (notación científica)
  if (/[a-df-zA-DF-Z]/.test(s)) return false
  // Caracteres de fórmula / ecuación
  if (/[=<>()\[\]{}_%@&]/.test(s)) return false
  if (!/\d/.test(s)) return false
  const norm = s.replace(/[,;]/g, ' ')
  return norm.trim().split(/\s+/).some(p => p !== '' && !isNaN(Number(p)))
}

// ---------------------------------------------------------------------------
//  DETECCIÓN DE BLOQUES
//  Encuentra grupos contiguos de líneas numéricas separados por texto/comentarios.
//  Tolera hasta MAX_BLANK_GAP líneas en blanco DENTRO de un bloque.
// ---------------------------------------------------------------------------
export function detectBlocks(rawLines) {
  const blocks = []
  let blockStart = -1
  let lastNumeric = -1
  let blankRun = 0
  const MAX_BLANK_GAP = 2

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()

    if (!trimmed) {
      if (blockStart !== -1) {
        blankRun++
        if (blankRun > MAX_BLANK_GAP) {
          if (lastNumeric >= blockStart) blocks.push({ start: blockStart, end: lastNumeric })
          blockStart = -1; lastNumeric = -1; blankRun = 0
        }
      }
    } else if (isProbablyNumericLine(trimmed)) {
      if (blockStart === -1) blockStart = i
      lastNumeric = i
      blankRun = 0
    } else {
      // Línea de texto/comentario → cierra el bloque actual
      if (blockStart !== -1 && lastNumeric >= blockStart) {
        blocks.push({ start: blockStart, end: lastNumeric })
      }
      blockStart = -1; lastNumeric = -1; blankRun = 0
    }
  }

  if (blockStart !== -1 && lastNumeric >= blockStart) {
    blocks.push({ start: blockStart, end: lastNumeric })
  }

  return blocks
}

// ---------------------------------------------------------------------------
//  Detección de separadores — método por puntuación
//  Prueba las 5 combinaciones válidas y elige la que parsea más líneas
//  con columnas consistentes. Más robusto que heurísticas manuales.
// ---------------------------------------------------------------------------
function autoDetectSeparators(rawLines, sampleStart, sampleEnd) {
  // Recoger hasta 40 líneas numéricas de muestra
  const sampleLines = []
  const limit = Math.min(sampleEnd, sampleStart + 60)
  for (let i = sampleStart; i <= limit && sampleLines.length < 40; i++) {
    const t = rawLines[i]?.trim()
    if (t) sampleLines.push(t)
  }
  if (sampleLines.length === 0) return { colSep: 'space', decSep: 'dot' }

  // Combinaciones válidas — NO existe colSep=comma con decSep=comma
  // Orden: primero las más comunes (preferencia de desempate)
  const combos = [
    { colSep: 'space', decSep: 'dot'   },
    { colSep: 'space', decSep: 'comma' },
    { colSep: 'comma', decSep: 'dot'   },
    { colSep: 'semi',  decSep: 'dot'   },
    { colSep: 'semi',  decSep: 'comma' },
  ]

  let best = combos[0], bestScore = -1

  for (const combo of combos) {
    const counts = {}
    let parsed = 0
    for (const line of sampleLines) {
      const n = splitLine(line, combo.colSep, combo.decSep).length
      if (n > 0) { counts[n] = (counts[n] || 0) + 1; parsed++ }
    }
    if (parsed === 0) continue

    // Puntuación = fracción de líneas que coinciden con la columna más frecuente
    // Un archivo bien formado tiene casi todas las líneas con el mismo nCols
    const maxConsistent = Math.max(...Object.values(counts))
    const score = maxConsistent / sampleLines.length

    if (score > bestScore) { bestScore = score; best = combo }
  }

  return best
}

function detectColumnCount(rawLines, start, end, colSep, decSep) {
  const counts = {}
  const sampleEnd = Math.min(start + 30, end)
  for (let i = start; i <= sampleEnd; i++) {
    const n = splitLine(rawLines[i], colSep, decSep).length
    if (n > 0) counts[n] = (counts[n] || 0) + 1
  }
  let maxCount = 0, maxCols = 1
  for (const [cols, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; maxCols = Number(cols) }
  }
  return maxCols
}

// Una columna es "tiempo" si cumple las tres propiedades físicas del tiempo:
//   1. Todos los valores >= 0  (el tiempo nunca es negativo)
//   2. Monótonamente creciente
//   3. Diferencias aproximadamente constantes (dt uniforme, CV < 2%)
// Esto evita confundir aceleraciones que accidentalmente suben con tiempo.
function isTimeColumn(rawLines, start, end, colSep, decSep, colIdx) {
  const vals = []
  const sampleEnd = Math.min(start + 60, end)
  for (let i = start; i <= sampleEnd; i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > colIdx) { vals.push(parts[colIdx]); if (vals.length >= 15) break }
  }
  if (vals.length < 3) return false
  // 1. Sin valores negativos
  if (vals.some(v => v < 0)) return false
  // 2. Creciente
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] <= vals[i - 1]) return false
  }
  // 3. dt uniforme
  const diffs = []
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1])
  const meanDt = diffs.reduce((a, b) => a + b, 0) / diffs.length
  if (meanDt <= 0) return false
  const maxDev = Math.max(...diffs.map(d => Math.abs(d - meanDt)))
  return maxDev / meanDt < 0.02  // dt constante dentro del 2%
}

function detectDtFromColumn(rawLines, start, end, colSep, decSep, colIdx) {
  const vals = []
  for (let i = start; i <= Math.min(start + 10, end); i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > colIdx) { vals.push(parts[colIdx]); if (vals.length >= 3) break }
  }
  if (vals.length >= 2) { const d = vals[1] - vals[0]; return d > 0 ? d : 0.01 }
  return 0.01
}

// ---------------------------------------------------------------------------
//  ANALIZAR UN BLOQUE
//  Devuelve configuración auto-detectada + info del último/primer valor
// ---------------------------------------------------------------------------
export function analyzeBlock(rawLines, start, end) {
  const { colSep, decSep } = autoDetectSeparators(rawLines, start, end)
  const nCols = detectColumnCount(rawLines, start, end, colSep, decSep)

  let format = 'single', accelCol = 1, timeCol = 1, dt = 0.01, dtDetected = false, hasTimeCol = false

  if (nCols >= 6) {
    format = 'horizontal'
  } else if (nCols === 1) {
    format = 'single'
  } else if (nCols === 2) {
    if (isTimeColumn(rawLines, start, end, colSep, decSep, 0)) {
      format = 'time_accel'; timeCol = 1; accelCol = 2; hasTimeCol = true
      dt = detectDtFromColumn(rawLines, start, end, colSep, decSep, 0); dtDetected = true
    } else {
      format = 'multi_col'; accelCol = 1; hasTimeCol = false
    }
  } else if (nCols >= 3 && nCols <= 5) {
    if (isTimeColumn(rawLines, start, end, colSep, decSep, 0)) {
      format = 'multi_col'; timeCol = 1; accelCol = 2; hasTimeCol = true
      dt = detectDtFromColumn(rawLines, start, end, colSep, decSep, 0); dtDetected = true
    } else {
      format = 'multi_col'; accelCol = 1; hasTimeCol = false
    }
  }

  const nLines = end - start + 1
  const npts = format === 'horizontal' ? nLines * nCols : nLines

  // Último valor válido
  let lastLineText = '', lastLineNum = end + 1, lastParsed = []
  for (let i = end; i >= start; i--) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > 0) {
      lastLineText = rawLines[i].trim()
      lastLineNum  = i + 1   // 1-indexado para el usuario
      lastParsed   = parts
      break
    }
  }

  // Primer valor válido
  let firstParsed = []
  for (let i = start; i <= Math.min(start + 5, end); i++) {
    const parts = splitLine(rawLines[i], colSep, decSep)
    if (parts.length > 0) { firstParsed = parts; break }
  }

  return {
    start, end, colSep, decSep, nCols, format,
    accelCol, timeCol, dt, dtDetected, hasTimeCol,
    npts, lastLineText, lastLineNum, lastParsed, firstParsed,
  }
}

// ---------------------------------------------------------------------------
//  AUTO-DETECCIÓN COMPLETA
// ---------------------------------------------------------------------------
export function autoDetectAll(rawLines) {
  const blocks = detectBlocks(rawLines)

  if (blocks.length === 0) {
    return {
      blocks: [],
      selectedBlockIdx: 0,
      colSep: 'space', decSep: 'dot',
      start: 0, end: Math.max(0, rawLines.length - 1),
      nCols: 1, format: 'single',
      accelCol: 1, timeCol: 1, dt: 0.01, dtDetected: false,
      npts: 0, lastLineText: '', lastLineNum: 0, lastParsed: [], firstParsed: [],
    }
  }

  // Bloque por defecto: el más grande
  const defaultIdx = blocks.reduce(
    (best, b, i) => (b.end - b.start > blocks[best].end - blocks[best].start ? i : best), 0
  )

  // Info resumida de cada bloque (para el selector)
  const blocksInfo = blocks.map((b, i) => {
    const { colSep, decSep } = autoDetectSeparators(rawLines, b.start, b.end)
    const nCols   = detectColumnCount(rawLines, b.start, b.end, colSep, decSep)
    const nLines  = b.end - b.start + 1
    const npts    = nCols >= 6 ? nLines * nCols : nLines
    const fmtGuess = nCols >= 6 ? 'horizontal' : nCols === 1 ? 'single' : nCols === 2 ? 'time_accel' : 'multi_col'

    let lastLineText = '', lastLineNum = b.end + 1, lastParsed = []
    for (let j = b.end; j >= b.start; j--) {
      const parts = splitLine(rawLines[j], colSep, decSep)
      if (parts.length > 0) {
        lastLineText = rawLines[j].trim(); lastLineNum = j + 1; lastParsed = parts; break
      }
    }
    return { ...b, nCols, npts, fmtGuess, lastLineText, lastLineNum, lastParsed, index: i }
  })

  const analysis = analyzeBlock(rawLines, blocks[defaultIdx].start, blocks[defaultIdx].end)
  return { blocks: blocksInfo, selectedBlockIdx: defaultIdx, ...analysis }
}

// ---------------------------------------------------------------------------
//  PARSEAR DATOS SEGÚN CONFIGURACIÓN
// ---------------------------------------------------------------------------
export function parseFileData(rawLines, config) {
  const {
    userStart, userEnd, format, accelCol, timeCol,
    colSep, decSep, scaleFactor, manualDt, unitFactor,
  } = config
  const accelArr = [], accelRawArr = [], timeArr = []
  const factor = unitFactor * scaleFactor

  if (format === 'horizontal') {
    for (let i = userStart; i <= userEnd; i++) {
      for (const val of splitLine(rawLines[i], colSep, decSep)) {
        accelRawArr.push(val); accelArr.push(val * factor)
      }
    }
  } else if (format === 'single') {
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (!parts.length) continue
      accelRawArr.push(parts[0]); accelArr.push(parts[0] * factor)
    }
  } else if (format === 'time_accel') {
    const tIdx = (timeCol || 1) - 1, aIdx = (accelCol || 2) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length < 2) continue
      if (parts[tIdx] !== undefined) timeArr.push(parts[tIdx])
      const aVal = parts[aIdx] ?? 0
      accelRawArr.push(aVal); accelArr.push(aVal * factor)
    }
  } else if (format === 'multi_col') {
    const aIdx = (accelCol || 1) - 1, tIdx = (timeCol || 1) - 1
    for (let i = userStart; i <= userEnd; i++) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length <= aIdx) continue
      if (tIdx !== aIdx && parts.length > tIdx) timeArr.push(parts[tIdx])
      accelRawArr.push(parts[aIdx]); accelArr.push(parts[aIdx] * factor)
    }
  }

  let dt = manualDt, dtDetected = false
  if (timeArr.length >= 2) {
    const d = timeArr[1] - timeArr[0]
    if (d > 0) { dt = d; dtDetected = true }
  }

  return {
    accelArr, accelRawArr, timeArr,
    dt, dtDetected, hasTime: timeArr.length >= 2, npts: accelArr.length,
  }
}

// ---------------------------------------------------------------------------
//  EXPORTAR ESPECTRO TXT
// ---------------------------------------------------------------------------
export function exportTxt(periods, Sa, dampings, fileName, newmarkType, unit) {
  const nm = newmarkType === 0
    ? 'Aceleración Constante (beta=1/4, gamma=1/2)'
    : 'Aceleración Lineal (beta=1/6, gamma=1/2)'
  const W = 22, pad = (s, w) => String(s).padEnd(w)

  let t = '# ============================================================\n'
  t += '# INERTIX - Espectro de Pseudoaceleración\n'
  t += `# Método: Newmark-Beta - ${nm}\n`
  t += `# Registro: ${fileName}\n`
  t += `# Unidad entrada: ${unit}\n`
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
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
//  HOOK PRINCIPAL
// ---------------------------------------------------------------------------
export function useSeismic() {
  const [rawLines,       setRawLines]       = useState([])
  const [fileName,       setFileName]       = useState(null)
  const [fileInfo,       setFileInfo]       = useState(null)
  const [accelChart,     setAccelChart]     = useState(null)
  const [status,         setStatus]         = useState(null)
  const [showModal,      setShowModal]      = useState(false)
  const [detectedConfig, setDetectedConfig] = useState(null)
  const parsedRef = useRef({ accel: null, dt: null })

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setAccelChart(null); setFileInfo(null)
    setStatus(null); parsedRef.current = { accel: null, dt: null }

    // Rechazar tipos binarios/no-texto antes de leer
    const badType = /^(image|audio|video)\//.test(file.type)
      || ['application/pdf', 'application/msword',
          'application/vnd.', 'application/zip',
          'application/x-'].some(p => file.type.startsWith(p))
    const badExt = /\.(png|jpg|jpeg|gif|bmp|webp|svg|pdf|docx?|xlsx?|zip|rar|exe|bin)$/i.test(file.name)
    if (badType || badExt) {
      setStatus({ type: 'error', msg: `El archivo "${file.name}" no es un archivo de texto. Solo se aceptan archivos .txt, .csv o similares.` })
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/)
      setRawLines(lines)
      const detected = autoDetectAll(lines)
      if (detected.blocks.length === 0) {
        setStatus({ type: 'error', msg: 'No se encontraron datos numéricos en el archivo. Verifica que sea un registro sísmico válido.' })
        return
      }
      setDetectedConfig(detected)
      setShowModal(true)
    }
    reader.readAsText(file)
  }, [])

  const applyConfig = useCallback((config) => {
    const result = parseFileData(rawLines, config)
    if (!result.accelArr.length) {
      setFileInfo(null); setAccelChart(null)
      parsedRef.current = { accel: null, dt: null }
      setStatus({ type: 'error', msg: 'No se encontraron datos numéricos con esta configuración.' })
      setShowModal(false); return
    }
    // Guardamos también los valores crudos para poder re-escalar sin re-parsear
    parsedRef.current = {
      accel:     result.accelArr,
      accelRaw:  result.accelRawArr,
      scaleFactor: config.scaleFactor ?? 1,
      dt:        result.dt,
    }

    const step = Math.max(1, Math.floor(result.accelArr.length / 2000))
    const chart = []
    for (let i = 0; i < result.accelArr.length; i += step) {
      chart.push({
        t: parseFloat((i * result.dt).toFixed(4)),
        a: parseFloat(result.accelArr[i].toFixed(6)),   // valores ya escalados
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
    setStatus(null); setShowModal(false)
  }, [rawLines])

  // Recalcula accel y reconstruye el chart cuando cambia la unidad sin re-parsear el archivo
  const rescaleAccel = useCallback((newUnitFactor) => {
    const ref = parsedRef.current
    if (!ref.accelRaw?.length) return
    const newAccel = ref.accelRaw.map(v => v * newUnitFactor * (ref.scaleFactor ?? 1))
    parsedRef.current = { ...ref, accel: newAccel }
    const step = Math.max(1, Math.floor(newAccel.length / 2000))
    const chart = []
    for (let i = 0; i < newAccel.length; i += step) {
      chart.push({
        t: parseFloat((i * ref.dt).toFixed(4)),
        a: parseFloat(newAccel[i].toFixed(6)),
      })
    }
    setAccelChart(chart)
  }, [])

  return {
    rawLines, fileName, fileInfo, accelChart, setAccelChart,
    status, setStatus, parsedRef,
    showModal, setShowModal, detectedConfig,
    handleFile, applyConfig, rescaleAccel,
  }
}
