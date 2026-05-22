// ============================================================
//  SDOFPanel.jsx — INERTIX
//  Tab 3: Sistemas de 1 GDL — Lineal / No Lineal
// ============================================================
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
  ScatterChart, Scatter,
} from 'recharts'
import {
  computeSDOF, computeLinearSDOF,
  exportSDOFTxt, exportLinearTxt,
  MASS_UNITS, STIFF_UNITS, UY_UNITS,
} from './computeSDOF'

// ── Colores ──────────────────────────────────────────────────────────────────
const ACCENT  = '#E97817'
const BG_DARK = '#111318'
const BG_PANEL= '#181B22'
const BORDER  = '#2A2D35'
const GREEN   = '#3FB950'
const BLUE    = '#60A5FA'
const PURPLE  = '#A78BFA'
const CYAN    = '#22D3EE'
const YELLOW  = '#FBBF24'

// ── Presets Newmark ──────────────────────────────────────────────────────────
const NEWMARK_PRESETS = [
  { label: 'Aceleración Constante  (β = 1/4, γ = 1/2)', beta: 0.25,      gamma: 0.5 },
  { label: 'Aceleración Lineal     (β = 1/6, γ = 1/2)', beta: 1.0 / 6.0, gamma: 0.5 },
]

// ── Unidades de salida ───────────────────────────────────────────────────────
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
  { label: 'kN',   factor: 1         },
  { label: 'tonf', factor: 1/9.80665 },
  { label: 'N',    factor: 1000      },
]

// ── Estilos ──────────────────────────────────────────────────────────────────
const inp = (x) => ({ background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3', borderRadius: 5, padding: '5px 7px', fontSize: 12, boxSizing: 'border-box', ...x })
const tp  = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }
const sec = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }
const row = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }
const lbl = { fontSize: 11, color: '#8B949E', minWidth: 30 }

// ── Sub-componente: gráfica de serie de tiempo ────────────────────────────────
function TimeChart({ data, dataKey, color, yLabel, title, maxStr }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
        {title}&nbsp;<span style={{ color }}>{maxStr}</span>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} margin={{ top: 2, right: 10, left: 0, bottom: 18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
          <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
            label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
          <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 25 }} />
          <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} />
          <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SDOFPanel({ accelArr, dt, fileName, onClose }) {

  // Modo de análisis
  const [mode, setMode] = useState('nonlinear')   // 'linear' | 'nonlinear'

  // Parámetros compartidos
  const [m,     setM]     = useState(1.0)
  const [mUnit, setMUnit] = useState(0)
  const [k,     setK]     = useState(100.0)
  const [kUnit, setKUnit] = useState(0)
  const [xi,    setXi]    = useState(5.0)   // %

  // Parámetros no lineales
  const [uyVal,  setUyVal]  = useState(2.0)
  const [uyUnit, setUyUnit] = useState(0)
  const [alpha,  setAlpha]  = useState(2.0)  // %

  // Newmark (preset fijo)
  const [presetIdx, setPresetIdx] = useState(0)
  const betaN  = NEWMARK_PRESETS[presetIdx].beta
  const gammaN = NEWMARK_PRESETS[presetIdx].gamma

  // Unidades de salida
  const [dispUnitIdx,  setDispUnitIdx]  = useState(0)
  const [accelUnitIdx, setAccelUnitIdx] = useState(0)
  const [forceUnitIdx, setForceUnitIdx] = useState(0)

  // Estado de UI
  const [result,  setResult]  = useState(null)
  const [err,     setErr]     = useState(null)
  const [loading, setLoading] = useState(false)

  const hasRecord = accelArr && accelArr.length > 0
  const mSI    = m * MASS_UNITS[mUnit].factor
  const kSI    = k * STIFF_UNITS[kUnit].factor
  const Testim = mSI > 0 && kSI > 0 ? (2 * Math.PI * Math.sqrt(mSI / kSI)).toFixed(4) : '—'

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setResult(null)
    setErr(null)
  }

  const handleCalculate = () => {
    if (!hasRecord) { setErr('Cargue un registro sísmico primero.'); return }
    setLoading(true); setResult(null); setErr(null)
    setTimeout(() => {
      try {
        const mTon  = m * MASS_UNITS[mUnit].factor
        const kKNm  = k * STIFF_UNITS[kUnit].factor
        const xiDec = xi / 100
        const ugMs2 = accelArr.map(v => v * 0.01)   // cm/s² → m/s²

        if (mTon  <= 0) throw new Error('La masa debe ser > 0')
        if (kKNm  <= 0) throw new Error('La rigidez debe ser > 0')
        if (xiDec < 0 || xiDec > 1) throw new Error('Amortiguamiento fuera de rango [0, 100]%')

        if (mode === 'linear') {
          const res = computeLinearSDOF({
            m: mTon, k: kKNm, xi: xiDec,
            betaN, gammaN, dt, ug: ugMs2,
          })
          setResult({ ...res, mode: 'linear' })
        } else {
          const uyM  = uyVal * UY_UNITS[uyUnit].factor
          const aAlp = alpha / 100
          if (uyM <= 0) throw new Error('El desplazamiento de fluencia debe ser > 0')
          const res = computeSDOF({
            m: mTon, k: kKNm, xi: xiDec,
            betaN, gammaN, dt,
            uy: uyM, alpha: aAlp,
            ug: ugMs2,
            tol: 1e-6, maxIter: 50,
          })
          // maxA relativa calculada aquí (computeSDOF no la expone directamente)
          let maxRel = 0
          for (let i = 0; i < res.aRel.length; i++) {
            if (Math.abs(res.aRel[i]) > maxRel) maxRel = Math.abs(res.aRel[i])
          }
          setResult({ ...res, maxA: maxRel, mode: 'nonlinear' })
        }
      } catch (e) {
        setErr(e.message)
      }
      setLoading(false)
    }, 30)
  }

  // ── Datos para gráficas de tiempo ────────────────────────────────────────
  const timeChartData = useMemo(() => {
    if (!result) return null
    const n    = result.u.length
    const step = Math.max(1, Math.floor(n / 2000))
    const dF   = DISP_UNITS[dispUnitIdx].factor
    const aF   = ACCEL_UNITS[accelUnitIdx].factor
    const aArr = result.mode === 'linear' ? result.a : result.aRel
    const data = []
    for (let i = 0; i < n; i += step) {
      data.push({
        t: parseFloat((i * dt).toFixed(4)),
        u: parseFloat((result.u[i] * dF).toFixed(5)),
        v: parseFloat(result.v[i].toFixed(6)),
        a: parseFloat((aArr[i] * aF).toFixed(5)),
      })
    }
    return data
  }, [result, dt, dispUnitIdx, accelUnitIdx])

  // ── Datos para diagrama fuerza-desplazamiento ─────────────────────────────
  const forceDispData = useMemo(() => {
    if (!result) return null
    const n    = result.u.length
    const step = Math.max(1, Math.floor(n / 3000))
    const dF   = DISP_UNITS[dispUnitIdx].factor
    const fF   = FORCE_UNITS[forceUnitIdx].factor
    const data = []
    for (let i = 0; i < n; i += step) {
      data.push({
        u:  parseFloat((result.u[i]  * dF).toFixed(5)),
        fs: parseFloat((result.fs[i] * fF).toFixed(5)),
      })
    }
    return data
  }, [result, dispUnitIdx, forceUnitIdx])

  const dispU  = DISP_UNITS[dispUnitIdx]
  const accelU = ACCEL_UNITS[accelUnitIdx]
  const forceU = FORCE_UNITS[forceUnitIdx]

  const paramsSI = {
    m: mSI, k: kSI, xi: xi / 100,
    uy: uyVal * UY_UNITS[uyUnit].factor,
    alpha: alpha / 100,
  }

  const secNum = (n) => mode === 'nonlinear' ? `[${n}]` : `[${n - 1}]`

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header + toggle de modo */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', borderBottom: `1px solid ${BORDER}`, gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: ACCENT }}>Sistemas de 1 GDL</span>
        <span style={{ fontSize: 11, color: '#555', flex: 1 }}>
          Newmark-Beta
          {hasRecord && <span style={{ color: '#3FB950', marginLeft: 8 }}>· {accelArr.length.toLocaleString()} pts</span>}
        </span>
        {/* Botones de modo */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'linear',    label: 'Tiempo Historia Lineal'    },
            { id: 'nonlinear', label: 'Tiempo Historia No Lineal' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => handleModeChange(id)} style={{
              padding: '5px 14px',
              borderRadius: 5,
              border: `1px solid ${mode === id ? ACCENT : BORDER}`,
              background: mode === id ? ACCENT : 'transparent',
              color: mode === id ? '#fff' : '#8B949E',
              fontWeight: mode === id ? 700 : 400,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              {label}
            </button>
          ))}
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8B949E', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Sidebar de parámetros ── */}
        <div style={{ width: 240, minWidth: 240, borderRight: `1px solid ${BORDER}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>

          {/* [1] Sistema */}
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
            T est. = <span style={{ color: ACCENT }}>{Testim} s</span>
          </div>

          {/* [2] Modelo Bilineal — solo modo no lineal */}
          {mode === 'nonlinear' && (<>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>[2] Modelo Bilineal</div>
            <div style={row}>
              <span style={lbl}>u<sub>y</sub></span>
              <input type="number" min={0} step={0.1} value={uyVal} onChange={e => setUyVal(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <select value={uyUnit} onChange={e => setUyUnit(Number(e.target.value))} style={inp({ flex: 1 })}>
                {UY_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
              Fy = <span style={{ color: '#8B949E' }}>
                {kSI > 0 && uyVal > 0 ? (kSI * uyVal * UY_UNITS[uyUnit].factor).toFixed(3) : '—'} kN
              </span>
            </div>
            <div style={row}>
              <span style={{ ...lbl, minWidth: 18 }}>α</span>
              <input type="number" min={0} max={100} step={0.5} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value) || 0)} style={inp({ width: 70, textAlign: 'right' })} />
              <span style={{ fontSize: 11, color: '#8B949E' }}>%</span>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
              {alpha === 0 ? 'Elastoplástico perfecto' : `Post-fluencia: ${alpha}% × k`}
            </div>
          </>)}

          {/* [2/3] Newmark-Beta */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>
            {secNum(3)} Newmark-Beta
          </div>
          <select value={presetIdx} onChange={e => { setPresetIdx(Number(e.target.value)); setResult(null) }} style={inp({ width: '100%', marginBottom: 4 })}>
            {NEWMARK_PRESETS.map((pr, i) => <option key={i} value={i}>{pr.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 18, padding: '5px 8px', background: BG_DARK, border: `1px solid ${BORDER}`, borderRadius: 5 }}>
            <span style={{ fontSize: 11, color: '#8B949E' }}>β = <span style={{ color: '#E6EDF3', fontFamily: 'monospace' }}>{betaN.toFixed(6)}</span></span>
            <span style={{ fontSize: 11, color: '#8B949E' }}>γ = <span style={{ color: '#E6EDF3', fontFamily: 'monospace' }}>{gammaN.toFixed(4)}</span></span>
          </div>
          <div style={{ fontSize: 10, color: presetIdx === 0 ? '#3FB950' : BLUE, marginBottom: 2 }}>
            {presetIdx === 0 ? '→ Incondicionalmente estable' : '→ Mayor precisión numérica'}
          </div>

          {/* [3/4] Unidades de salida */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, ...sec }}>
            {secNum(4)} Unidades Salida
          </div>
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
            <span style={{ ...lbl, minWidth: 18 }}>F</span>
            <select value={forceUnitIdx} onChange={e => setForceUnitIdx(Number(e.target.value))} style={inp({ flex: 1 })}>
              {FORCE_UNITS.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
            </select>
          </div>

          {/* Calcular */}
          <button onClick={handleCalculate} disabled={loading || !hasRecord} style={{
            padding: '10px', borderRadius: 5, border: 'none',
            background: loading || !hasRecord ? '#21262D' : ACCENT,
            color: loading || !hasRecord ? '#555' : '#fff',
            fontWeight: 700, fontSize: 13,
            cursor: loading || !hasRecord ? 'not-allowed' : 'pointer',
          }}>
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
                ['max|u|',     `${(result.maxU * dispU.factor).toFixed(4)} ${dispU.label}`],
                ['max|v|',     `${result.maxV.toFixed(4)} m/s`],
                ['max|a_rel|', `${(result.maxA * accelU.factor).toFixed(4)} ${accelU.label}`],
                ...(result.mode === 'nonlinear' ? [['Ductilidad', `${result.ductility.toFixed(3)}`]] : []),
                ['T',          `${result.T.toFixed(4)} s`],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: '#8B949E' }}>{label}</span>
                  <span style={{ color: '#E6EDF3', fontFamily: 'monospace', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
              {result.mode === 'nonlinear' && !result.convergedAll && (
                <div style={{ fontSize: 10, color: YELLOW, marginTop: 4 }}>
                  ⚠ Algunos pasos no convergieron.
                </div>
              )}
            </div>

            <button onClick={() => {
              const unitsObj = { disp: dispU, accel: accelU, force: forceU }
              if (result.mode === 'linear') {
                exportLinearTxt(result, dt, paramsSI, fileName, unitsObj)
              } else {
                exportSDOFTxt(result, dt, paramsSI, fileName, unitsObj)
              }
            }} style={{ padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Descargar .txt
            </button>
          </>)}
        </div>

        {/* ── Área de gráficas ── */}
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

            {/* 1. Desplazamiento u(t) */}
            <TimeChart
              data={timeChartData} dataKey="u" color={GREEN}
              yLabel={`u (${dispU.label})`}
              title="Desplazamiento  u(t)"
              maxStr={`max = ${(result.maxU * dispU.factor).toFixed(4)} ${dispU.label}`}
            />

            {/* 2. Velocidad v(t) */}
            <TimeChart
              data={timeChartData} dataKey="v" color={CYAN}
              yLabel="v (m/s)"
              title="Velocidad  v(t)"
              maxStr={`max = ${result.maxV.toFixed(4)} m/s`}
            />

            {/* 3. Aceleración relativa a_rel(t) */}
            <TimeChart
              data={timeChartData} dataKey="a" color={BLUE}
              yLabel={`a_rel (${accelU.label})`}
              title="Aceleración relativa  a_rel(t)"
              maxStr={`max = ${(result.maxA * accelU.factor).toFixed(4)} ${accelU.label}`}
            />

            {/* 4. Fuerza vs Desplazamiento */}
            <div>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
                {result.mode === 'nonlinear'
                  ? <>Lazo Histéretico — F vs u&nbsp;&nbsp;<span style={{ color: PURPLE }}>μ = {result.ductility.toFixed(3)}</span></>
                  : 'Fuerza restitutiva vs Desplazamiento (elástico lineal)'
                }
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <ScatterChart margin={{ top: 4, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                  <XAxis dataKey="u" type="number" name="u" stroke="#21262D"
                    tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: `u (${dispU.label})`, position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                  <YAxis dataKey="fs" type="number" name="fs" stroke="#21262D"
                    tick={{ fontSize: 10, fill: '#8B949E' }}
                    label={{ value: `F (${forceU.label})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 20 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: BG_PANEL, border: `1px solid ${BORDER}`, fontSize: 11 }}
                    formatter={(v, n) => [v, n === 'u' ? `u (${dispU.label})` : `F (${forceU.label})`]} />
                  <Scatter
                    data={forceDispData}
                    line={{ stroke: result.mode === 'nonlinear' ? PURPLE : GREEN, strokeWidth: 1 }}
                    fill="transparent"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

          </>)}
        </div>
      </div>
    </div>
  )
}
