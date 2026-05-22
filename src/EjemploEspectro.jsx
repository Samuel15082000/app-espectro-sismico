// =============================================================================
//  EjemploEspectro.jsx  —  INERTIX
//  Layout de 4 tabs: Corrección LB / Espectros Elásticos / Inelásticos / 1GDL
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNewmark } from './useNewmark'
import { useSeismic, exportTxt, FORMAT_TYPES, DECIMAL_SEPS, COL_SEPS, analyzeBlock, splitLine } from './useSeismic'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import BaselinePanel from './BaselinePanel'
import SDOFPanel     from './SDOFPanel'

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

const TABS = [
  'Corrección de Línea Base',
  'Espectros Elásticos',
  'Espectros Inelásticos',
  'Sistemas de 1 GDL',
]

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
//  MODAL — PASO 1: Selector de bloques detectados
// =============================================================================
const FMT_ICON = { single: '↕1', time_accel: '⏱+↕', multi_col: '⏱+⇶', horizontal: '→→' }

function BlockSelector({ blocks, rawLines, selectedIdx, onSelect, onNext, onCancel }) {
  const mobile = useIsMobile()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }}>
      <div style={{ background: BG_MODAL, border: `1px solid ${BORDER}`, borderRadius: 10, width: mobile ? '95vw' : 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: mobile ? 14 : 22, color: '#E6EDF3' }}>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Registros detectados en el archivo</div>
          <div style={{ fontSize: 11, color: '#8B949E', marginTop: 3 }}>
            {rawLines.length.toLocaleString()} líneas · {blocks.length} bloque{blocks.length !== 1 ? 's' : ''} de datos · Selecciona el registro a procesar
          </div>
        </div>

        {blocks.length === 0 ? (
          <div style={{ padding: 12, background: BG_DARK, borderRadius: 6, border: `1px solid ${BORDER}`, color: '#F85149', fontSize: 12 }}>
            No se detectaron bloques numéricos automáticamente. Configura el rango manualmente en el siguiente paso.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocks.map((b, i) => {
              const sel = i === selectedIdx
              const fmtLabel = FORMAT_TYPES.find(f => f.id === b.fmtGuess)?.label || b.fmtGuess
              const preview  = b.lastLineText.length > 55 ? b.lastLineText.slice(0, 55) + '…' : b.lastLineText
              return (
                <label key={i} onClick={() => onSelect(i)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', cursor: 'pointer', borderRadius: 7,
                  background: sel ? '#0D2218' : BG_DARK,
                  border: `1px solid ${sel ? '#3FB950' : BORDER}`,
                }}>
                  <input type="radio" readOnly checked={sel} style={{ accentColor: ACCENT, marginTop: 3, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: sel ? '#3FB950' : '#E6EDF3' }}>
                        Registro {i + 1}
                      </span>
                      <span style={{ fontSize: 11, color: '#8B949E', background: '#21262D', padding: '1px 7px', borderRadius: 3 }}>
                        {FMT_ICON[b.fmtGuess]} {fmtLabel}
                      </span>
                      <span style={{ fontSize: 11, color: '#8B949E' }}>
                        ~{b.npts.toLocaleString()} pts · {b.nCols} col/línea
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8B949E' }}>
                      Líneas <strong style={{ color: '#E6EDF3' }}>{b.start + 1}</strong> – <strong style={{ color: '#E6EDF3' }}>{b.end + 1}</strong>
                      <span style={{ color: '#555', marginLeft: 8 }}>({b.end - b.start + 1} líneas)</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 10, color: '#555' }}>
                      Última línea ({b.lastLineNum}):&nbsp;
                      <span style={{ fontFamily: 'monospace', color: '#8B949E' }}>{preview || '—'}</span>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#8B949E', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onNext} style={{ padding: '8px 28px', borderRadius: 5, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Configurar →
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
//  MODAL — PASO 2: Configuración del bloque seleccionado
// =============================================================================
function BlockConfig({ rawLines, blockAnalysis, detectedFormat, onApply, onBack, onCancel,
                       unitIdx: initUnitIdx, setUnitIdx: syncUnitIdx,
                       customFactor: initCustomFactor, setCustomFactor: syncCustomFactor }) {
  const mobile = useIsMobile()
  const d = blockAnalysis || {}

  const [colSep,      setColSep]      = useState(d.colSep || 'space')
  const [decSep,      setDecSep]      = useState(d.decSep || 'dot')
  const [userStart,   setUserStart]   = useState(d.start ?? 0)
  const [userEnd,     setUserEnd]     = useState(d.end ?? 0)
  const [format,      setFormat]      = useState(d.format || 'single')
  const [accelCol,    setAccelCol]    = useState(d.accelCol || 1)
  const [timeCol,     setTimeCol]     = useState(d.timeCol || 1)
  const [manualDt,    setManualDt]    = useState(d.dt || 0.01)
  const [scaleFactor, setScaleFactor] = useState(1.0)
  const [hasTimeCol,  setHasTimeCol]  = useState(!!d.hasTimeCol)
  const [localUnitIdx,      setLocalUnitIdx]      = useState(initUnitIdx ?? 0)
  const [localCustomFactor, setLocalCustomFactor] = useState(initCustomFactor ?? 1)

  const [lastInfo, setLastInfo] = useState({
    text: d.lastLineText || '', num: d.lastLineNum || 0, parsed: d.lastParsed || []
  })
  useEffect(() => {
    const endIdx = Math.min(userEnd, rawLines.length - 1)
    for (let i = endIdx; i >= userStart; i--) {
      const parts = splitLine(rawLines[i], colSep, decSep)
      if (parts.length > 0) {
        setLastInfo({ text: rawLines[i].trim(), num: i + 1, parsed: parts }); return
      }
    }
    setLastInfo({ text: '', num: 0, parsed: [] })
  }, [userStart, userEnd, colSep, decSep, rawLines])

  const lastAccelVal = () => {
    if (!lastInfo.parsed.length) return '—'
    const idx = (format === 'time_accel') ? (accelCol || 2) - 1
              : (format === 'multi_col')  ? (accelCol || 1) - 1
              : 0
    const v = lastInfo.parsed[Math.min(idx, lastInfo.parsed.length - 1)]
    return v !== undefined ? v.toFixed(6) : '—'
  }
  const lastTimeVal = () => {
    if (!lastInfo.parsed.length) return null
    if (format !== 'time_accel' && format !== 'multi_col') return null
    const idx = (timeCol || 1) - 1
    const v = lastInfo.parsed[Math.min(idx, lastInfo.parsed.length - 1)]
    return v !== undefined ? v.toFixed(4) : null
  }

  const previewStart = Math.max(0, userStart)
  const previewEnd   = Math.min(rawLines.length - 1, previewStart + 9)
  const preview = rawLines.slice(previewStart, previewEnd + 1).map((line, i) => ({
    num: previewStart + i + 1, text: line,
  }))

  const handleOK = () => {
    const localUnitFactor = UNIT_OPTIONS[localUnitIdx]?.factor !== null
      ? UNIT_OPTIONS[localUnitIdx].factor
      : localCustomFactor
    const effectiveTimeCol = hasTimeCol ? timeCol : accelCol
    syncUnitIdx?.(localUnitIdx)
    syncCustomFactor?.(localCustomFactor)
    onApply({ userStart, userEnd, format, accelCol, timeCol: effectiveTimeCol, colSep, decSep, scaleFactor, manualDt, unitFactor: localUnitFactor })
  }

  const labelS = { fontSize: 11, color: '#8B949E', minWidth: mobile ? 80 : 110 }
  const rowS   = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }
  const secS   = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }
  const sepS   = { borderTop: `1px solid ${BORDER}`, margin: '8px 0' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }}>
      <div style={{ background: BG_MODAL, border: `1px solid ${BORDER}`, borderRadius: 10, width: mobile ? '95vw' : 730, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: mobile ? 14 : 22, color: '#E6EDF3' }}>

        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {onBack && (
              <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#8B949E', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ← Registros
              </button>
            )}
            <span style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Configuración del registro</span>
          </div>
          <div style={{ fontSize: 11, color: '#8B949E' }}>
            Líneas {userStart + 1}–{userEnd + 1} · {rawLines.length.toLocaleString()} líneas en total
            {d.dtDetected && <span style={{ color: '#3FB950', marginLeft: 8 }}>· dt detectado: {d.dt?.toFixed(6)} s</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: 16 }}>

          {/* Columna izquierda */}
          <div style={{ flex: 1, minWidth: 0 }}>

            <div style={secS}>Separadores</div>
            <div style={rowS}>
              <span style={labelS}>Decimal</span>
              <select value={decSep} onChange={e => setDecSep(e.target.value)} style={inp({ flex: 1 })}>
                {DECIMAL_SEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div style={rowS}>
              <span style={labelS}>Columnas</span>
              <select value={colSep} onChange={e => setColSep(e.target.value)} style={inp({ flex: 1 })}>
                {COL_SEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div style={sepS}></div>
            <div style={secS}>Rango de datos</div>
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

            <div style={sepS}></div>
            <div style={secS}>Formato</div>
            {FORMAT_TYPES.map(f => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, cursor: 'pointer', fontSize: 12, color: format === f.id ? '#E6EDF3' : '#8B949E' }}>
                <input type="radio" name="fmt" value={f.id} checked={format === f.id}
                  onChange={() => setFormat(f.id)} style={{ accentColor: ACCENT }} />
                {f.label}
                {f.id === detectedFormat && <span style={{ fontSize: 9, color: '#3FB950', marginLeft: 4 }}>(detectado)</span>}
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
                {format === 'multi_col' && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer', fontSize: 11, color: '#8B949E' }}>
                      <input type="checkbox" checked={hasTimeCol} onChange={e => setHasTimeCol(e.target.checked)}
                        style={{ accentColor: ACCENT, width: 13, height: 13 }} />
                      ¿El archivo tiene columna de tiempo?
                      <span style={{ fontSize: 9, color: hasTimeCol ? '#3FB950' : '#555' }}>
                        {hasTimeCol ? '(detectado)' : '(solo aceleraciones)'}
                      </span>
                    </label>
                    {hasTimeCol && (
                      <div style={rowS}>
                        <span style={labelS}>Col. Tiempo</span>
                        <input type="number" min={1} max={20} value={timeCol}
                          onChange={e => setTimeCol(Math.max(1, Number(e.target.value)))}
                          style={inp({ width: 55, textAlign: 'right' })} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={sepS}></div>
            <div style={secS}>Parámetros</div>
            <div style={rowS}>
              <span style={labelS}>dt (s)</span>
              <input type="number" min={0.00001} step={0.001} value={manualDt}
                onChange={e => setManualDt(parseFloat(e.target.value) || 0.01)}
                style={inp({ width: 100, textAlign: 'right' })}
                disabled={hasTimeCol && d.dtDetected} />
              {hasTimeCol && d.dtDetected
                ? <span style={{ fontSize: 9, color: '#3FB950' }}>auto (columna tiempo)</span>
                : <span style={{ fontSize: 9, color: ACCENT }}>ingrese manualmente</span>}
            </div>
            <div style={rowS}>
              <span style={labelS}>Scaling factor</span>
              <input type="number" min={0.00001} step={0.1} value={scaleFactor}
                onChange={e => setScaleFactor(parseFloat(e.target.value) || 1)}
                style={inp({ width: 100, textAlign: 'right' })} />
            </div>

            <div style={sepS}></div>
            <div style={secS}>Unidades de entrada</div>
            {UNIT_OPTIONS.map((u, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, marginBottom: 4, color: localUnitIdx === i ? '#E6EDF3' : '#8B949E' }}>
                <input type="radio" name="blunit" checked={localUnitIdx === i}
                  onChange={() => { setLocalUnitIdx(i); if (u.factor !== null) setLocalCustomFactor(u.factor) }}
                  style={{ accentColor: ACCENT }} />
                {u.label}
              </label>
            ))}
            {localUnitIdx === 3 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#8B949E' }}>Factor → cm/s²</span>
                <input type="number" min={0.0001} step={0.01} value={localCustomFactor}
                  onChange={e => setLocalCustomFactor(parseFloat(e.target.value) || 1)}
                  style={inp({ width: 80, textAlign: 'right' })} />
              </div>
            )}

            <div style={sepS}></div>
            <div style={secS}>Último valor del registro</div>
            <div style={{ padding: '8px 10px', background: BG_DARK, borderRadius: 6, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Línea {lastInfo.num || '—'}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#8B949E', wordBreak: 'break-all', marginBottom: 8 }}>
                {lastInfo.text || '(sin datos en este rango)'}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {lastTimeVal() !== null && (
                  <div>
                    <span style={{ fontSize: 10, color: '#8B949E' }}>t =&nbsp;</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA' }}>{lastTimeVal()} s</span>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: 10, color: '#8B949E' }}>a =&nbsp;</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3FB950' }}>{lastAccelVal()}</span>
                  <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>(unidades entrada)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha: preview */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={secS}>Vista previa</div>
            <div style={{
              background: BG_DARK, border: `1px solid ${BORDER}`, borderRadius: 6,
              padding: 8, fontFamily: 'monospace', fontSize: 11,
              maxHeight: 360, overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.7,
            }}>
              {preview.map(p => (
                <div key={p.num}>
                  <span style={{ color: '#484F58', display: 'inline-block', width: 38, textAlign: 'right', marginRight: 8 }}>{p.num}</span>
                  <span style={{ color: '#E6EDF3' }}>{p.text || '(vacía)'}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              {d.nCols || '?'} col/línea · ~{(userEnd - userStart + 1).toLocaleString()} líneas seleccionadas
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#8B949E', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleOK} style={{ padding: '8px 28px', borderRadius: 5, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            OK — Cargar registro
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
//  MODAL ORQUESTADOR (2 pasos)
// =============================================================================
function FileConfigModal({ rawLines, detectedConfig, onApply, onCancel, unitIdx, setUnitIdx, customFactor, setCustomFactor }) {
  const d      = detectedConfig || {}
  const blocks = d.blocks || []

  const [step,           setStep]           = useState(blocks.length > 0 ? 1 : 2)
  const [selectedIdx,    setSelectedIdx]    = useState(d.selectedBlockIdx ?? 0)
  const [blockAnalysis,  setBlockAnalysis]  = useState(d)

  const selectBlock = (idx) => {
    setSelectedIdx(idx)
    const b = blocks[idx]
    if (b) setBlockAnalysis(analyzeBlock(rawLines, b.start, b.end))
  }

  const goToStep2 = () => {
    if (blocks.length > 0) selectBlock(selectedIdx)
    setStep(2)
  }

  if (step === 1) {
    return (
      <BlockSelector
        blocks={blocks}
        rawLines={rawLines}
        selectedIdx={selectedIdx}
        onSelect={selectBlock}
        onNext={goToStep2}
        onCancel={onCancel}
      />
    )
  }

  return (
    <BlockConfig
      rawLines={rawLines}
      blockAnalysis={blockAnalysis}
      detectedFormat={d.format}
      onApply={onApply}
      onBack={blocks.length > 0 ? () => setStep(1) : null}
      onCancel={onCancel}
      unitIdx={unitIdx}
      setUnitIdx={setUnitIdx}
      customFactor={customFactor}
      setCustomFactor={setCustomFactor}
    />
  )
}

// =============================================================================
//  COMPONENTE PRINCIPAL
// =============================================================================
export default function EjemploEspectro() {
  const { ready, loadError, computeSpectrum } = useNewmark()
  const mobile = useIsMobile()
  const seismic = useSeismic()

  // Shared state
  const [unitIdx,      setUnitIdx]      = useState(0)
  const [customFactor, setCustomFactor] = useState(1)
  const [activeTab,    setActiveTab]    = useState(0)

  // Espectros Elásticos tab state
  const [newmarkType,  setNewmarkType]  = useState(0)
  const [nCurves,      setNCurves]      = useState(5)
  const [dampings,     setDampings]     = useState([...DEFAULT_DAMPINGS])
  const [nPeriods,     setNPeriods]     = useState(1000)
  const [TMin,         setTMin]         = useState(0.01)
  const [TMax,         setTMax]         = useState(10.0)
  const [showParams,   setShowParams]   = useState(true)
  const [result,       setResult]       = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [staleResult,  setStaleResult]  = useState(false)

  const unitFactor = UNIT_OPTIONS[unitIdx].factor !== null ? UNIT_OPTIONS[unitIdx].factor : customFactor

  const prevUnitFactor = useRef(unitFactor)
  useEffect(() => {
    if (prevUnitFactor.current === unitFactor) return
    prevUnitFactor.current = unitFactor
    if (seismic.parsedRef.current.accelRaw?.length) {
      seismic.rescaleAccel(unitFactor)
      if (result) setStaleResult(true)
    }
  }, [unitFactor])

  const handleCalculate = useCallback(async () => {
    const { accel, dt } = seismic.parsedRef.current
    if (!accel || !dt) { seismic.setStatus({ type: 'error', msg: 'Cargue un registro sísmico primero.' }); return }
    setLoading(true)
    setStaleResult(false)
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

  const handleUseCorrecta = useCallback((correctedAccel, corrDt) => {
    seismic.parsedRef.current = { accel: correctedAccel, dt: corrDt }
    const step = Math.max(1, Math.floor(correctedAccel.length / 2000))
    const chart = []
    for (let i = 0; i < correctedAccel.length; i += step) {
      chart.push({
        t: parseFloat((i * corrDt).toFixed(4)),
        a: parseFloat(correctedAccel[i].toFixed(6)),
      })
    }
    seismic.setAccelChart(chart)
    seismic.setStatus({ type: 'success', msg: 'Señal corregida aplicada. Recalcule el espectro.' })
  }, [seismic])

  const canCalc = !!seismic.parsedRef.current.accel && ready && !loading
  const { status } = seismic

  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: BG_DARK, color: '#E6EDF3', fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Modal de carga de archivo */}
      {seismic.showModal && seismic.rawLines.length > 0 && (
        <FileConfigModal
          rawLines={seismic.rawLines}
          detectedConfig={seismic.detectedConfig}
          unitIdx={unitIdx}
          setUnitIdx={setUnitIdx}
          customFactor={customFactor}
          setCustomFactor={setCustomFactor}
          onApply={config => { seismic.applyConfig(config); setStaleResult(false) }}
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

      {/* Barra de navegación de tabs */}
      <div style={{ background: BG_PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map((label, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            style={{
              padding: mobile ? '9px 13px' : '10px 22px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${activeTab === i ? ACCENT : 'transparent'}`,
              color: activeTab === i ? ACCENT : '#8B949E',
              fontWeight: activeTab === i ? 700 : 400,
              fontSize: mobile ? 12 : 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              letterSpacing: 0.3,
              fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Layout principal */}
      <div style={{ display: 'flex', flex: 1, flexDirection: mobile ? 'column' : 'row', overflow: mobile ? 'auto' : 'hidden', minHeight: 0 }}>

        {/* ── Sidebar compartido: Registro + Unidades ── */}
        <aside style={{
          width: mobile ? '100%' : 240,
          minWidth: mobile ? 'auto' : 240,
          background: BG_PANEL,
          borderRight: mobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: mobile ? `1px solid ${BORDER}` : 'none',
          padding: 12,
          overflowY: mobile ? 'visible' : 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
          flexShrink: 0,
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

          {/* [2] Unidades de entrada — compartido: afecta todos los tabs */}
          <section>
            <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' }}>[2] Unidades de Entrada</div>
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

          {status && (
            <div style={{
              fontSize: 11, padding: '7px 9px', borderRadius: 5,
              background: status.type === 'error' ? '#2D1515' : status.type === 'success' ? '#0D2B1A' : '#1C2333',
              color: status.type === 'error' ? '#F85149' : status.type === 'success' ? '#3FB950' : '#8B949E',
              border: `1px solid ${status.type === 'error' ? '#3D1F1F' : status.type === 'success' ? '#1A3D2B' : BORDER}`,
            }}>{status.msg}</div>
          )}
        </aside>

        {/* ── Área de tabs ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>

          {/* ── Tab 0: Corrección de Línea Base ── */}
          <div style={{ flex: 1, display: activeTab === 0 ? 'flex' : 'none', overflow: 'hidden' }}>
            <BaselinePanel
              accelArr={seismic.parsedRef.current.accel || []}
              dt={seismic.parsedRef.current.dt || 0.01}
              fileName={seismic.fileName}
              onUseCorrecta={handleUseCorrecta}
            />
          </div>

          {/* ── Tab 1: Espectros Elásticos ── */}
          <div style={{ flex: 1, display: activeTab === 1 ? 'flex' : 'none', flexDirection: mobile ? 'column' : 'row', overflow: mobile ? 'auto' : 'hidden' }}>

            {/* Params sidebar específico del tab */}
            <aside style={{
              width: mobile ? '100%' : 260,
              minWidth: mobile ? 'auto' : 260,
              background: BG_PANEL,
              borderRight: mobile ? 'none' : `1px solid ${BORDER}`,
              borderBottom: mobile ? `1px solid ${BORDER}` : 'none',
              padding: 12,
              overflowY: mobile ? 'visible' : 'auto',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>

              {mobile && (
                <button onClick={() => setShowParams(!showParams)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: ACCENT, borderRadius: 5, padding: '7px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  {showParams ? '▲ Ocultar parámetros' : '▼ Configurar parámetros'}
                </button>
              )}

              {(showParams || !mobile) && <>
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
                      { label: 'T mín (s)',   val: TMin,    set: setTMin,    step: 0.01 },
                      { label: 'T máx (s)',   val: TMax,    set: setTMax,    step: 0.5 },
                      { label: 'N. periodos', val: nPeriods, set: setNPeriods, step: 100 },
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

              {staleResult && (
                <div style={{ fontSize: 11, padding: '6px 9px', borderRadius: 5, background: '#2A1F0A', color: '#FBBF24', border: '1px solid #4A3A10' }}>
                  ⚠ Unidades modificadas — espectro no actualizado
                </div>
              )}

              <button onClick={handleCalculate} disabled={!canCalc} style={{
                width: '100%', padding: mobile ? '12px' : '10px', borderRadius: 6, border: 'none',
                background: canCalc ? ACCENT : '#21262D', color: canCalc ? '#fff' : '#555',
                fontWeight: 700, fontSize: 13, cursor: canCalc ? 'pointer' : 'not-allowed', letterSpacing: 0.6
              }}>
                {loading ? 'CALCULANDO...' : 'CALCULAR ESPECTRO'}
              </button>

              {result && (
                <button onClick={() => exportTxt(
                  Array.from(result.periods), result.Sa.map(c => Array.from(c)),
                  result.dampings, seismic.fileName, newmarkType, UNIT_OPTIONS[unitIdx].label
                )} style={{ width: '100%', padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  Descargar espectro_respuesta.txt
                </button>
              )}
            </aside>

            {/* Área de gráficas */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: mobile ? 'visible' : 'hidden', minWidth: 0 }}>
              <div style={{ flex: 1, minHeight: mobile ? 280 : 0, padding: '8px 12px', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
                  Acelerograma {seismic.fileInfo ? `— ${seismic.fileInfo.npts.toLocaleString()} pts · dt=${seismic.fileInfo.dt}s` : ''}
                </div>
                {seismic.accelChart ? (
                  <ResponsiveContainer width="100%" height={mobile ? 240 : '100%'}>
                    <LineChart
                      data={seismic.accelChart.map(p => ({ t: p.t, a: p.a / unitFactor }))}
                      margin={{ top: 2, right: 8, left: 0, bottom: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                      <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                        label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                      <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                        label={{ value: `a (${UNIT_OPTIONS[unitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 40 }} />
                      <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v} ${UNIT_OPTIONS[unitIdx].label}`, 'a']} />
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

          {/* ── Tab 2: Espectros Inelásticos ── */}
          <div style={{ flex: 1, display: activeTab === 2 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 48, opacity: 0.15 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#555' }}>Espectros Inelásticos</div>
            <div style={{ fontSize: 12, color: '#3A3D45' }}>Próximamente</div>
          </div>

          {/* ── Tab 3: Sistemas de 1 GDL ── */}
          <div style={{ flex: 1, display: activeTab === 3 ? 'flex' : 'none', overflow: 'hidden' }}>
            <SDOFPanel
              accelArr={seismic.parsedRef.current.accel || []}
              dt={seismic.parsedRef.current.dt || 0.01}
              fileName={seismic.fileName}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
