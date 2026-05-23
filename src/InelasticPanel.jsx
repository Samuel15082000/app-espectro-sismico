// ============================================================
//  InelasticPanel.jsx — INERTIX
//  Espectro de Respuesta Inelástico (Ductilidad Constante)
// ============================================================
import { useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { computeInelasticSpectrum, exportInelasticTxt } from './computeInelasticSpectrum'

const ACCENT  = '#E97817'
const BG_DARK = '#111318'
const BG_PANEL= '#181B22'
const BORDER  = '#2A2D35'

const DUCT_COLORS = ['#F87171','#60A5FA','#34D399','#FBBF24','#A78BFA']
const DEFAULT_DUCTILITIES = [1, 1.5, 2, 3, 4]

const inp = (x) => ({ background: BG_DARK, border: `1px solid ${BORDER}`, color: '#E6EDF3', borderRadius: 5, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', ...x })
const tp  = { contentStyle: { background: BG_PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11 } }
const secS = { fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }

export default function InelasticPanel({ accelArr, dt, fileName, unitFactor, unitLabel }) {
  const [xi,         setXi]         = useState(5)
  const [alpha,      setAlpha]      = useState(0)
  const [nCurves,    setNCurves]    = useState(5)
  const [ductilities, setDuctilities] = useState([...DEFAULT_DUCTILITIES])
  const [nPeriods,   setNPeriods]   = useState(200)
  const [TMin,       setTMin]       = useState(0.01)
  const [TMax,       setTMax]       = useState(10.0)
  const [tol,        setTol]        = useState(1e-6)
  const [maxIter,    setMaxIter]    = useState(50)
  const [bisecTol,   setBisecTol]   = useState(0.001)
  const [bisecMax,   setBisecMax]   = useState(60)

  const [result,     setResult]     = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [err,        setErr]        = useState(null)
  const [progress,   setProgress]   = useState(0)

  const hasRecord = accelArr && accelArr.length > 0

  const handleNCurves = (n) => {
    n = Math.max(1, Math.min(5, n))
    setNCurves(n)
    setDuctilities(p => {
      if (n > p.length) return [...p, ...DEFAULT_DUCTILITIES.slice(p.length, n)]
      return p.slice(0, n)
    })
  }

  const setDuctility = (i, v) => {
    setDuctilities(p => { const d = [...p]; d[i] = parseFloat(v) || 0; return d })
  }

  const handleCalculate = useCallback(() => {
    if (!hasRecord) return
    setLoading(true)
    setErr(null)
    setResult(null)

    setTimeout(() => {
      try {
        const res = computeInelasticSpectrum({
          accelCmS2: accelArr,
          dt,
          xi:    xi / 100,
          ductilities: ductilities.slice(0, nCurves),
          alpha: alpha / 100,
          nPeriods,
          TMin,
          TMax,
          tol,
          maxIter,
          bisecTol,
          bisecMax,
        })
        setResult(res)
        setErr(null)
      } catch (e) {
        setErr(e.message)
        setResult(null)
      }
      setLoading(false)
    }, 50)
  }, [accelArr, dt, xi, ductilities, nCurves, alpha, nPeriods, TMin, TMax, tol, maxIter, bisecTol, bisecMax, hasRecord])

  const accelChartData = useMemo(() => {
    if (!accelArr || accelArr.length === 0) return null
    const n = accelArr.length
    const step = Math.max(1, Math.floor(n / 2000))
    const data = []
    for (let i = 0; i < n; i += step) {
      data.push({
        t: parseFloat((i * dt).toFixed(4)),
        a: parseFloat((accelArr[i] / unitFactor).toFixed(5)),
      })
    }
    return data
  }, [accelArr, dt, unitFactor])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>

      {/* ── Sidebar de parámetros ── */}
      <aside style={{
        width: 260, minWidth: 260, background: BG_PANEL,
        borderRight: `1px solid ${BORDER}`, padding: 12,
        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
      }}>

        {/* [1] Amortiguamiento */}
        <section>
          <div style={secS}>[1] Amortiguamiento</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#8B949E', minWidth: 30 }}>ξ</span>
            <input type="number" min={0} max={100} step={0.5} value={xi}
              onChange={e => setXi(parseFloat(e.target.value) || 0)}
              style={inp({ width: 70, textAlign: 'right' })} />
            <span style={{ fontSize: 11, color: '#555' }}>%</span>
          </div>
        </section>

        {/* [2] Ductilidades */}
        <section>
          <div style={secS}>[2] Ductilidades</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#8B949E', flex: 1 }}>N. curvas</span>
            <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves - 1)}>−</button>
            <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center', color: '#E6EDF3' }}>{nCurves}</span>
            <button style={{ width: 26, height: 26, background: '#21262D', border: `1px solid ${BORDER}`, color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 16 }} onClick={() => handleNCurves(nCurves + 1)}>+</button>
          </div>
          <button onClick={() => setDuctilities([...DEFAULT_DUCTILITIES])} style={{ width: '100%', padding: '5px', borderRadius: 4, border: `1px solid ${BORDER}`, background: '#21262D', color: '#ccc', fontSize: 11, cursor: 'pointer', marginBottom: 5 }}>
            Defecto 1 / 1.5 / 2 / 3 / 4
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
            {ductilities.slice(0, nCurves).map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: DUCT_COLORS[i] }}></div>
                <span style={{ fontSize: 11, color: '#8B949E' }}>μ{i + 1}</span>
                <input type="number" min={1} max={20} step={0.5} value={d}
                  onChange={e => setDuctility(i, e.target.value)}
                  style={inp({ width: 52, textAlign: 'right', padding: '3px 5px' })} />
              </div>
            ))}
          </div>
        </section>

        {/* [3] Modelo */}
        <section>
          <div style={secS}>[3] Modelo No Lineal</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#8B949E', minWidth: 65 }}>α (endur.)</span>
            <input type="number" min={0} max={100} step={1} value={alpha}
              onChange={e => setAlpha(parseFloat(e.target.value) || 0)}
              style={inp({ width: 60, textAlign: 'right' })} />
            <span style={{ fontSize: 11, color: '#555' }}>%</span>
          </div>
          <div style={{ fontSize: 10, color: alpha === 0 ? '#3FB950' : '#60A5FA', marginTop: 2 }}>
            {alpha === 0 ? '→ Elastoplástico perfecto' : `→ Bilineal (α = ${alpha}%)`}
          </div>
        </section>

        {/* [4] Newmark-Beta */}
        <section>
          <div style={secS}>[4] Newmark-Beta</div>
          <div style={{ fontSize: 11, color: '#8B949E', padding: '4px 8px', background: BG_DARK, borderRadius: 4, border: `1px solid ${BORDER}` }}>
            Accel. Constante (β = 1/4, γ = 1/2)
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Tol. NR</div>
              <input type="number" min={1e-12} step={1e-7} value={tol}
                onChange={e => setTol(parseFloat(e.target.value) || 1e-6)}
                style={inp({ width: '100%', textAlign: 'right', fontSize: 11 })} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Iter. NR</div>
              <input type="number" min={1} max={500} step={1} value={maxIter}
                onChange={e => setMaxIter(parseInt(e.target.value) || 50)}
                style={inp({ width: '100%', textAlign: 'right', fontSize: 11 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Tol. Bisección</div>
              <input type="number" min={1e-6} step={0.0001} value={bisecTol}
                onChange={e => setBisecTol(parseFloat(e.target.value) || 0.001)}
                style={inp({ width: '100%', textAlign: 'right', fontSize: 11 })} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 2 }}>Iter. Bisección</div>
              <input type="number" min={1} max={200} step={1} value={bisecMax}
                onChange={e => setBisecMax(parseInt(e.target.value) || 60)}
                style={inp({ width: '100%', textAlign: 'right', fontSize: 11 })} />
            </div>
          </div>
        </section>

        {/* [5] Rango */}
        <section>
          <div style={secS}>[5] Rango del Espectro</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'T mín (s)',   val: TMin,     set: setTMin,     step: 0.01 },
              { label: 'T máx (s)',   val: TMax,     set: setTMax,     step: 0.5  },
              { label: 'N. periodos', val: nPeriods,  set: setNPeriods,  step: 50   },
            ].map(({ label, val, set, step }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#8B949E', minWidth: 80 }}>{label}</span>
                <input type="number" value={val} step={step}
                  onChange={e => set(parseFloat(e.target.value) || val)}
                  style={inp({ width: 80, textAlign: 'right', padding: '3px 5px' })} />
              </div>
            ))}
          </div>
        </section>

        <button onClick={handleCalculate} disabled={!hasRecord || loading} style={{
          width: '100%', padding: '10px', borderRadius: 6, border: 'none',
          background: hasRecord && !loading ? ACCENT : '#21262D',
          color: hasRecord && !loading ? '#fff' : '#555',
          fontWeight: 700, fontSize: 13,
          cursor: hasRecord && !loading ? 'pointer' : 'not-allowed',
          letterSpacing: 0.6,
        }}>
          {loading ? 'CALCULANDO...' : 'CALCULAR ESPECTRO'}
        </button>

        {!hasRecord && (
          <div style={{ fontSize: 11, color: ACCENT, padding: '6px 8px', background: '#21262D', borderRadius: 4 }}>
            Cargue un registro sísmico primero.
          </div>
        )}

        {err && (
          <div style={{ fontSize: 11, color: '#F85149', padding: '6px 8px', background: '#2D1515', borderRadius: 4 }}>{err}</div>
        )}

        {result && (
          <button onClick={() => exportInelasticTxt(result, fileName, xi / 100, alpha / 100, 'cm/s²')} style={{
            width: '100%', padding: '8px', borderRadius: 5, border: `1px solid ${BORDER}`,
            background: '#21262D', color: '#ccc', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}>
            Descargar espectro_inelastico.txt
          </button>
        )}
      </aside>

      {/* ── Área de gráficas ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Acelerograma */}
        <div style={{ flex: 1, minHeight: 0, padding: '8px 12px', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
            Acelerograma {hasRecord ? `— ${accelArr.length.toLocaleString()} pts · dt=${dt}s` : ''}
          </div>
          {accelChartData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accelChartData} margin={{ top: 2, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                <XAxis dataKey="t" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                  label={{ value: 'Tiempo (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                  label={{ value: `a (${unitLabel})`, angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 40 }} />
                <Tooltip {...tp} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v} ${unitLabel}`, 'a']} />
                <Line type="monotone" dataKey="a" stroke={ACCENT} dot={false} strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ flex: 1, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
              Cargue un registro sísmico para visualizar el acelerograma.
            </div>
          )}
        </div>

        {/* Espectro inelástico */}
        <div style={{ flex: 1, minHeight: 0, padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>
            Espectro Inelástico — Aceleración Sa vs Período T
            {result && <span style={{ color: '#3FB950' }}> · ξ = {xi}% · α = {alpha}%</span>}
          </div>
          {result ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.chartData} margin={{ top: 2, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2333" />
                <XAxis dataKey="T" stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                  label={{ value: 'Período T (s)', position: 'insideBottom', offset: -8, fill: '#8B949E', fontSize: 10 }} />
                <YAxis stroke="#21262D" tick={{ fontSize: 10, fill: '#8B949E' }}
                  label={{ value: 'Sa (cm/s²)', angle: -90, position: 'insideLeft', fill: '#8B949E', fontSize: 10, dy: 30 }} />
                <Tooltip {...tp} labelFormatter={v => `T = ${v} s`} formatter={(v, n) => [`${v} cm/s²`, n]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8B949E', paddingTop: 2 }} />
                {result.ductilities.map((mu, i) => (
                  <Line key={i} type="monotone" dataKey={`sa${i}`} name={`μ = ${mu}`}
                    stroke={DUCT_COLORS[i]} dot={false} strokeWidth={1.5} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ flex: 1, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A2D35', fontSize: 12 }}>
              {hasRecord ? 'Configure los parámetros y presione CALCULAR ESPECTRO.' : 'Cargue un registro sísmico y calcule el espectro.'}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
