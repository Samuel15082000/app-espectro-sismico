// =============================================================================
//  useSeismic.js  —  INERTIX
//  Lógica de parseo, delimitación y estado del registro sísmico
// =============================================================================

import { useState, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
//  Utilidades de parseo
// ---------------------------------------------------------------------------
function normalizeLine(line) {
  return line.replace(/,(?=\d)/g, '.').replace(/,/g, ' ')
}

function isNumericLine(line) {
  const s = normalizeLine(line).trim()
  return s ? /^[-+]?\d/.test(s) : false
}

function parseLine(line) {
  return normalizeLine(line).trim().split(/[\s\t]+/).map(Number).filter(n => !isNaN(n))
}

export function detectDataRange(rawLines) {
  let start = -1, end = -1
  for (let i = 0; i < rawLines.length; i++) {
    if (isNumericLine(rawLines[i])) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) { start = 0; end = 0 }
  return { start, end }
}

function loadData(rawLines, userStart, userEnd, unitFactor) {
  const timeArr = [], accelArr = [], accelRawArr = []
  let twoColumns = null

  for (let i = userStart; i <= userEnd; i++) {
    const line = rawLines[i]
    if (!line || !isNumericLine(line)) continue
    const parts = parseLine(line)
    if (!parts.length) continue
    if (twoColumns === null) twoColumns = parts.length >= 2

    if (twoColumns && parts.length >= 2) {
      timeArr.push(parts[0])
      accelRawArr.push(parts[1])
      accelArr.push(parts[1] * unitFactor)
    } else if (!twoColumns) {
      accelRawArr.push(parts[0])
      accelArr.push(parts[0] * unitFactor)
    }
  }

  return { timeArr, accelArr, accelRawArr, twoColumns: !!twoColumns }
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
export function useSeismic({ unitFactor, manualDt }) {
  const [rawLines,      setRawLines]      = useState([])
  const [fileName,      setFileName]      = useState(null)
  const [detectedRange, setDetectedRange] = useState(null)
  const [userStart,     setUserStart]     = useState(0)
  const [userEnd,       setUserEnd]       = useState(0)
  const [fileInfo,      setFileInfo]      = useState(null)
  const [accelChart,    setAccelChart]    = useState(null)
  const [status,        setStatus]        = useState(null)

  // Referencia con datos parseados listos para el WASM
  const parsedRef = useRef({ accel: null, dt: null })

  // -------------------------------------------------------------------------
  //  Re-parsear archivo con parámetros actuales
  // -------------------------------------------------------------------------
  const reparseFile = useCallback((lines, start, end, factor, twoCol, dtM) => {
    const { timeArr, accelArr, accelRawArr, twoColumns } = loadData(lines, start, end, factor)

    if (!accelArr.length) {
      setFileInfo(null)
      setAccelChart(null)
      parsedRef.current = { accel: null, dt: null }
      setStatus({ type: 'error', msg: 'No se encontraron datos numéricos en el rango indicado.' })
      return
    }

    const tw = twoCol !== undefined ? twoCol : twoColumns
    const dt = tw && timeArr.length >= 2 ? timeArr[1] - timeArr[0] : dtM

    parsedRef.current = { accel: accelArr, dt }

    // Downsample para gráfica (máx 2000 puntos)
    const step = Math.max(1, Math.floor(accelArr.length / 2000))
    const chart = []
    for (let i = 0; i < accelRawArr.length; i += step) {
      chart.push({
        t: parseFloat((i * dt).toFixed(3)),
        a: parseFloat(accelRawArr[i].toFixed(4))
      })
    }

    setAccelChart(chart)
    setFileInfo({ npts: accelArr.length, twoColumns: tw, dt: dt.toFixed(5) })
    setStatus(null)
  }, [])

  // -------------------------------------------------------------------------
  //  Cargar archivo desde input
  // -------------------------------------------------------------------------
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setAccelChart(null)
    setFileInfo(null)
    setStatus(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/)
      setRawLines(lines)

      const range = detectDataRange(lines)
      setDetectedRange(range)
      setUserStart(range.start)
      setUserEnd(range.end)

      reparseFile(lines, range.start, range.end, unitFactor, undefined, manualDt)
    }
    reader.readAsText(file)
  }, [unitFactor, manualDt, reparseFile])

  // -------------------------------------------------------------------------
  //  Cambiar rango de líneas
  // -------------------------------------------------------------------------
  const applyRange = useCallback((start, end) => {
    setUserStart(start)
    setUserEnd(end)
    if (!rawLines.length) return
    reparseFile(rawLines, start, end, unitFactor, undefined, manualDt)
  }, [rawLines, unitFactor, manualDt, reparseFile])

  // -------------------------------------------------------------------------
  //  Cambiar unidad (re-parsea)
  // -------------------------------------------------------------------------
  const applyUnit = useCallback((factor) => {
    if (!rawLines.length) return
    reparseFile(rawLines, userStart, userEnd, factor, undefined, manualDt)
  }, [rawLines, userStart, userEnd, manualDt, reparseFile])

  // -------------------------------------------------------------------------
  //  Cambiar dt manual (solo 1 columna)
  // -------------------------------------------------------------------------
  const applyDt = useCallback((dt) => {
    if (!rawLines.length || fileInfo?.twoColumns) return
    reparseFile(rawLines, userStart, userEnd, unitFactor, false, dt)
  }, [rawLines, userStart, userEnd, unitFactor, fileInfo, reparseFile])

  return {
    // Estado
    rawLines, fileName, detectedRange,
    userStart, userEnd,
    fileInfo, accelChart,
    status, setStatus,
    parsedRef,
    // Acciones
    handleFile,
    applyRange,
    applyUnit,
    applyDt,
  }
}
