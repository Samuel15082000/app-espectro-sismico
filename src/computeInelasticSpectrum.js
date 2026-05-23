// ============================================================
//  computeInelasticSpectrum.js — INERTIX
//  Espectro de Respuesta Inelástico (Ductilidad Constante)
//
//  COPIA LITERAL del algoritmo no lineal de computeSDOF.js
//  encapsulada en runNonlinearSDOF() para uso exclusivo del
//  barrido de periodos del espectro inelástico.
//
//  NO SE MODIFICA EL ARCHIVO computeSDOF.js ORIGINAL.
//
//  Unidades internas: ton · kN · m · s
// ============================================================

// ── COPIA LITERAL de computeSDOF (mismo algoritmo, sin cambios) ──
function runNonlinearSDOF({
  m, k, xi,
  betaN  = 0.25,
  gammaN = 0.5,
  dt,
  u0 = 0, v0 = 0,
  uy,
  alpha = 0.0,
  ug,
  tol     = 1e-6,
  maxIter = 50,
}) {
  const n  = ug.length
  const wn = Math.sqrt(k / m)
  const c  = 2.0 * xi * m * wn

  const a1N = m / (betaN * dt * dt) + gammaN * c / (betaN * dt)
  const a2N = m / (betaN * dt)       + c * (gammaN / betaN - 1.0)
  const a3N = m * (0.5 / betaN - 1.0) + dt * c * (0.5 * gammaN / betaN - 1.0)

  const u  = new Float64Array(n)
  const v  = new Float64Array(n)
  const a  = new Float64Array(n)
  const fs = new Float64Array(n)
  const KT = new Float64Array(n).fill(k)

  u[0] = u0;  v[0] = v0;  fs[0] = 0.0;  KT[0] = k
  a[0] = (-m * ug[0] - c * v[0] - k * u[0]) / m

  const Fy    = k * uy
  const k2    = alpha * k
  const A_off = Fy * (1.0 - alpha)
  const B_off = -A_off

  let bSign = 0
  let bK    = k
  let bOff  = 0.0

  let convergedAll = true

  for (let i = 0; i < n - 1; i++) {
    const pEff = -m * ug[i + 1] + a1N * u[i] + a2N * v[i] + a3N * a[i]

    if (uy > 0 && bSign !== 0) {
      if ((bSign > 0 && v[i] < 0) || (bSign < 0 && v[i] > 0)) {
        bK    = k
        bOff  = fs[i] - k * u[i]
        bSign = 0
      }
    }

    let locK    = bK
    let locOff  = bOff
    let locSign = bSign
    let des     = u[i]
    let fel     = fs[i]
    let Kp      = locK + a1N
    let R       = pEff - fel - a1N * des
    let iter    = 0

    while (Math.abs(R) > tol && iter < maxIter) {
      des += R / Kp

      let fTrial = locK * des + locOff

      if (uy > 0 && locSign === 0) {
        if (fTrial > +Fy) {
          locK = k2;  locOff = A_off;  locSign = 1
          fTrial = k2 * des + A_off
        } else if (fTrial < -Fy) {
          locK = k2;  locOff = B_off;  locSign = -1
          fTrial = k2 * des + B_off
        }
      }

      fel = fTrial
      Kp  = locK + a1N
      R   = pEff - fel - a1N * des
      iter++
    }

    if (iter >= maxIter) convergedAll = false

    u[i + 1]  = des
    KT[i + 1] = locK
    fs[i + 1] = fel

    bK    = locK
    bOff  = locOff
    bSign = locSign

    v[i + 1] = gammaN / (betaN * dt) * (u[i + 1] - u[i])
             + (1.0 - gammaN / betaN) * v[i]
             + dt * (1.0 - 0.5 * gammaN / betaN) * a[i]

    a[i + 1] = (u[i + 1] - u[i]) / (betaN * dt * dt)
             - v[i] / (betaN * dt)
             - (0.5 / betaN - 1.0) * a[i]
  }

  let maxU = 0, maxV = 0, maxAbs = 0
  const aAbs = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    aAbs[i] = a[i] + ug[i]
    if (Math.abs(u[i])    > maxU)   maxU   = Math.abs(u[i])
    if (Math.abs(v[i])    > maxV)   maxV   = Math.abs(v[i])
    if (Math.abs(aAbs[i]) > maxAbs) maxAbs = Math.abs(aAbs[i])
  }

  return {
    maxU, maxV, maxAbs,
    ductility: uy > 0 ? maxU / uy : 0,
    convergedAll,
  }
}

// ── Análisis lineal simplificado (solo maxU) para referencia elástica ──
function runLinearSDOF({ m, k, xi, betaN, gammaN, dt, ug }) {
  const n  = ug.length
  const wn = Math.sqrt(k / m)
  const c  = 2.0 * xi * m * wn

  const a1   = m / (betaN * dt * dt) + gammaN * c / (betaN * dt)
  const a2   = m / (betaN * dt)      + (gammaN / betaN - 1.0) * c
  const a3   = (0.5 / betaN - 1.0) * m + dt * (0.5 * gammaN / betaN - 1.0) * c
  const kEff = k + a1

  const u = new Float64Array(n)
  const v = new Float64Array(n)
  const a = new Float64Array(n)

  u[0] = 0;  v[0] = 0
  a[0] = -ug[0]

  const bDt  = betaN * dt
  const bDt2 = betaN * dt * dt

  for (let i = 0; i < n - 1; i++) {
    const pEff = -m * ug[i + 1] + a1 * u[i] + a2 * v[i] + a3 * a[i]
    u[i + 1] = pEff / kEff
    const du = u[i + 1] - u[i]
    v[i + 1] = gammaN / bDt * du + (1.0 - gammaN / betaN) * v[i] + dt * (1.0 - 0.5 * gammaN / betaN) * a[i]
    a[i + 1] = du / bDt2 - v[i] / bDt - (0.5 / betaN - 1.0) * a[i]
  }

  let maxU = 0
  for (let i = 0; i < n; i++) {
    if (Math.abs(u[i]) > maxU) maxU = Math.abs(u[i])
  }
  return { maxU }
}

// ── Bisección: encontrar uy para ductilidad objetivo ──
function findUyForDuctility({ m, k, xi, betaN, gammaN, dt, ug, alpha, muTarget, tol, maxIter, maxU_elastic }) {
  if (muTarget <= 1.0) {
    const wn2 = k / m
    return {
      uy:    maxU_elastic,
      Ay:    wn2 * maxU_elastic,
      maxU:  maxU_elastic,
      muActual: 1.0,
      converged: true,
    }
  }

  let uyLow  = maxU_elastic / (50.0 * muTarget)
  let uyHigh = maxU_elastic
  let uy     = maxU_elastic / muTarget
  let muActual = 0
  let lastMaxU = 0
  const bisecTol = 0.02
  const bisecMax = 40

  for (let it = 0; it < bisecMax; it++) {
    const res = runNonlinearSDOF({ m, k, xi, betaN, gammaN, dt, uy, alpha, ug, tol, maxIter })
    muActual = res.maxU / uy
    lastMaxU = res.maxU

    if (Math.abs(muActual - muTarget) / muTarget < bisecTol) break

    if (muActual > muTarget) {
      uyLow = uy
    } else {
      uyHigh = uy
    }
    uy = 0.5 * (uyLow + uyHigh)
  }

  const wn2 = k / m
  return {
    uy,
    Ay: wn2 * uy,
    maxU: lastMaxU,
    muActual,
    converged: Math.abs(muActual - muTarget) / muTarget < bisecTol,
  }
}

// ============================================================
//  computeInelasticSpectrum
//  Barrido de periodos para espectro de ductilidad constante
//
//  Entrada:
//    accelCmS2 — acelerograma en cm/s²
//    dt        — paso de tiempo [s]
//    xi        — fracción de amortiguamiento (ej. 0.05)
//    ductilities — array de ductilidades objetivo [1, 2, 3, ...]
//    alpha     — endurecimiento post-fluencia (0 = elastoplástico)
//    nPeriods  — número de periodos a calcular
//    TMin, TMax — rango de periodos [s]
//    tol, maxIter — parámetros del NR
//    onProgress — callback(fraction) para barra de progreso
//
//  Salida:
//    { periods, Ay, Sd, chartData }
//    Ay[j][i] — pseudo-aceleración de fluencia para ductilidad j, periodo i [cm/s²]
//    Sd[j][i] — desplazamiento máximo para ductilidad j, periodo i [cm]
// ============================================================
export function computeInelasticSpectrum({
  accelCmS2,
  dt,
  xi,
  ductilities,
  alpha     = 0.0,
  nPeriods  = 200,
  TMin      = 0.01,
  TMax      = 5.0,
  tol       = 1e-6,
  maxIter   = 50,
  betaN     = 0.25,
  gammaN    = 0.5,
}) {
  const ug = new Float64Array(accelCmS2.length)
  for (let i = 0; i < accelCmS2.length; i++) ug[i] = accelCmS2[i] * 0.01

  const nMu     = ductilities.length
  const periods  = new Float64Array(nPeriods)
  const Ay       = Array.from({ length: nMu }, () => new Float64Array(nPeriods))
  const Sd       = Array.from({ length: nMu }, () => new Float64Array(nPeriods))

  const logTMin = Math.log10(TMin)
  const logTMax = Math.log10(TMax)
  for (let i = 0; i < nPeriods; i++) {
    periods[i] = Math.pow(10, logTMin + (logTMax - logTMin) * i / (nPeriods - 1))
  }

  const m = 1.0

  for (let i = 0; i < nPeriods; i++) {
    const T  = periods[i]
    const wn = 2.0 * Math.PI / T
    const k  = wn * wn * m

    const elastic = runLinearSDOF({ m, k, xi, betaN, gammaN, dt, ug })
    const maxU_el = elastic.maxU

    for (let j = 0; j < nMu; j++) {
      const mu = ductilities[j]

      if (mu <= 1.0) {
        Ay[j][i] = wn * wn * maxU_el * 100.0
        Sd[j][i] = maxU_el * 100.0
      } else {
        const found = findUyForDuctility({
          m, k, xi, betaN, gammaN, dt, ug, alpha,
          muTarget: mu, tol, maxIter, maxU_elastic: maxU_el,
        })
        Ay[j][i] = found.Ay * 100.0
        Sd[j][i] = found.maxU * 100.0
      }
    }
  }

  const chartData = Array.from(periods, (T, i) => {
    const pt = { T: parseFloat(T.toFixed(4)) }
    for (let j = 0; j < nMu; j++) {
      pt[`mu${j}`] = parseFloat(Ay[j][i].toFixed(3))
    }
    return pt
  })

  return {
    periods: Array.from(periods),
    Ay:      Ay.map(a => Array.from(a)),
    Sd:      Sd.map(a => Array.from(a)),
    ductilities: [...ductilities],
    chartData,
  }
}

// ── Exportar TXT ──
export function exportInelasticTxt(result, fileName, xi, alpha, unitLabel) {
  const W = 16
  const p = (s) => String(s).padEnd(W)
  let txt = '# ============================================================\n'
  txt += '# INERTIX - Espectro Inelástico (Ductilidad Constante)\n'
  txt += `# Registro: ${fileName || 'N/A'}\n`
  txt += `# xi = ${(xi * 100).toFixed(2)}%    alpha = ${(alpha * 100).toFixed(2)}%\n`
  txt += `# Ductilidades: ${result.ductilities.join(', ')}\n`
  txt += '# ============================================================\n'

  txt += `  ${p('T(s)')}`
  for (let j = 0; j < result.ductilities.length; j++) {
    txt += p(`Ay_mu${result.ductilities[j]}(${unitLabel})`)
  }
  for (let j = 0; j < result.ductilities.length; j++) {
    txt += p(`Sd_mu${result.ductilities[j]}(cm)`)
  }
  txt += '\n'
  txt += `  ${'-'.repeat(W * (1 + 2 * result.ductilities.length))}\n`

  for (let i = 0; i < result.periods.length; i++) {
    txt += `  ${p(result.periods[i].toFixed(4))}`
    for (let j = 0; j < result.ductilities.length; j++) {
      txt += p(result.Ay[j][i].toFixed(4))
    }
    for (let j = 0; j < result.ductilities.length; j++) {
      txt += p(result.Sd[j][i].toFixed(4))
    }
    txt += '\n'
  }

  const blob = new Blob([txt], { type: 'text/plain' })
  const el = document.createElement('a')
  el.href = URL.createObjectURL(blob)
  el.download = 'espectro_inelastico.txt'
  document.body.appendChild(el); el.click(); document.body.removeChild(el)
  URL.revokeObjectURL(el.href)
}
