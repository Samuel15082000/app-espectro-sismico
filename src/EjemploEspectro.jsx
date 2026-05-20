// =============================================================================
//  EjemploEspectro.jsx  —  INERTIX Espectro de Respuesta Sísmica
//  Requiere: recharts  (npm install recharts)
// =============================================================================

import { useState, useCallback, useRef } from 'react'
import { useNewmark } from './useNewmark'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ---------------------------------------------------------------------------
//  Constantes
// ---------------------------------------------------------------------------
const UNIT_OPTIONS = [
  { label: 'cm/s²',  factor: 1 },
  { label: 'm/s²',   factor: 100 },
  { label: 'g',      factor: 980.665 },
  { label: 'Otro',   factor: null },   // factor manual
]
const DAMPING_COLORS = ['#F87171','#60A5FA','#34D399','#FBBF24','#A78BFA']
const DEFAULT_DAMPINGS = [0, 1, 2, 3, 5]

// ---------------------------------------------------------------------------
//  Detectar rango de datos numéricos en las líneas crudas
// ---------------------------------------------------------------------------
function normalizeLine(line) {
  return line.replace(/,(?=\d)/g, '.').replace(/,/g, ' ')
}

function isNumericLine(line) {
  const s = normalizeLine(line).trim()
  if (!s) return false
  return /^[-+]?\d/.test(s)
}

function parseLine(line) {
  const s = normalizeLine(line)
  const parts = s.trim().split(/[\s\t]+/).map(Number).filter(n => !isNaN(n))
  return parts
}

function detectDataRange(rawLines) {
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
//  Helpers de exportación
// ---------------------------------------------------------------------------
function exportTxt(periods, Sa, dampings, fileName, newmarkType, unit) {
  const nmStr = newmarkType === 0
    ? 'Aceleración Constante (beta=1/4, gamma=1/2)'
    : 'Aceleración Lineal (beta=1/6, gamma=1/2)'
  const W = 22
  const pad = (s, w) => String(s).padEnd(w)

  let txt = '# ============================================================\n'
  txt += '# INERTIX - Espectro de Pseudoaceleración\n'
  txt += `# Método: Newmark-Beta - ${nmStr}\n`
  txt += `# Registro  : ${fileName}\n`
  txt += `# Unidad entrada : ${unit}\n`
  txt += '# Unidades Sa    : cm/s²\n'
  txt += `# Curvas xi (%)  : ${dampings.join('  ')}\n`
  txt += '# ============================================================\n#\n'
  txt += pad('# Periodo(s)', W)
  dampings.forEach(d => { txt += pad(`Sa_xi=${d}%[cm/s2]`, W) })
  txt += '\n'
  txt += '# ' + '-'.repeat(W * (dampings.length + 1) - 2) + '\n'

  for (let t = 0; t < periods.length; t++) {
    txt += pad(periods[t].toFixed(8), W)
    Sa.forEach(curve => { txt += pad(curve[t].toFixed(8), W) })
    txt += '\n'
  }

  const blob = new Blob([txt], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'espectro_respuesta.txt'; a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
//  Estilos inline reutilizables
// ---------------------------------------------------------------------------
const css = {
  root:        { minHeight: '100vh', background: '#0D1117', color: '#E6EDF3', fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column', fontSize: 13 },
  header:      { background: '#161B22', borderBottom: '1px solid #30363D', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  logo:        { fontWeight: 700, fontSize: 14, color: '#58A6FF', letterSpacing: 1 },
  sep:         { color: '#30363D' },
  layout:      { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar:     { width: 300, minWidth: 300, background: '#161B22', borderRight: '1px solid #30363D', padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
  secLabel:    { fontSize: 10, color: '#E3B341', fontWeight: 700, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' },
  select:      { width: '100%', background: '#0D1117', border: '1px solid #30363D', color: '#E6EDF3', borderRadius: 5, padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' },
  inputFull:   { width: '100%', background: '#0D1117', border: '1px solid #30363D', color: '#E6EDF3', borderRadius: 5, padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' },
  inputSmall:  { width: 65, background: '#0D1117', border: '1px solid #30363D', color: '#E6EDF3', borderRadius: 4, padding: '4px 6px', fontSize: 13, textAlign: 'right' },
  inputNum:    { width: 80, background: '#0D1117', border: '1px solid #30363D', color: '#E6EDF3', borderRadius: 4, padding: '4px 6px', fontSize: 13, textAlign: 'right' },
  iconBtn:     { width: 22, height: 22, background: '#21262D', border: '1px solid #30363D', color: '#E6EDF3', borderRadius: 4, cursor: 'pointer', fontSize: 15, lineHeight: '20px', textAlign: 'center', flexShrink: 0, padding: 0 },
  row:         { display: 'flex', alignItems: 'center', gap: 8 },
  rowBetween:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  main:        { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  panel:       { flex: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', borderBottom: '1px solid #30363D', minHeight: 0 },
  panelLast:   { flex: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 },
  panelLabel:  { fontSize: 11, color: '#8B949E', marginBottom: 5, fontWeight: 500, flexShrink: 0 },
  empty:       { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#30363D', fontSize: 12 },
  hint:        (c) => ({ fontSize: 11, color: c || '#8B949E', marginTop: 4 }),
  calcBtn:     (on) => ({
    width: '100%', padding: '9px 0', borderRadius: 5, border: 'none',
    background: on ? '#1F6FEB' : '#21262D',
    color: on ? '#fff' : '#484F58',
    fontWeight: 700, fontSize: 12, cursor: on ? 'pointer' : 'not-allowed',
    letterSpacing: 0.6
  }),
  expBtn:      { width: '100%', padding: '7px 0', borderRadius: 5, border: '1px solid #30363D', background: '#21262D', color: '#E6EDF3', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  statusBox:   (t) => ({
    fontSize: 11, padding: '7px 9px', borderRadius: 5,
    background: t === 'error' ? '#2D1515' : t === 'success' ? '#0D2B1A' : '#1C2333',
    color:      t === 'error' ? '#F85149' : t === 'success' ? '#3FB950' : '#8B949E',
    border: `1px solid ${t === 'error' ? '#3D1F1F' : t === 'success' ? '#1A3D2B' : '#30363D'}`,
  }),
  divider:     { borderTop: '1px solid #21262D', margin: '2px 0' },
  fileBtn:     { display: 'block', border: '1px dashed #30363D', borderRadius: 5, padding: '8px 10px', cursor: 'pointer', textAlign: 'center', fontSize: 12, color: '#484F58', background: '#0D1117' },
}

const tpStyle = { contentStyle: { background: '#161B22', border: '1px solid #30363D', borderRadius: 5, fontSize: 11 } }

// ---------------------------------------------------------------------------
//  Componente principal
// ---------------------------------------------------------------------------
export default function EjemploEspectro() {
  const { ready, loadError, computeSpectrum } = useNewmark()

  // --- parámetros ---
  const [unitIdx,       setUnitIdx]       = useState(0)
  const [customFactor,  setCustomFactor]  = useState(1)
  const [newmarkType,   setNewmarkType]   = useState(0)
  const [nCurves,       setNCurves]       = useState(5)
  const [dampings,      setDampings]      = useState([...DEFAULT_DAMPINGS])
  const [nPeriods,      setNPeriods]      = useState(1000)
  const [TMin,          setTMin]          = useState(0.01)
  const [TMax,          setTMax]          = useState(10.0)
  const [manualDt,      setManualDt]      = useState(0.01)

  // --- estado del archivo ---
  const [rawLines,      setRawLines]      = useState([])
  const [fileName,      setFileName]      = useState(null)
  const [detectedRange, setDetectedRange] = useState(null)   // { start, end }
  const [userStart,     setUserStart]     = useState(0)
  const [userEnd,       setUserEnd]       = useState(0)
  const [fileInfo,      setFileInfo]      = useState(null)   // { npts, twoColumns, dt }
  const [accelChart,    setAccelChart]    = useState(null)   // datos para gráfica acelerograma

  // almacenamos accel parseada para recalcular sin recargar archivo
  const parsedRef = useRef({ accel: null, dt: null })

  // --- resultados ---
  const [result,        setResult]        = useState(null)
  const [status,        setStatus]        = useState(null)
  const [loading,       setLoading]       = useState(false)

  // -------------------------------------------------------------------------
  //  Obtener factor de conversión actual
  // -------------------------------------------------------------------------
  const getUnitFactor = useCallback(() => {
    const opt = UNIT_OPTIONS[unitIdx]
    return opt.factor !== null ? opt.factor : customFactor
  }, [unitIdx, customFactor])

  // -------------------------------------------------------------------------
  //  Re-parsear con los parámetros actuales
  // -------------------------------------------------------------------------
  const reparseFile = useCallback((lines, start, end, factor, twoCol, dtManual) => {
    const { timeArr, accelArr, accelRawArr, twoColumns } = loadData(lines, start, end, factor)
    if (!accelArr.length) {
      setFileInfo(null); setAccelChart(null); parsedRef.current = { accel: null, dt: null }
      setStatus({ type: 'error', msg: 'No se encontraron datos numéricos en el rango indicado.' })
      return
    }
    const useTwoCol = twoCol !== undefined ? twoCol : twoColumns
    const dt = useTwoCol && timeArr.length >= 2 ? timeArr[1] - timeArr[0] : dtManual

    parsedRef.current = { accel: accelArr, dt }

    // downsample para gráfica (máx 2000 pts)
    const step = Math.max(1, Math.floor(accelArr.length / 2000))
    const chart = []
    for (let i = 0; i < accelRawArr.length; i += step) {
      chart.push({ t: parseFloat((i * dt).toFixed(3)), a: parseFloat(accelRawArr[i].toFixed(4)) })
    }
    setAccelChart(chart)
    setFileInfo({ npts: accelArr.length, twoColumns: useTwoCol, dt: dt.toFixed(5) })
    setResult(null)
    setStatus(null)
  }, [])

  // -------------------------------------------------------------------------
  //  Cargar archivo
  // -------------------------------------------------------------------------
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null); setAccelChart(null); setFileInfo(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/)
      setRawLines(lines)
      const range = detectDataRange(lines)
      setDetectedRange(range)
      setUserStart(range.start)
      setUserEnd(range.end)
      const factor = UNIT_OPTIONS[unitIdx].factor !== null ? UNIT_OPTIONS[unitIdx].factor : customFactor
      reparseFile(lines, range.start, range.end, factor, undefined, manualDt)
    }
    reader.readAsText(file)
  }, [unitIdx, customFactor, manualDt, reparseFile])

  // -------------------------------------------------------------------------
  //  Cuando cambia rango / unidad / dt manual → re-parsear
  // -------------------------------------------------------------------------
  const applyRange = (start, end) => {
    setUserStart(start); setUserEnd(end)
    if (!rawLines.length) return
    const factor = getUnitFactor()
    reparseFile(rawLines, start, end, factor, undefined, manualDt)
  }

  const applyUnit = (idx, cf) => {
    setUnitIdx(idx)
    if (cf !== undefined) setCustomFactor(cf)
    if (!rawLines.length) return
    const factor = UNIT_OPTIONS[idx].factor !== null ? UNIT_OPTIONS[idx].factor : (cf !== undefined ? cf : customFactor)
    reparseFile(rawLines, userStart, userEnd, factor, undefined, manualDt)
  }

  const applyDt = (dt) => {
    setManualDt(dt)
    if (!rawLines.length || fileInfo?.twoColumns) return
    const factor = getUnitFactor()
    reparseFile(rawLines, userStart, userEnd, factor, false, dt)
  }

  // -------------------------------------------------------------------------
  //  Calcular espectro
  // -------------------------------------------------------------------------
  const handleCalculate = useCallback(async () => {
    const { accel, dt } = parsedRef.current
    if (!accel || !dt) { setStatus({ type: 'error', msg: 'Cargue un registro sísmico primero.' }); return }
    setLoading(true)
    setStatus({ type: 'info', msg: `Calculando... (${accel.length.toLocaleString()} pts, ${nCurves} curvas)` })
    try {
      const xiArr = dampings.slice(0, nCurves).map(d => d / 100)
      const { periods, Sa, error } = await computeSpectrum({
        accel: Float64Array.from(accel), dt, dampings: xiArr,
        newmarkType, nPeriods, TMin, TMax,
      })
      if (error) {
        setStatus({ type: 'error', msg: `Error WASM: ${error}` })
      } else {
        const chartData = Array.from(periods, (T, i) => {
          const pt = { T: parseFloat(T.toFixed(4)) }
          Sa.forEach((c, j) => { pt[`xi${j}`] = parseFloat(c[i].toFixed(3)) })
          return pt
        })
        setResult({ chartData, periods, Sa, dampings: dampings.slice(0, nCurves) })
        setStatus({ type: 'success', msg: `Listo. ${periods.length} periodos · ${nCurves} curvas.` })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Error: ${err.message}` })
    }
    setLoading(false)
  }, [computeSpectrum, dampings, nCurves, newmarkType, nPeriods, TMin, TMax])

  // -------------------------------------------------------------------------
  //  Amortiguamiento
  // -------------------------------------------------------------------------
  const handleNCurves = (n) => {
    n = Math.max(1, Math.min(5, n))
    setNCurves(n)
    setDampings(prev => {
      if (n > prev.length) return [...prev, ...DEFAULT_DAMPINGS.slice(prev.length, n)]
      return prev.slice(0, n)
    })
  }
  const setDamping = (i, v) => setDampings(prev => { const d = [...prev]; d[i] = parseFloat(v) || 0; return d })
  const setDefaultDampings = () => setDampings([...DEFAULT_DAMPINGS])

  const canCalc = !!parsedRef.current.accel && ready && !loading

  // -------------------------------------------------------------------------
  //  Render
  // -------------------------------------------------------------------------
  return (
    <div style={css.root}>
      {/* Header */}
      <header style={css.header}>
        <span style={css.logo}>INERTIX</span>
        <span style={css.sep}>|</span>
        <span style={{ color: '#8B949E' }}>Espectro de Respuesta Sísmica</span>
        <span style={css.sep}>|</span>
        <span style={{ color: '#484F58', fontSize: 11 }}>Newmark-Beta</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: ready && !loadError ? '#3FB950' : '#F0883E' }}></div>
          <span style={{ fontSize: 11, color: ready && !loadError ? '#3FB950' : '#F0883E' }}>
            {loadError ? 'Error WASM' : ready ? 'WASM listo' : 'Cargando...'}
          </span>
        </div>
      </header>

      <div style={css.layout}>
        {/* ── Sidebar ── */}
        <aside style={css.sidebar}>

          {/* [1] Archivo */}
          <section>
            <div style={css.secLabel}>[1] Registro Sísmico (.txt)</div>
            <label style={{ ...css.fileBtn, color: fileName ? '#E6EDF3' : '#484F58' }}>
              <input type="file" accept=".txt" onChange={handleFile} style={{ display: 'none' }} />
              {fileName || 'Explorar archivo...'}
            </label>

            {rawLines.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={css.hint()}>Total líneas: {rawLines.length}</div>
                {detectedRange && (
                  <div style={css.hint('#3FB950')}>
                    Auto-detectado: línea {detectedRange.start + 1} a {detectedRange.end + 1}
                  </div>
                )}
                <div style={{ ...css.rowBetween, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#8B949E' }}>Línea inicio</span>
                  <input type="number" min={1} max={rawLines.length}
                    value={userStart + 1}
                    onChange={e => applyRange(Math.max(0, Number(e.target.value) - 1), userEnd)}
                    style={css.inputNum} />
                </div>
                <div style={css.rowBetween}>
                  <span style={{ fontSize: 11, color: '#8B949E' }}>Línea fin</span>
                  <input type="number" min={userStart + 1} max={rawLines.length}
                    value={userEnd + 1}
                    onChange={e => applyRange(userStart, Math.max(userStart, Number(e.target.value) - 1))}
                    style={css.inputNum} />
                </div>

                {fileInfo ? (
                  <div style={{ marginTop: 4 }}>
                    <div style={css.hint('#3FB950')}>
                      ✓ {fileInfo.npts.toLocaleString()} pts · {fileInfo.twoColumns ? `2 col · dt=${fileInfo.dt}s` : '1 col'}
                    </div>
                    {!fileInfo.twoColumns && (
                      <div style={{ ...css.rowBetween, marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: '#E3B341' }}>dt manual (s)</span>
                        <input type="number" min={0.0001} step={0.001}
                          value={manualDt}
                          onChange={e => applyDt(parseFloat(e.target.value) || 0.01)}
                          style={css.inputNum} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={css.hint('#F85149')}>Sin datos numéricos en ese rango.</div>
                )}
              </div>
            )}
          </section>

          <div style={css.divider}></div>

          {/* [2] Unidades */}
          <section>
            <div style={css.secLabel}>[2] Unidades de Aceleración</div>
            <select value={unitIdx} onChange={e => applyUnit(Number(e.target.value))} style={css.select}>
              {UNIT_OPTIONS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
            </select>
            {unitIdx === 3 && (
              <div style={{ ...css.rowBetween, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#8B949E' }}>Factor → cm/s²</span>
                <input type="number" min={0.0001} step={0.01}
                  value={customFactor}
                  onChange={e => applyUnit(3, parseFloat(e.target.value) || 1)}
                  style={css.inputNum} />
              </div>
            )}
          </section>

          <div style={css.divider}></div>

          {/* [3] Amortiguamiento */}
          <section>
            <div style={css.secLabel}>[3] Fracciones de Amortiguamiento</div>
            <div style={{ ...css.row, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#8B949E', flex: 1 }}>N. curvas</span>
              <button style={css.iconBtn} onClick={() => handleNCurves(nCurves - 1)}>−</button>
              <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{nCurves}</span>
              <button style={css.iconBtn} onClick={() => handleNCurves(nCurves + 1)}>+</button>
            </div>
            <button onClick={setDefaultDampings} style={{ ...css.expBtn, marginBottom: 7, fontSize: 11 }}>
              Defecto  0 / 1 / 2 / 3 / 5 %
            </button>
            {dampings.slice(0, nCurves).map((d, i) => (
              <div key={i} style={{ ...css.row, marginBottom: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: DAMPING_COLORS[i], flexShrink: 0 }}></div>
                <span style={{ fontSize: 11, color: '#8B949E', width: 36 }}>ξ[{i + 1}]</span>
                <input type="number" min={0} max={100} step={0.5} value={d}
                  onChange={e => setDamping(i, e.target.value)}
                  style={css.inputSmall} />
                <span style={{ fontSize: 11, color: '#484F58' }}>%</span>
              </div>
            ))}
          </section>

          <div style={css.divider}></div>

          {/* [4] Newmark */}
          <section>
            <div style={css.secLabel}>[4] Parámetros Newmark-Beta</div>
            <select value={newmarkType} onChange={e => setNewmarkType(Number(e.target.value))} style={css.select}>
              <option value={0}>Accel. Constante (β=1/4, γ=1/2)</option>
              <option value={1}>Accel. Lineal (β=1/6, γ=1/2)</option>
            </select>
            <div style={css.hint('#3FB950')}>
              {newmarkType === 0 ? '→ Incondicionalmente estable' : '→ Mayor precisión numérica'}
            </div>
          </section>

          <div style={css.divider}></div>

          {/* [5] Rango espectro */}
          <section>
            <div style={css.secLabel}>[5] Rango del Espectro</div>
            {[
              { label: 'T mín (s)',    val: TMin,     set: setTMin,     step: 0.01 },
              { label: 'T máx (s)',    val: TMax,     set: setTMax,     step: 0.5 },
              { label: 'N. periodos',  val: nPeriods, set: setNPeriods, step: 100 },
            ].map(({ label, val, set, step }) => (
              <div key={label} style={css.rowBetween}>
                <span style={{ fontSize: 11, color: '#8B949E' }}>{label}</span>
                <input type="number" value={val} step={step}
                  onChange={e => set(parseFloat(e.target.value) || val)}
                  style={css.inputNum} />
              </div>
            ))}
          </section>

          <div style={css.divider}></div>

          {/* Botón calcular */}
          <button onClick={handleCalculate} disabled={!canCalc} style={css.calcBtn(canCalc)}>
            {loading ? 'CALCULANDO...' : 'CALCULAR ESPECTRO'}
          </button>

          {status && <div style={css.statusBox(status.type)}>{status.msg}</div>}

          {/* Exportar */}
          {result && (
            <>
              <div style={css.divider}></div>
              <section>
                <div style={css.secLabel}>[6] Exportar Resultados</div>
                <button onClick={() => exportTxt(
                  Array.from(result.periods),
                  result.Sa.map(c => Array.from(c)),
                  result.dampings,
                  fileName,
                  newmarkType,
                  UNIT_OPTIONS[unitIdx].label
                )} style={css.expBtn}>
                  Descargar espectro_respuesta.txt
                </button>
              </section>
            </>
          )}
        </aside>

        {/* ── Main ── */}
        <main style={css.main}>
          {/* Acelerograma */}
          <div style={css.panel}>
            <div style={css.panelLabel}>
              Acelerograma — {fileInfo ? `${fileInfo.npts.toLocaleString()} pts · dt=${fileInfo.dt}s` : 'sin datos'}
            </div>
            {accelChart ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accelChart} margin={{ top: 2, right: 10, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: `a (${UNIT_OPTIONS[unitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 45 }} />
                  <Tooltip {...tpStyle} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v}`, 'a']} />
                  <Line type="monotone" dataKey="a" stroke="#58A6FF" dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={css.empty}>Cargue un registro sísmico para visualizar el acelerograma.</div>
            )}
          </div>

          {/* Espectro */}
          <div style={css.panelLast}>
            <div style={css.panelLabel}>Espectro de Pseudoaceleración Sa vs Período T</div>
            {result ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.chartData} margin={{ top: 2, right: 10, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="T" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Período T (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Sa (cm/s²)', angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 35 }} />
                  <Tooltip {...tpStyle} labelFormatter={v => `T = ${v} s`} formatter={(v, name) => [`${v} cm/s²`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8B949E', paddingTop: 4 }} />
                  {result.dampings.map((d, i) => (
                    <Line key={i} type="monotone" dataKey={`xi${i}`} name={`ξ = ${d}%`}
                      stroke={DAMPING_COLORS[i]} dot={false} strokeWidth={1.5} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={css.empty}>
                {fileInfo ? 'Presione [CALCULAR ESPECTRO] para generar el espectro.' : 'Cargue un registro sísmico y calcule el espectro.'}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
