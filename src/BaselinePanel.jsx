// ============================================================
//  BaselinePanel.jsx — INERTIX
//  Modal de Corrección de Línea Base
// ============================================================
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { computeBaseline, exportBaselineTxt } from './computeBaseline'

const ACCEL_OUT_UNITS = [
  { label: 'cm/s²', factor: 1         },
  { label: 'm/s²',  factor: 0.01      },
  { label: 'g',     factor: 1/980.665 },
]

const ACCENT  = '#E97817'
const BG_DARK = '#111318'
const BG_PANEL= '#181B22'
const BORDER  = '#2A2D35'
const BG_MOD  = '#1E2128'
const GREEN   = '#3FB950'
const BLUE    = '#60A5FA'

const inp = (x) => ({ background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3', borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', ...x })
const tp  = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }
const sec = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }

const ORDER_OPTS = [
  { id: 0, label: 'Constante (orden 0)' },
  { id: 1, label: 'Lineal (orden 1)' },
  { id: 2, label: 'Cuadrático (orden 2)' },
  { id: 3, label: 'Cúbico (orden 3)' },
]

export default function BaselinePanel({ accelArr, dt, fileName, onClose, onUseCorrecta }) {
  const [order,      setOrder]      = useState(1)
  const [result,     setResult]     = useState(null)
  const [err,        setErr]        = useState(null)
  const [outUnitIdx, setOutUnitIdx] = useState(0)

  const handleCompute = () => {
    try {
      setErr(null)
      setResult(computeBaseline(accelArr, dt, order))
    } catch (e) {
      setErr(e.message); setResult(null)
    }
  }

  // Siempre construye chartData; agrega 'corr' si hay resultado
  const chartData = useMemo(() => {
    const n    = accelArr.length
    const step = Math.max(1, Math.floor(n / 2000))
    const outF = ACCEL_OUT_UNITS[outUnitIdx].factor
    const data = []
    for (let i = 0; i < n; i += step) {
      const pt = {
        t:    parseFloat((i * dt).toFixed(4)),
        orig: parseFloat((accelArr[i] * outF).toFixed(5)),
      }
      if (result) pt.corr = parseFloat((result.corrected[i] * outF).toFixed(5))
      data.push(pt)
    }
    return data
  }, [result, accelArr, dt, outUnitIdx])

  const hasRecord = accelArr && accelArr.length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 10 }}>
      <div style={{ background: BG_MOD, border: `1px solid ${BORDER}`, borderRadius: 10, width: 'min(1120px,98vw)', maxHeight: '95vh', display: 'flex', flexDirection: 'column', color: '#E6EDF3', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '11px 18px', borderBottom: `1px solid ${BORDER}`, gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Corrección de Línea Base</span>
          <span style={{ fontSize: 11, color: '#555', flex: 1 }}>
            {fileName || ''}{accelArr ? ` — ${accelArr.length.toLocaleString()} pts · dt = ${dt} s` : ''}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8B949E', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Sidebar izquierdo */}
          <div style={{ width: 210, minWidth: 210, borderRight: `1px solid ${BORDER}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>

            <div style={sec}>Tipo de Polinomio</div>
            {ORDER_OPTS.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: order === o.id ? '#E6EDF3' : '#8B949E' }}>
                <input type="radio" name="blorder" checked={order === o.id} onChange={() => { setOrder(o.id); setResult(null); setErr(null) }} style={{ accentColor: ACCENT }} />
                {o.label}
              </label>
            ))}

            <button onClick={handleCompute} disabled={!hasRecord} style={{ marginTop: 6, padding: '9px', borderRadius: 5, border: 'none', background: hasRecord ? ACCENT : '#21262D', color: hasRecord ? '#fff' : '#555', fontWeight: 700, fontSize: 13, cursor: hasRecord ? 'pointer' : 'not-allowed' }}>
              Aplicar Corrección
            </button>

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginTop: 4 }}>
              <div style={sec}>Unidad gráfica / .txt</div>
              <select value={outUnitIdx} onChange={e => setOutUnitIdx(Number(e.target.value))}
                style={{ background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3', borderRadius: 5, padding: '5px 7px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}>
                {ACCEL_OUT_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>

            {!hasRecord && (
              <div style={{ fontSize: 11, color: ACCENT, padding: '6px 8px', background: '#21262D', borderRadius: 4 }}>
                Cargue un registro sísmico primero.
              </div>
            )}

            {err && (
              <div style={{ fontSize: 11, color: '#F85149', padding: '6px 8px', background: '#2D1515', borderRadius: 4 }}>{err}</div>
            )}

            {result && (<>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                <div style={sec}>Coeficientes P(t)</div>
                {result.coef.slice(0, result.order + 1).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: '#8B949E' }}>c{i}</span>
                    <span style={{ color: '#E6EDF3', fontFamily: 'monospace' }}>{c.toExponential(3)}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                <div style={sec}>Estadísticas (cm/s²)</div>
                {[
                  ['Media orig',  result.stats.meanOrig],
                  ['Media corr',  result.stats.meanCorr],
                  ['RMS orig',    result.stats.rmsOrig],
                  ['RMS corr',    result.stats.rmsCorr],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: '#8B949E' }}>{lbl}</span>
                    <span style={{ color: '#E6EDF3', fontFamily: 'monospace' }}>{val.toFixed(4)}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => onUseCorrecta(result.corrected, dt)} style={{ padding: '8px', borderRadius: 5, border: `1px solid ${GREEN}`, background: 'transparent', color: GREEN, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Usar señal corregida ✓
              </button>

              <button onClick={() => exportBaselineTxt(accelArr, result.corrected, result.poly, dt, result.coef, result.order, result.stats, fileName, ACCEL_OUT_UNITS[outUnitIdx].factor, ACCEL_OUT_UNITS[outUnitIdx].label)} style={{ padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Descargar .txt
              </button>
            </>)}
          </div>

          {/* Área principal: gráfica dual */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px', minWidth: 0, overflowY: 'auto' }}>

            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 8 }}>
              Acelerograma&nbsp;
              {result
                ? <span style={{ color: GREEN }}>— mostrando original (naranja) y corregida (azul)</span>
                : <span>— selecciona el polinomio y presiona Aplicar Corrección</span>
              }
            </div>

            {hasRecord ? (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData} margin={{ top: 4, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: `a (${ACCEL_OUT_UNITS[outUnitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 30 }} />
                  <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} />
                  {result && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  <Line type="monotone" dataKey="orig" name="Original"  stroke={ACCENT} dot={false} strokeWidth={1}   strokeOpacity={result ? 0.45 : 1} />
                  {result && <Line type="monotone" dataKey="corr" name="Corregida" stroke={BLUE}  dot={false} strokeWidth={1.5} />}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ flex: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 13, border: `1px dashed ${BORDER}`, borderRadius: 6 }}>
                Sin registro cargado
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
