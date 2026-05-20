// =============================================================================
//  EjemploEspectro.jsx  —  INERTIX Espectro de Respuesta Sísmica v3
//  Responsive + identidad INERTIX
//  Requiere: recharts  (npm install recharts)
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNewmark } from './useNewmark'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ---------------------------------------------------------------------------
const UNIT_OPTIONS = [
  { label: 'cm/s²', factor: 1 },
  { label: 'm/s²',  factor: 100 },
  { label: 'g',     factor: 980.665 },
  { label: 'Otro',  factor: null },
]
const DAMPING_COLORS = ['#F87171','#60A5FA','#34D399','#FBBF24','#A78BFA']
const DEFAULT_DAMPINGS = [0, 1, 2, 3, 5]
const ACCENT = '#E97817'
const BG_DARK = '#111318'
const BG_PANEL = '#181B22'
const BORDER = '#2A2D35'

// ---------------------------------------------------------------------------
function normalizeLine(line) { return line.replace(/,(?=\d)/g, '.').replace(/,/g, ' ') }
function isNumericLine(line) { const s = normalizeLine(line).trim(); return s ? /^[-+]?\d/.test(s) : false }
function parseLine(line) { return normalizeLine(line).trim().split(/[\s\t]+/).map(Number).filter(n => !isNaN(n)) }

function detectDataRange(rawLines) {
  let start = -1, end = -1
  for (let i = 0; i < rawLines.length; i++) {
    if (isNumericLine(rawLines[i])) { if (start === -1) start = i; end = i }
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
      timeArr.push(parts[0]); accelRawArr.push(parts[1]); accelArr.push(parts[1] * unitFactor)
    } else if (!twoColumns) {
      accelRawArr.push(parts[0]); accelArr.push(parts[0] * unitFactor)
    }
  }
  return { timeArr, accelArr, accelRawArr, twoColumns: !!twoColumns }
}

function exportTxt(periods, Sa, dampings, fileName, newmarkType, unit) {
  const nm = newmarkType === 0 ? 'Aceleración Constante (beta=1/4, gamma=1/2)' : 'Aceleración Lineal (beta=1/6, gamma=1/2)'
  const W = 22; const pad = (s, w) => String(s).padEnd(w)
  let t = '# ============================================================\n'
  t += '# INERTIX - Espectro de Pseudoaceleración\n'
  t += `# Método: Newmark-Beta - ${nm}\n# Registro: ${fileName}\n# Unidad: ${unit}\n`
  t += `# Curvas xi (%): ${dampings.join('  ')}\n`
  t += '# ============================================================\n#\n'
  t += pad('# Periodo(s)', W); dampings.forEach(d => { t += pad(`Sa_xi=${d}%[cm/s2]`, W) }); t += '\n'
  t += '# ' + '-'.repeat(W * (dampings.length + 1) - 2) + '\n'
  for (let i = 0; i < periods.length; i++) {
    t += pad(periods[i].toFixed(8), W); Sa.forEach(c => { t += pad(c[i].toFixed(8), W) }); t += '\n'
  }
  const blob = new Blob([t], { type: 'text/plain' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'espectro_respuesta.txt'; a.click()
}

// ---------------------------------------------------------------------------
//  Hook para detectar si es móvil
// ---------------------------------------------------------------------------
function useIsMobile(breakpoint = 768) {
  const [m, setM] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const h = () => setM(window.innerWidth < breakpoint)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [breakpoint])
  return m
}

// ---------------------------------------------------------------------------
//  Componente principal
// ---------------------------------------------------------------------------
export default function EjemploEspectro() {
  const { ready, loadError, computeSpectrum } = useNewmark()
  const mobile = useIsMobile()

  const [unitIdx, setUnitIdx] = useState(0)
  const [customFactor, setCustomFactor] = useState(1)
  const [newmarkType, setNewmarkType] = useState(0)
  const [nCurves, setNCurves] = useState(5)
  const [dampings, setDampings] = useState([...DEFAULT_DAMPINGS])
  const [nPeriods, setNPeriods] = useState(1000)
  const [TMin, setTMin] = useState(0.01)
  const [TMax, setTMax] = useState(10.0)
  const [manualDt, setManualDt] = useState(0.01)

  const [rawLines, setRawLines] = useState([])
  const [fileName, setFileName] = useState(null)
  const [detectedRange, setDetectedRange] = useState(null)
  const [userStart, setUserStart] = useState(0)
  const [userEnd, setUserEnd] = useState(0)
  const [fileInfo, setFileInfo] = useState(null)
  const [accelChart, setAccelChart] = useState(null)
  const parsedRef = useRef({ accel: null, dt: null })

  const [result, setResult] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showParams, setShowParams] = useState(!mobile)

  const getUnitFactor = useCallback(() => {
    const o = UNIT_OPTIONS[unitIdx]; return o.factor !== null ? o.factor : customFactor
  }, [unitIdx, customFactor])

  const reparseFile = useCallback((lines, start, end, factor, twoCol, dtM) => {
    const { timeArr, accelArr, accelRawArr, twoColumns } = loadData(lines, start, end, factor)
    if (!accelArr.length) {
      setFileInfo(null); setAccelChart(null); parsedRef.current = { accel: null, dt: null }
      setStatus({ type: 'error', msg: 'No se encontraron datos numéricos.' }); return
    }
    const tw = twoCol !== undefined ? twoCol : twoColumns
    const dt = tw && timeArr.length >= 2 ? timeArr[1] - timeArr[0] : dtM
    parsedRef.current = { accel: accelArr, dt }
    const step = Math.max(1, Math.floor(accelArr.length / 2000))
    const chart = []
    for (let i = 0; i < accelRawArr.length; i += step)
      chart.push({ t: parseFloat((i * dt).toFixed(3)), a: parseFloat(accelRawArr[i].toFixed(4)) })
    setAccelChart(chart)
    setFileInfo({ npts: accelArr.length, twoColumns: tw, dt: dt.toFixed(5) })
    setResult(null); setStatus(null)
  }, [])

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name); setResult(null); setAccelChart(null); setFileInfo(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/)
      setRawLines(lines)
      const range = detectDataRange(lines)
      setDetectedRange(range); setUserStart(range.start); setUserEnd(range.end)
      const f = UNIT_OPTIONS[unitIdx].factor !== null ? UNIT_OPTIONS[unitIdx].factor : customFactor
      reparseFile(lines, range.start, range.end, f, undefined, manualDt)
    }
    reader.readAsText(file)
  }, [unitIdx, customFactor, manualDt, reparseFile])

  const applyRange = (s, e) => {
    setUserStart(s); setUserEnd(e)
    if (!rawLines.length) return
    reparseFile(rawLines, s, e, getUnitFactor(), undefined, manualDt)
  }
  const applyUnit = (idx, cf) => {
    setUnitIdx(idx); if (cf !== undefined) setCustomFactor(cf)
    if (!rawLines.length) return
    const f = UNIT_OPTIONS[idx].factor !== null ? UNIT_OPTIONS[idx].factor : (cf !== undefined ? cf : customFactor)
    reparseFile(rawLines, userStart, userEnd, f, undefined, manualDt)
  }
  const applyDt = (dt) => {
    setManualDt(dt); if (!rawLines.length || fileInfo?.twoColumns) return
    reparseFile(rawLines, userStart, userEnd, getUnitFactor(), false, dt)
  }

  const handleCalculate = useCallback(async () => {
    const { accel, dt } = parsedRef.current
    if (!accel || !dt) { setStatus({ type: 'error', msg: 'Cargue un registro sísmico primero.' }); return }
    setLoading(true)
    setStatus({ type: 'info', msg: `Calculando... (${accel.length.toLocaleString()} pts)` })
    try {
      const xiArr = dampings.slice(0, nCurves).map(d => d / 100)
      const { periods, Sa, error } = await computeSpectrum({
        accel: Float64Array.from(accel), dt, dampings: xiArr, newmarkType, nPeriods, TMin, TMax,
      })
      if (error) { setStatus({ type: 'error', msg: `Error WASM: ${error}` }) }
      else {
        const chartData = Array.from(periods, (T, i) => {
          const pt = { T: parseFloat(T.toFixed(4)) }
          Sa.forEach((c, j) => { pt[`xi${j}`] = parseFloat(c[i].toFixed(3)) }); return pt
        })
        setResult({ chartData, periods, Sa, dampings: dampings.slice(0, nCurves) })
        setStatus({ type: 'success', msg: `Listo. ${periods.length} periodos · ${nCurves} curvas.` })
      }
    } catch (err) { setStatus({ type: 'error', msg: `Error: ${err.message}` }) }
    setLoading(false)
  }, [computeSpectrum, dampings, nCurves, newmarkType, nPeriods, TMin, TMax])

  const handleNCurves = (n) => {
    n = Math.max(1, Math.min(5, n)); setNCurves(n)
    setDampings(p => n > p.length ? [...p, ...DEFAULT_DAMPINGS.slice(p.length, n)] : p.slice(0, n))
  }
  const setDamping = (i, v) => setDampings(p => { const d = [...p]; d[i] = parseFloat(v) || 0; return d })

  const canCalc = !!parsedRef.current.accel && ready && !loading

  // -----------------------------------------------------------------------
  //  Tooltip recharts
  // -----------------------------------------------------------------------
  const tp = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }

  // -----------------------------------------------------------------------
  //  Input / Select helpers
  // -----------------------------------------------------------------------
  const inputS = (extra) => ({
    background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3',
    borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', ...extra
  })

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: BG_DARK, color: '#E6EDF3', fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{
        background: BG_PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: mobile ? '8px 12px' : '9px 20px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap'
      }}>
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="6" fill={ACCENT}/>
          <path d="M10 30V14l10-6 10 6v16l-10-5-10 5z" fill="#fff" fillOpacity="0.9"/>
          <path d="M20 8v17" stroke="#fff" strokeWidth="1.5"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: 1.5 }}>INERTIX</span>
        {!mobile && <>
          <span style={{ color: '#3A3D45' }}>|</span>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>Espectro de Respuesta Sísmica</span>
          <span style={{ color: '#3A3D45' }}>|</span>
          <span style={{ color: '#555', fontSize: 11 }}>Newmark-Beta</span>
        </>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: ready && !loadError ? '#3FB950' : ACCENT }}></div>
          <span style={{ fontSize: 11, color: ready && !loadError ? '#3FB950' : ACCENT }}>
            {loadError ? 'Error' : ready ? 'WASM listo' : 'Cargando...'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', flex: 1, overflow: mobile ? 'auto' : 'hidden' }}>

        {/* ── Sidebar / Panel de controles ── */}
        <aside style={{
          width: mobile ? '100%' : 290, minWidth: mobile ? 'auto' : 290,
          background: BG_PANEL, borderRight: mobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: mobile ? `1px solid ${BORDER}` : 'none',
          padding: mobile ? 12 : 14, overflowY: mobile ? 'visible' : 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>

          {/* [1] Archivo */}
          <section>
            <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' }}>[1] Registro Sísmico (.txt)</div>
            <label style={{
              display: 'block', border: `1px dashed ${BORDER}`, borderRadius: 6,
              padding: '9px 10px', cursor: 'pointer', textAlign: 'center',
              fontSize: 13, color: fileName ? '#E6EDF3' : '#555', background: BG_DARK
            }}>
              <input type="file" accept=".txt" onChange={handleFile} style={{ display: 'none' }} />
              {fileName || 'Explorar archivo...'}
            </label>
            {rawLines.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <span style={{ color: '#8B949E' }}>Total: {rawLines.length} líneas</span>
                {detectedRange && <div style={{ color: '#3FB950', marginTop: 2 }}>Auto-detectado: {detectedRange.start + 1} a {detectedRange.end + 1}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Línea inicio</div>
                    <input type="number" min={1} max={rawLines.length} value={userStart + 1}
                      onChange={e => applyRange(Math.max(0, Number(e.target.value) - 1), userEnd)}
                      style={inputS({ width: '100%' })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Línea fin</div>
                    <input type="number" min={userStart + 1} max={rawLines.length} value={userEnd + 1}
                      onChange={e => applyRange(userStart, Math.max(userStart, Number(e.target.value) - 1))}
                      style={inputS({ width: '100%' })} />
                  </div>
                </div>
                {fileInfo && (
                  <div style={{ color: '#3FB950', marginTop: 4, fontSize: 11 }}>
                    ✓ {fileInfo.npts.toLocaleString()} pts · {fileInfo.twoColumns ? `2 col · dt=${fileInfo.dt}s` : '1 col'}
                  </div>
                )}
                {fileInfo && !fileInfo.twoColumns && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: ACCENT }}>dt manual (s): </span>
                    <input type="number" min={0.0001} step={0.001} value={manualDt}
                      onChange={e => applyDt(parseFloat(e.target.value) || 0.01)}
                      style={inputS({ width: 80 })} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Toggle para móvil */}
          {mobile && (
            <button onClick={() => setShowParams(!showParams)} style={{
              background: 'transparent', border: `1px solid ${BORDER}`, color: ACCENT,
              borderRadius: 5, padding: '7px', fontSize: 12, cursor: 'pointer', fontWeight: 600
            }}>
              {showParams ? '▲ Ocultar parámetros' : '▼ Configurar parámetros'}
            </button>
          )}

          {(showParams || !mobile) && (
            <>
              {/* [2] Unidades */}
              <section>
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[2] Unidades</div>
                <select value={unitIdx} onChange={e => applyUnit(Number(e.target.value))} style={inputS({ width: '100%' })}>
                  {UNIT_OPTIONS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
                </select>
                {unitIdx === 3 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: '#8B949E' }}>Factor → cm/s²</span>
                    <input type="number" min={0.0001} step={0.01} value={customFactor}
                      onChange={e => applyUnit(3, parseFloat(e.target.value) || 1)}
                      style={inputS({ width: 80, textAlign: 'right' })} />
                  </div>
                )}
              </section>

              {/* [3] Amortiguamiento */}
              <section>
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[3] Amortiguamiento</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#8B949E', flex: 1 }}>N. curvas</span>
                  <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves - 1)}>−</button>
                  <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{nCurves}</span>
                  <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves + 1)}>+</button>
                </div>
                <button onClick={() => setDampings([...DEFAULT_DAMPINGS])} style={{
                  width: '100%', padding: '5px', borderRadius: 4, border: `1px solid ${BORDER}`,
                  background: '#21262D', color: '#ccc', fontSize: 11, cursor: 'pointer', marginBottom: 6
                }}>Defecto 0/1/2/3/5 %</button>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {dampings.slice(0, nCurves).map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: DAMPING_COLORS[i] }}></div>
                      <span style={{ fontSize: 11, color: '#8B949E' }}>ξ{i + 1}</span>
                      <input type="number" min={0} max={100} step={0.5} value={d}
                        onChange={e => setDamping(i, e.target.value)}
                        style={inputS({ width: 55, textAlign: 'right', padding: '3px 5px' })} />
                      <span style={{ fontSize: 10, color: '#555' }}>%</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* [4] Newmark */}
              <section>
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[4] Newmark-Beta</div>
                <select value={newmarkType} onChange={e => setNewmarkType(Number(e.target.value))} style={inputS({ width: '100%' })}>
                  <option value={0}>Accel. Constante (β=1/4, γ=1/2)</option>
                  <option value={1}>Accel. Lineal (β=1/6, γ=1/2)</option>
                </select>
                <div style={{ fontSize: 10, color: '#3FB950', marginTop: 3 }}>
                  {newmarkType === 0 ? '→ Incondicionalmente estable' : '→ Mayor precisión numérica'}
                </div>
              </section>

              {/* [5] Rango */}
              <section>
                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[5] Rango del Espectro</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {[
                    { label: 'T mín (s)', val: TMin, set: setTMin, step: 0.01 },
                    { label: 'T máx (s)', val: TMax, set: setTMax, step: 0.5 },
                    { label: 'N. periodos', val: nPeriods, set: setNPeriods, step: 100 },
                  ].map(({ label, val, set, step }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: '#8B949E', minWidth: 70 }}>{label}</span>
                      <input type="number" value={val} step={step}
                        onChange={e => set(parseFloat(e.target.value) || val)}
                        style={inputS({ width: 75, textAlign: 'right', padding: '3px 5px' })} />
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Botón calcular */}
          <button onClick={handleCalculate} disabled={!canCalc} style={{
            width: '100%', padding: mobile ? '12px 0' : '10px 0', borderRadius: 6, border: 'none',
            background: canCalc ? ACCENT : '#21262D',
            color: canCalc ? '#fff' : '#555',
            fontWeight: 700, fontSize: 13, cursor: canCalc ? 'pointer' : 'not-allowed',
            letterSpacing: 0.6
          }}>
            {loading ? 'CALCULANDO...' : 'CALCULAR ESPECTRO'}
          </button>

          {status && (
            <div style={{
              fontSize: 11, padding: '7px 9px', borderRadius: 5,
              background: status.type === 'error' ? '#2D1515' : status.type === 'success' ? '#0D2B1A' : '#1C2333',
              color: status.type === 'error' ? '#F85149' : status.type === 'success' ? '#3FB950' : '#8B949E',
              border: `1px solid ${status.type === 'error' ? '#3D1F1F' : status.type === 'success' ? '#1A3D2B' : BORDER}`,
            }}>{status.msg}</div>
          )}

          {result && (
            <button onClick={() => exportTxt(
              Array.from(result.periods), result.Sa.map(c => Array.from(c)),
              result.dampings, fileName, newmarkType, UNIT_OPTIONS[unitIdx].label
            )} style={{
              width: '100%', padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`,
              background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer'
            }}>Descargar espectro_respuesta.txt</button>
          )}
        </aside>

        {/* ── Main: Gráficas ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: mobile ? 'visible' : 'hidden', minWidth: 0 }}>

          {/* Acelerograma */}
          <div style={{ flex: 1, minHeight: mobile ? 280 : 0, padding: '8px 12px', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4, fontWeight: 500 }}>
              Acelerograma {fileInfo ? `— ${fileInfo.npts.toLocaleString()} pts · dt=${fileInfo.dt}s` : ''}
            </div>
            {accelChart ? (
              <ResponsiveContainer width="100%" height={mobile ? 240 : '100%'}>
                <LineChart data={accelChart} margin={{ top: 2, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: `a (${UNIT_OPTIONS[unitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 40 }} />
                  <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v}`, 'a']} />
                  <Line type="monotone" dataKey="a" stroke={ACCENT} dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ flex: 1, minHeight: mobile ? 120 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
                Cargue un registro sísmico para visualizar el acelerograma.
              </div>
            )}
          </div>

          {/* Espectro */}
          <div style={{ flex: 1, minHeight: mobile ? 300 : 0, padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4, fontWeight: 500 }}>
              Espectro de Pseudoaceleración Sa vs Período T
            </div>
            {result ? (
              <ResponsiveContainer width="100%" height={mobile ? 260 : '100%'}>
                <LineChart data={result.chartData} margin={{ top: 2, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="T" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Período T (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Sa (cm/s²)', angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 30 }} />
                  <Tooltip {...tp} labelFormatter={v => `T = ${v} s`} formatter={(v, n) => [`${v} cm/s²`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8B949E', paddingTop: 2 }} />
                  {result.dampings.map((d, i) => (
                    <Line key={i} type="monotone" dataKey={`xi${i}`} name={`ξ = ${d}%`}
                      stroke={DAMPING_COLORS[i]} dot={false} strokeWidth={1.5} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ flex: 1, minHeight: mobile ? 120 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
                {fileInfo ? 'Presione CALCULAR ESPECTRO para generar el espectro.' : 'Cargue un registro sísmico y calcule el espectro.'}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
