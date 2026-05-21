// =============================================================================
//  EjemploEspectro.jsx  —  INERTIX Espectro de Respuesta Sísmica
//  Con ventana modal y auto-detección inteligente
//  Requiere: recharts
// =============================================================================

import { useState, useCallback, useEffect } from 'react'
import { useNewmark } from './useNewmark'
import { useSeismic, exportTxt, FORMAT_TYPES, DECIMAL_SEPS, COL_SEPS } from './useSeismic'
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
const ACCENT   = '#E97817'
const BG_DARK  = '#111318'
const BG_PANEL = '#181B22'
const BORDER   = '#2A2D35'
const BG_MODAL = '#1E2128'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(window.innerWidth < bp)
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

const inp = (extra) => ({
  background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', ...extra
})
const tp = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }

// =============================================================================
//  MODAL DE CONFIGURACIÓN (valores pre-llenados por auto-detección)
// =============================================================================
function FileConfigModal({ rawLines, detectedConfig, onApply, onCancel, unitFactor }) {
  const mobile = useIsMobile()
  const d = detectedConfig || {}

  // Inicializar con valores auto-detectados
  const [colSep,      setColSep]      = useState(d.colSep || 'space')
  const [decSep,      setDecSep]      = useState(d.decSep || 'dot')
  const [userStart,   setUserStart]   = useState(d.start || 0)
  const [userEnd,     setUserEnd]     = useState(d.end || 0)
  const [format,      setFormat]      = useState(d.format || 'single')
  const [accelCol,    setAccelCol]    = useState(d.accelCol || 1)
  const [timeCol,     setTimeCol]     = useState(d.timeCol || 1)
  const [manualDt,    setManualDt]    = useState(d.dt || 0.01)
  const [scaleFactor, setScaleFactor] = useState(1.0)

  // Actualizar cuando cambia detectedConfig
  useEffect(() => {
    if (!d) return
    setColSep(d.colSep || 'space')
    setDecSep(d.decSep || 'dot')
    setUserStart(d.start || 0)
    setUserEnd(d.end || 0)
    setFormat(d.format || 'single')
    setAccelCol(d.accelCol || 1)
    setTimeCol(d.timeCol || 1)
    if (d.dtDetected && d.dt > 0) setManualDt(d.dt)
  }, [d])

  // Preview
  const previewStart = Math.max(0, userStart)
  const previewEnd = Math.min(rawLines.length - 1, previewStart + 9)
  const preview = rawLines.slice(previewStart, previewEnd + 1).map((line, i) => ({
    num: previewStart + i + 1, text: line
  }))

  const handleOK = () => {
    onApply({ userStart, userEnd, format, accelCol, timeCol, colSep, decSep, scaleFactor, manualDt, unitFactor })
  }

  const labelS = { fontSize: 11, color: '#8B949E', minWidth: mobile ? 80 : 115 }
  const rowS = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }
  const secS = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }}>
      <div style={{ background: BG_MODAL, border: `1px solid ${BORDER}`, borderRadius: 10, width: mobile ? '95vw' : 700, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: mobile ? 14 : 20, color: '#E6EDF3' }}>

        {/* Título */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Parámetros del Archivo de Entrada</div>
          <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
            {rawLines.length.toLocaleString()} líneas · Datos detectados: línea {(d.start || 0) + 1} a {(d.end || 0) + 1} · ~{d.nCols || '?'} columnas
          </div>
          {d.dtDetected && (
            <div style={{ fontSize: 11, color: '#3FB950', marginTop: 2 }}>
              ✓ dt detectado automáticamente: {d.dt?.toFixed(6)} s
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: 16 }}>

          {/* Configuración */}
          <div style={{ flex: 1, minWidth: 0 }}>

            <div style={secS}>Separadores</div>
            <div style={rowS}>
              <span style={labelS}>Decimal</span>
              <select value={decSep} onChange={e => setDecSep(e.target.value)} style={inp({ flex: 1 })}>
                {DECIMAL_SEPS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div style={rowS}>
              <span style={labelS}>Columnas</span>
              <select value={colSep} onChange={e => setColSep(e.target.value)} style={inp({ flex: 1 })}>
                {COL_SEPS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, margin: '6px 0' }}></div>
            <div style={secS}>Rango de Datos</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Línea inicio</div>
                <input type="number" min={1} max={rawLines.length} value={userStart + 1}
                  onChange={e => setUserStart(Math.max(0, Number(e.target.value) - 1))}
                  style={inp({ width: '100%', textAlign: 'right' })} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Línea fin</div>
                <input type="number" min={userStart + 1} max={rawLines.length} value={userEnd + 1}
                  onChange={e => setUserEnd(Math.max(userStart, Number(e.target.value) - 1))}
                  style={inp({ width: '100%', textAlign: 'right' })} />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, margin: '8px 0' }}></div>
            <div style={secS}>Formato del Archivo</div>
            {FORMAT_TYPES.map(f => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, cursor: 'pointer', fontSize: 12, color: format === f.id ? '#E6EDF3' : '#8B949E' }}>
                <input type="radio" name="format" value={f.id} checked={format === f.id}
                  onChange={() => setFormat(f.id)} style={{ accentColor: ACCENT }} />
                {f.label}
                {f.id === d.format && <span style={{ fontSize: 9, color: '#3FB950', marginLeft: 4 }}>(detectado)</span>}
              </label>
            ))}

            {(format === 'multi_col' || format === 'time_accel') && (
              <div style={{ marginTop: 4, padding: '8px 10px', background: BG_DARK, borderRadius: 6, border: `1px solid ${BORDER}` }}>
                <div style={rowS}>
                  <span style={labelS}>Col. Aceleración</span>
                  <input type="number" min={1} max={20} value={accelCol}
                    onChange={e => setAccelCol(Math.max(1, Number(e.target.value)))}
                    style={inp({ width: 55, textAlign: 'right' })} />
                </div>
                <div style={rowS}>
                  <span style={labelS}>Col. Tiempo</span>
                  <input type="number" min={1} max={20} value={timeCol}
                    onChange={e => setTimeCol(Math.max(1, Number(e.target.value)))}
                    style={inp({ width: 55, textAlign: 'right' })} />
                </div>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${BORDER}`, margin: '8px 0' }}></div>
            <div style={secS}>Parámetros</div>
            <div style={rowS}>
              <span style={labelS}>Time Step dt (s)</span>
              <input type="number" min={0.00001} step={0.001} value={manualDt}
                onChange={e => setManualDt(parseFloat(e.target.value) || 0.01)}
                style={inp({ width: 100, textAlign: 'right' })} />
              {d.dtDetected && manualDt === d.dt && (
                <span style={{ fontSize: 9, color: '#3FB950' }}>auto</span>
              )}
            </div>
            <div style={rowS}>
              <span style={labelS}>Scaling Factor</span>
              <input type="number" min={0.00001} step={0.1} value={scaleFactor}
                onChange={e => setScaleFactor(parseFloat(e.target.value) || 1)}
                style={inp({ width: 100, textAlign: 'right' })} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={secS}>Vista previa</div>
            <div style={{
              background: BG_DARK, border: `1px solid ${BORDER}`, borderRadius: 6,
              padding: 8, fontFamily: 'monospace', fontSize: 11, color: '#8B949E',
              maxHeight: 320, overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.7,
            }}>
              {preview.map(p => (
                <div key={p.num}>
                  <span style={{ color: '#484F58', display: 'inline-block', width: 36, textAlign: 'right', marginRight: 8 }}>{p.num}</span>
                  <span style={{ color: '#E6EDF3' }}>{p.text || '(vacía)'}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              {d.nCols || '?'} columnas detectadas · Formato sugerido: {FORMAT_TYPES.find(f => f.id === d.format)?.label || '?'}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#8B949E', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleOK} style={{ padding: '8px 28px', borderRadius: 5, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
//  COMPONENTE PRINCIPAL
// =============================================================================
export default function EjemploEspectro() {
  const { ready, loadError, computeSpectrum } = useNewmark()
  const mobile = useIsMobile()
  const seismic = useSeismic()

  const [unitIdx,      setUnitIdx]      = useState(0)
  const [customFactor, setCustomFactor] = useState(1)
  const [newmarkType,  setNewmarkType]  = useState(0)
  const [nCurves,      setNCurves]      = useState(5)
  const [dampings,     setDampings]     = useState([...DEFAULT_DAMPINGS])
  const [nPeriods,     setNPeriods]     = useState(1000)
  const [TMin,         setTMin]         = useState(0.01)
  const [TMax,         setTMax]         = useState(10.0)
  const [showParams,   setShowParams]   = useState(true)
  const [result,       setResult]       = useState(null)
  const [loading,      setLoading]      = useState(false)

  const unitFactor = UNIT_OPTIONS[unitIdx].factor !== null ? UNIT_OPTIONS[unitIdx].factor : customFactor

  const handleCalculate = useCallback(async () => {
    const { accel, dt } = seismic.parsedRef.current
    if (!accel || !dt) { seismic.setStatus({ type: 'error', msg: 'Cargue un registro sísmico primero.' }); return }
    setLoading(true)
    seismic.setStatus({ type: 'info', msg: `Calculando... (${accel.length.toLocaleString()} pts)` })
    try {
      const xiArr = dampings.slice(0, nCurves).map(d => d / 100)
      const { periods, Sa, error } = await computeSpectrum({
        accel: Float64Array.from(accel), dt, dampings: xiArr, newmarkType, nPeriods, TMin, TMax,
      })
      if (error) { seismic.setStatus({ type: 'error', msg: `Error WASM: ${error}` }) }
      else {
        const chartData = Array.from(periods, (T, i) => {
          const pt = { T: parseFloat(T.toFixed(4)) }
          Sa.forEach((c, j) => { pt[`xi${j}`] = parseFloat(c[i].toFixed(3)) }); return pt
        })
        setResult({ chartData, periods, Sa, dampings: dampings.slice(0, nCurves) })
        seismic.setStatus({ type: 'success', msg: `Listo. ${periods.length} periodos · ${nCurves} curvas.` })
      }
    } catch (err) { seismic.setStatus({ type: 'error', msg: `Error: ${err.message}` }) }
    setLoading(false)
  }, [computeSpectrum, dampings, nCurves, newmarkType, nPeriods, TMin, TMax, seismic])

  const handleNCurves = (n) => {
    n = Math.max(1, Math.min(5, n)); setNCurves(n)
    setDampings(p => n > p.length ? [...p, ...DEFAULT_DAMPINGS.slice(p.length, n)] : p.slice(0, n))
  }
  const setDamping = (i, v) => setDampings(p => { const d = [...p]; d[i] = parseFloat(v) || 0; return d })

  const canCalc = !!seismic.parsedRef.current.accel && ready && !loading
  const { status } = seismic

  return (
    <div style={{ minHeight: '100vh', background: BG_DARK, color: '#E6EDF3', fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Modal */}
      {seismic.showModal && seismic.rawLines.length > 0 && (
        <FileConfigModal
          rawLines={seismic.rawLines}
          detectedConfig={seismic.detectedConfig}
          unitFactor={unitFactor}
          onApply={config => seismic.applyConfig(config)}
          onCancel={() => seismic.setShowModal(false)}
        />
      )}

      {/* Header */}
      <header style={{ background: BG_PANEL, borderBottom: `1px solid ${BORDER}`, padding: mobile ? '8px 12px' : '9px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="6" fill={ACCENT}/>
          <path d="M10 30V14l10-6 10 6v16l-10-5-10 5z" fill="#fff" fillOpacity="0.9"/>
          <path d="M20 8v17" stroke="#fff" strokeWidth="1.5"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: 1.5 }}>INERTIX</span>
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

        {/* Sidebar */}
        <aside style={{
          width: mobile ? '100%' : 290, minWidth: mobile ? 'auto' : 290,
          background: BG_PANEL, borderRight: mobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: mobile ? `1px solid ${BORDER}` : 'none',
          padding: 12, overflowY: mobile ? 'visible' : 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>

          {/* [1] Archivo */}
          <section>
            <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[1] Registro Sísmico</div>
            <label style={{ display: 'block', border: `1px dashed ${BORDER}`, borderRadius: 6, padding: '9px', cursor: 'pointer', textAlign: 'center', fontSize: 13, color: seismic.fileName ? '#E6EDF3' : '#555', background: BG_DARK }}>
              <input type="file" accept=".txt,.csv,.dat,.at2,.smc" onChange={seismic.handleFile} style={{ display: 'none' }} />
              {seismic.fileName || 'Explorar archivo...'}
            </label>

            {seismic.fileInfo && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <div style={{ color: '#3FB950' }}>
                  ✓ {seismic.fileInfo.npts.toLocaleString()} pts · {FORMAT_TYPES.find(f => f.id === seismic.fileInfo.format)?.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: '#8B949E' }}>dt =</span>
                  <span style={{ fontWeight: 600, color: seismic.fileInfo.dtDetected ? '#3FB950' : ACCENT }}>
                    {seismic.fileInfo.dt} s
                  </span>
                  <span style={{ fontSize: 10, color: '#555' }}>
                    {seismic.fileInfo.dtDetected ? '(auto)' : '(manual)'}
                  </span>
                </div>
                <button onClick={() => seismic.setShowModal(true)} style={{
                  marginTop: 5, width: '100%', padding: '5px', borderRadius: 4,
                  border: `1px solid ${BORDER}`, background: '#21262D', color: '#8B949E',
                  fontSize: 11, cursor: 'pointer'
                }}>Reconfigurar archivo...</button>
              </div>
            )}
          </section>

          {mobile && (
            <button onClick={() => setShowParams(!showParams)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: ACCENT, borderRadius: 5, padding: '7px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              {showParams ? '▲ Ocultar parámetros' : '▼ Configurar parámetros'}
            </button>
          )}

          {(showParams || !mobile) && <>

            <section>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[2] Unidades</div>
              <select value={unitIdx} onChange={e => setUnitIdx(Number(e.target.value))} style={inp({ width: '100%' })}>
                {UNIT_OPTIONS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
              {unitIdx === 3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 11, color: '#8B949E' }}>Factor → cm/s²</span>
                  <input type="number" min={0.0001} step={0.01} value={customFactor}
                    onChange={e => setCustomFactor(parseFloat(e.target.value) || 1)}
                    style={inp({ width: 80, textAlign: 'right' })} />
                </div>
              )}
            </section>

            <section>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[3] Amortiguamiento</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: '#8B949E', flex: 1 }}>N. curvas</span>
                <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves - 1)}>−</button>
                <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{nCurves}</span>
                <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves + 1)}>+</button>
              </div>
              <button onClick={() => setDampings([...DEFAULT_DAMPINGS])} style={{ width: '100%', padding: '5px', borderRadius: 4, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontSize: 11, cursor: 'pointer', marginBottom: 5 }}>
                Defecto 0/1/2/3/5 %
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                {dampings.slice(0, nCurves).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: DAMPING_COLORS[i] }}></div>
                    <span style={{ fontSize: 11, color: '#8B949E' }}>ξ{i + 1}</span>
                    <input type="number" min={0} max={100} step={0.5} value={d}
                      onChange={e => setDamping(i, e.target.value)}
                      style={inp({ width: 52, textAlign: 'right', padding: '3px 5px' })} />
                    <span style={{ fontSize: 10, color: '#555' }}>%</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[4] Newmark-Beta</div>
              <select value={newmarkType} onChange={e => setNewmarkType(Number(e.target.value))} style={inp({ width: '100%' })}>
                <option value={0}>Accel. Constante (β=1/4, γ=1/2)</option>
                <option value={1}>Accel. Lineal (β=1/6, γ=1/2)</option>
              </select>
              <div style={{ fontSize: 10, color: '#3FB950', marginTop: 3 }}>
                {newmarkType === 0 ? '→ Incondicionalmente estable' : '→ Mayor precisión numérica'}
              </div>
            </section>

            <section>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[5] Rango del Espectro</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                {[
                  { label: 'T mín (s)',   val: TMin,     set: setTMin,     step: 0.01 },
                  { label: 'T máx (s)',   val: TMax,     set: setTMax,     step: 0.5 },
                  { label: 'N. periodos', val: nPeriods,  set: setNPeriods, step: 100 },
                ].map(({ label, val, set, step }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: '#8B949E', minWidth: 72 }}>{label}</span>
                    <input type="number" value={val} step={step}
                      onChange={e => set(parseFloat(e.target.value) || val)}
                      style={inp({ width: 72, textAlign: 'right', padding: '3px 5px' })} />
                  </div>
                ))}
              </div>
            </section>
          </>}

          <button onClick={handleCalculate} disabled={!canCalc} style={{
            width: '100%', padding: mobile ? '12px' : '10px', borderRadius: 6, border: 'none',
            background: canCalc ? ACCENT : '#21262D', color: canCalc ? '#fff' : '#555',
            fontWeight: 700, fontSize: 13, cursor: canCalc ? 'pointer' : 'not-allowed', letterSpacing: 0.6
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
              result.dampings, seismic.fileName, newmarkType, UNIT_OPTIONS[unitIdx].label
            )} style={{ width: '100%', padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Descargar espectro_respuesta.txt
            </button>
          )}
        </aside>

        {/* Gráficas */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: mobile ? 'visible' : 'hidden', minWidth: 0 }}>

          <div style={{ flex: 1, minHeight: mobile ? 280 : 0, padding: '8px 12px', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
              Acelerograma {seismic.fileInfo ? `— ${seismic.fileInfo.npts.toLocaleString()} pts · dt=${seismic.fileInfo.dt}s` : ''}
            </div>
            {seismic.accelChart ? (
              <ResponsiveContainer width="100%" height={mobile ? 240 : '100%'}>
                <LineChart data={seismic.accelChart} margin={{ top: 2, right: 8, left: 0, bottom: 16 }}>
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
              <div style={{ flex: 1, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
                Cargue un registro sísmico para visualizar el acelerograma.
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: mobile ? 300 : 0, padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
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
              <div style={{ flex: 1, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
                {seismic.fileInfo ? 'Presione CALCULAR ESPECTRO para generar el espectro.' : 'Cargue un registro sísmico y calcule el espectro.'}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
