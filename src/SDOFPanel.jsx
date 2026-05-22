// ============================================================
//  SDOFPanel.jsx — INERTIX
//  Modal de Análisis SDOF No Lineal (Bilineal, Newmark-Beta)
// ============================================================
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter,
} from 'recharts'
import { computeSDOF, exportSDOFTxt, MASS_UNITS, STIFF_UNITS, UY_UNITS } from './computeSDOF'

const ACCENT  = '#E97817'
const BG_DARK = '#111318'
const BG_PANEL= '#181B22'
const BORDER  = '#2A2D35'
const BG_MOD  = '#1E2128'
const GREEN   = '#3FB950'
const BLUE    = '#60A5FA'
const PURPLE  = '#A78BFA'
const YELLOW  = '#FBBF24'

const DISP_UNITS  = [
  { label: 'cm',  factor: 100       },
  { label: 'm',   factor: 1         },
  { label: 'mm',  factor: 1000      },
]
const ACCEL_UNITS = [
  { label: 'cm/s²', factor: 100       },
  { label: 'm/s²',  factor: 1         },
  { label: 'g',     factor: 1/9.80665 },
]
const FORCE_UNITS = [
  { label: 'kN',   factor: 1          },
  { label: 'tonf', factor: 1/9.80665  },
  { label: 'N',    factor: 1000       },
]

const inp = (x) => ({ background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3', borderRadius: 5, padding: '5px 7px', fontSize: 12, boxSizing: 'border-box', ...x })
const tp  = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }
const sec = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }
const row = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }
const lbl = { fontSize: 11, color: '#8B949E', minWidth: 30 }

export default function SDOFPanel({ accelArr, dt, fileName, onClose }) {
  // Parámetros del sistema
  const [m,       setM]       = useState(1.0)
  const [mUnit,   setMUnit]   = useState(0)   // índice MASS_UNITS
  const [k,       setK]       = useState(100.0)
  const [kUnit,   setKUnit]   = useState(0)   // índice STIFF_UNITS
  const [xi,      setXi]      = useState(5.0) // % amortiguamiento
  // Modelo no lineal
  const [uyVal,   setUyVal]   = useState(2.0) // valor numérico
  const [uyUnit,  setUyUnit]  = useState(0)   // índice UY_UNITS (cm)
  const [alpha,   setAlpha]   = useState(2.0) // % endurecimiento
  // Newmark
  const [betaN,   setBetaN]   = useState(0.25)
  const [gammaN,  setGammaN]  = useState(0.50)
  const [maxIter, setMaxIter] = useState(50)
  const [tol,     setTol]     = useState(1e-6)
  // Unidades de salida
  const [dispUnitIdx,  setDispUnitIdx]  = useState(0)
  const [accelUnitIdx, setAccelUnitIdx] = useState(0)
  const [forceUnitIdx, setForceUnitIdx] = useState(0)
  // Resultado
  const [result,  setResult]  = useState(null)
  const [err,     setErr]     = useState(null)
  const [loading, setLoading] = useState(false)

  const hasRecord = accelArr && accelArr.length > 0

  // Período estimado con parámetros actuales
  const mSI = m * MASS_UNITS[mUnit].factor
  const kSI = k * STIFF_UNITS[kUnit].factor
  const Testim = mSI > 0 && kSI > 0 ? (2 * Math.PI * Math.sqrt(mSI / kSI)).toFixed(4) : '—'

  const handleCalculate = () => {
    if (!hasRecord) { setErr('Cargue un registro sísmico primero.'); return }
    setLoading(true); setResult(null); setErr(null)
    // setTimeout para dar tiempo al render de "Calculando..."
    setTimeout(() => {
      try {
        const mTon  = m * MASS_UNITS[mUnit].factor
        const kKNm  = k * STIFF_UNITS[kUnit].factor
        const uyM   = uyVal * UY_UNITS[uyUnit].factor
        const xiDec = xi / 100
        const aAlp  = alpha / 100
        // convertir acelerograma de cm/s² a m/s²
        const ugMs2 = accelArr.map(v => v * 0.01)

        if (mTon <= 0)  throw new Error('La masa debe ser > 0')
        if (kKNm <= 0)  throw new Error('La rigidez debe ser > 0')
        if (uyM  <= 0)  throw new Error('El desplazamiento de fluencia debe ser > 0')
        if (xiDec < 0 || xiDec > 1) throw new Error('Amortiguamiento fuera de rango [0, 100]%')

        const res = computeSDOF({
          m: mTon, k: kKNm, xi: xiDec,
          betaN, gammaN, dt,
          uy: uyM, alpha: aAlp,
          ug: ugMs2,
          tol, maxIter,
        })
        setResult(res)
      } catch (e) {
        setErr(e.message)
      }
      setLoading(false)
    }, 30)
  }

  // Datos para gráficas de series de tiempo (downsample)
  const timeChartData = useMemo(() => {
    if (!result) return null
    const n      = result.u.length
    const step   = Math.max(1, Math.floor(n / 2000))
    const dispF  = DISP_UNITS[dispUnitIdx].factor
    const accelF = ACCEL_UNITS[accelUnitIdx].factor
    const data   = []
    for (let i = 0; i < n; i += step) {
      data.push({
        t: parseFloat((i * dt).toFixed(4)),
        u: parseFloat((result.u[i]    * dispF).toFixed(5)),
        v: parseFloat(result.v[i].toFixed(6)),
        a: parseFloat((result.aAbs[i] * accelF).toFixed(5)),
      })
    }
    return data
  }, [result, dt, dispUnitIdx, accelUnitIdx])

  // Datos para lazo histéretico (u en cm, fs en kN)
  const hystData = useMemo(() => {
    if (!result) return null
    const n      = result.u.length
    const step   = Math.max(1, Math.floor(n / 3000))
    const dispF  = DISP_UNITS[dispUnitIdx].factor
    const forceF = FORCE_UNITS[forceUnitIdx].factor
    const data   = []
    for (let i = 0; i < n; i += step) {
      data.push({
        u:  parseFloat((result.u[i] * dispF).toFixed(5)),
        fs: parseFloat((result.fs[i] * forceF).toFixed(5)),
      })
    }
    return data
  }, [result, dispUnitIdx, forceUnitIdx])

  const paramsSI = { m: mSI, k: kSI, xi: xi / 100, uy: uyVal * UY_UNITS[uyUnit].factor, alpha: alpha / 100 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '11px 18px', borderBottom: `1px solid ${BORDER}`, gap: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Sistemas de 1 GDL — Análisis No Lineal</span>
          <span style={{ fontSize: 11, color: '#555', flex: 1 }}>
            Modelo bilineal · Newmark-Beta
            {hasRecord && <span style={{ color: '#3FB950', marginLeft: 8 }}>· {accelArr.length.toLocaleString()} pts</span>}
          </span>
          {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8B949E', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>}
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Sidebar de parámetros */}
          <div style={{ width: 230, minWidth: 230, borderRight: `1px solid ${BORDER}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>

            {/* Sistema */}
            <div style={sec}>[1] Sistema</div>
            <div style={row}>
              <span style={lbl}>m</span>
              <input type="number" min={0} step={0.1} value={m} onChange={e => setM(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <select value={mUnit} onChange={e => setMUnit(Number(e.target.value))} style={inp({ flex: 1 })}>
                {MASS_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={row}>
              <span style={lbl}>k</span>
              <input type="number" min={0} step={1} value={k} onChange={e => setK(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <select value={kUnit} onChange={e => setKUnit(Number(e.target.value))} style={inp({ flex: 1 })}>
                {STIFF_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={row}>
              <span style={lbl}>ξ</span>
              <input type="number" min={0} max={100} step={0.5} value={xi} onChange={e => setXi(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <span style={{ fontSize: 11, color: '#8B949E' }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
              T = <span style={{ color: ACCENT }}>{Testim} s</span>
            </div>

            {/* Modelo no lineal */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>[2] Modelo Bilineal</div>
            <div style={row}>
              <span style={lbl}>u<sub>y</sub></span>
              <input type="number" min={0} step={0.1} value={uyVal} onChange={e => setUyVal(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <select value={uyUnit} onChange={e => setUyUnit(Number(e.target.value))} style={inp({ flex: 1 })}>
                {UY_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
              Fy = <span style={{ color: '#8B949E' }}>{kSI > 0 && uyVal > 0 ? (kSI * uyVal * UY_UNITS[uyUnit].factor).toFixed(3) : '—'} kN</span>
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 40 }}>α</span>
              <input type="number" min={0} max={100} step={0.5} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <span style={{ fontSize: 11, color: '#8B949E' }}>%</span>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
              {alpha === 0 ? 'Elastoplástico perfecto' : `Post-fluencia: ${alpha}% × k`}
            </div>

            {/* Newmark */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>[3] Newmark-Beta</div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>β</span>
              <input type="number" min={0} max={0.5} step={0.01} value={betaN} onChange={e => setBetaN(parseFloat(e.target.value) || 0.25)} style={inp({ width: 75, textAlign: 'right' })} />
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>γ</span>
              <input type="number" min={0} max={1} step={0.01} value={gammaN} onChange={e => setGammaN(parseFloat(e.target.value) || 0.5)} style={inp({ width: 75, textAlign: 'right' })} />
            </div>
            <div style={{ fontSize: 10, color: betaN === 0.25 ? '#3FB950' : ACCENT, marginBottom: 4 }}>
              {betaN === 0.25 ? '→ Incondicionalmente estable' : '→ Verificar estabilidad'}
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>iter</span>
              <input type="number" min={10} max={500} step={10} value={maxIter}
                onChange={e => setMaxIter(Math.max(10, Number(e.target.value)))}
                style={inp({ width: 75, textAlign: 'right' })} />
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>tol</span>
              <input type="number" min={1e-12} step={1e-7} value={tol}
                onChange={e => setTol(parseFloat(e.target.value) || 1e-6)}
                style={inp({ width: 75, textAlign: 'right' })} />
            </div>

            {/* [4] Unidades de salida */}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>[4] Unidades Salida</div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>u</span>
              <select value={dispUnitIdx} onChange={e => setDispUnitIdx(Number(e.target.value))} style={inp({ flex: 1 })}>
                {DISP_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>a</span>
              <select value={accelUnitIdx} onChange={e => setAccelUnitIdx(Number(e.target.value))} style={inp({ flex: 1 })}>
                {ACCEL_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>fs</span>
              <select value={forceUnitIdx} onChange={e => setForceUnitIdx(Number(e.target.value))} style={inp({ flex: 1 })}>
                {FORCE_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>

            {/* Botón calcular */}
            <button onClick={handleCalculate} disabled={loading || !hasRecord} style={{ padding: '10px', borderRadius: 5, border: 'none', background: loading || !hasRecord ? '#21262D' : ACCENT, color: loading || !hasRecord ? '#555' : '#fff', fontWeight: 700, fontSize: 13, cursor: loading || !hasRecord ? 'not-allowed' : 'pointer' }}>
              {loading ? 'CALCULANDO...' : 'CALCULAR'}
            </button>

            {!hasRecord && (
              <div style={{ fontSize: 11, color: ACCENT, padding: '6px 8px', background: '#21262D', borderRadius: 4 }}>
                Cargue un registro primero.
              </div>
            )}

            {err && (
              <div style={{ fontSize: 11, color: '#F85149', padding: '6px 8px', background: '#2D1515', borderRadius: 4 }}>{err}</div>
            )}

            {/* Resultados */}
            {result && (<>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                <div style={sec}>Resultados</div>
                {[
                  ['max|u|',     `${(result.maxU * DISP_UNITS[dispUnitIdx].factor).toFixed(4)} ${DISP_UNITS[dispUnitIdx].label}`],
                  ['max|v|',     `${result.maxV.toFixed(4)} m/s`],
                  ['max|a_abs|', `${(result.maxAbs * ACCEL_UNITS[accelUnitIdx].factor).toFixed(4)} ${ACCEL_UNITS[accelUnitIdx].label}`],
                  ['Ductilidad', `${result.ductility.toFixed(3)}`],
                  ['T',          `${result.T.toFixed(4)} s`],
                ].map(([lbl2, val]) => (
                  <div key={lbl2} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: '#8B949E' }}>{lbl2}</span>
                    <span style={{ color: '#E6EDF3', fontFamily: 'monospace', fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
                {!result.convergedAll && (
                  <div style={{ fontSize: 10, color: YELLOW, marginTop: 4 }}>
                    ⚠ Algunos pasos no convergieron. Reducir dt o aumentar max iter.
                  </div>
                )}
              </div>

              <button onClick={() => exportSDOFTxt(result, dt, paramsSI, fileName, { disp: DISP_UNITS[dispUnitIdx], accel: ACCEL_UNITS[accelUnitIdx], force: FORCE_UNITS[forceUnitIdx] })} style={{ padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Descargar .txt
              </button>
            </>)}
          </div>

          {/* Área de gráficas */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10, overflowY: 'auto', minWidth: 0 }}>

            {!result && !loading && (
              <div style={{ flex: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 13, border: `1px dashed ${BORDER}`, borderRadius: 6 }}>
                {hasRecord ? 'Configure los parámetros y presione CALCULAR' : 'Sin registro cargado'}
              </div>
            )}

            {loading && (
              <div style={{ flex: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontSize: 13 }}>
                Calculando integración Newmark...
              </div>
            )}

            {result && timeChartData && (<>

              {/* Gráfica 1: Desplazamiento u(t) */}
              <div>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
                  Desplazamiento u(t) &nbsp;
                  <span style={{ color: GREEN }}>max = {(result.maxU * DISP_UNITS[dispUnitIdx].factor).toFixed(4)} {DISP_UNITS[dispUnitIdx].label}</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={timeChartData} margin={{ top: 2, right: 10, left: 0, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                    <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                    <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: `u (${DISP_UNITS[dispUnitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 20 }} />
                    <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v} ${DISP_UNITS[dispUnitIdx].label}`, 'u']} />
                    <Line type="monotone" dataKey="u" stroke={GREEN} dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfica 2: Aceleración absoluta a_abs(t) */}
              <div>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
                  Aceleración absoluta a<sub>abs</sub>(t) &nbsp;
                  <span style={{ color: BLUE }}>max = {(result.maxAbs * ACCEL_UNITS[accelUnitIdx].factor).toFixed(4)} {ACCEL_UNITS[accelUnitIdx].label}</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={timeChartData} margin={{ top: 2, right: 10, left: 0, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                    <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                    <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: `a (${ACCEL_UNITS[accelUnitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 30 }} />
                    <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v} ${ACCEL_UNITS[accelUnitIdx].label}`, 'a_abs']} />
                    <Line type="monotone" dataKey="a" stroke={BLUE} dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfica 3: Lazo histéretico F-u */}
              <div>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
                  Lazo Histéretico — Fuerza restitutiva vs Desplazamiento &nbsp;
                  <span style={{ color: PURPLE }}>μ = {result.ductility.toFixed(3)}</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ top: 4, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                    <XAxis dataKey="u" type="number" name="u" stroke="#21262D"
                      tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: `u (${DISP_UNITS[dispUnitIdx].label})`, position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                    <YAxis dataKey="fs" type="number" name="fs" stroke="#21262D"
                      tick={{ fontSize: 10, fill: '#8B949E' }}
                      label={{ value: `fs (${FORCE_UNITS[forceUnitIdx].label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 20 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: BG_PANEL, border: `1px solid ${BORDER}`, fontSize: 11 }}
                      formatter={(v, n) => [v, n === 'u' ? `u (${DISP_UNITS[dispUnitIdx].label})` : `fs (${FORCE_UNITS[forceUnitIdx].label})`]} />
                    <Scatter data={hystData} line={{ stroke: PURPLE, strokeWidth: 1 }} fill="transparent" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

            </>)}
          </div>
        </div>
    </div>
  )
}
