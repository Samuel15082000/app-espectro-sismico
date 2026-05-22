// ============================================================
//  computeSDOF.js — INERTIX
//  Newmark-Beta No Lineal — SDOF
//
//  Wrapper:
//    alpha === 0  → computeSDOF_EP  (código original, probado y funcionando)
//    alpha  > 0  → computeSDOF_BL  (Haukaas UBC, bilineal con endurecimiento)
//
//  Unidades internas: ton · kN · m · s
// ============================================================
 
export const MASS_UNITS = [
  { label: 'ton',       factor: 1.0     },
  { label: 'kg',        factor: 0.001   },
  { label: 'kN·s²/m',  factor: 1.0     },
]
export const STIFF_UNITS = [
  { label: 'kN/m',   factor: 1.0     },
  { label: 'kN/cm',  factor: 100.0   },
  { label: 'tonf/m', factor: 9.80665 },
  { label: 'N/m',    factor: 0.001   },
]
export const UY_UNITS = [
  { label: 'cm', factor: 0.01 },
  { label: 'm',  factor: 1.0  },
]
 
// ============================================================
//  SOLVER 1 — Elastoplástico perfecto (alpha = 0)
//  Código original — probado y funcionando
// ============================================================
function computeSDOF_EP({
  m, k, xi, betaN, gammaN, dt, u0, v0, uy, ug, tol, maxIter,
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
  const k2    = 0.0
  const A_off = Fy
  const B_off = -Fy
 
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
    u: Array.from(u), v: Array.from(v),
    aRel: Array.from(a), aAbs: Array.from(aAbs), fs: Array.from(fs),
    maxU, maxV, maxAbs,
    ductility: uy > 0 ? maxU / uy : 0,
    convergedAll, T: 2 * Math.PI / wn,
  }
}
 
// ============================================================
//  SOLVER 2 — Bilineal con endurecimiento (alpha > 0)
//  Haukaas UBC — variable d (desplazamiento de equilibrio)
//  fs = matK · (u − d)
// ============================================================
function computeSDOF_BL({
  m, k, xi, betaN, gammaN, dt, u0, v0, uy, alpha, ug, tol, maxIter,
}) {
  const n  = ug.length
  const wn = Math.sqrt(k / m)
  const c  = 2.0 * xi * m * wn
 
  const a1N = m / (betaN * dt * dt) + gammaN * c / (betaN * dt)
  const a2N = m / (betaN * dt)      + c * (gammaN / betaN - 1.0)
  const a3N = m * (0.5 / betaN - 1.0) + dt * c * (0.5 * gammaN / betaN - 1.0)
 
  const u  = new Float64Array(n)
  const v  = new Float64Array(n)
  const a  = new Float64Array(n)
  const fs = new Float64Array(n)
  const KT = new Float64Array(n).fill(k)
 
  u[0] = u0;  v[0] = v0;  fs[0] = 0.0;  KT[0] = k
  a[0] = (-m * ug[0] - c * v[0] - k * u[0]) / m
 
  const Khi = k
  const Klo = alpha * k
  const xy  = uy
 
  let matK = Khi
  let d    = 0.0
 
  let convergedAll = true
 
  for (let i = 0; i < n - 1; i++) {
    const pEff = -m * ug[i + 1] + a1N * u[i] + a2N * v[i] + a3N * a[i]
 
    let locK = matK
    let locD = d
    let des  = u[i]
    let converged = false
 
    for (let iter = 0; iter < maxIter; iter++) {
      const Fmat     = locK * (des - locD)
      const Residual = Fmat + a1N * des - pEff
      if (Math.abs(Residual) < tol) { converged = true; break }
      des -= Residual / (locK + a1N)
    }
 
    if (!converged) convergedAll = false
 
    u[i + 1]  = des
    fs[i + 1] = locK * (des - locD)
    KT[i + 1] = locK
 
    v[i + 1] = gammaN / (betaN * dt) * (u[i + 1] - u[i])
             + (1.0 - gammaN / betaN) * v[i]
             + dt  * (1.0 - 0.5 * gammaN / betaN) * a[i]
 
    a[i + 1] = (u[i + 1] - u[i]) / (betaN * dt * dt)
             - v[i] / (betaN * dt)
             - (0.5 / betaN - 1.0) * a[i]
 
    let switched = false
 
    // Paso 5 Haukaas: fluencia (Khi → Klo)
    if (locK === Khi) {
      const fYield = Klo * u[i + 1] + (Khi - Klo) * xy * Math.sign(v[i + 1])
      const fCurr  = locK * (u[i + 1] - locD)
      if (v[i + 1] > 0 && fCurr > fYield) {
        locK = Klo;  locD = (1.0 - Khi / Klo) * xy;  switched = true
      } else if (v[i + 1] < 0 && fCurr < fYield) {
        locK = Klo;  locD = (Khi / Klo - 1.0) * xy;  switched = true
      }
    }
 
    // Paso 6 Haukaas: inversión (Klo → Khi)
    if (!switched && locK === Klo && v[i + 1] * v[i] < 0) {
      locD = u[i + 1] - (Klo / Khi) * (u[i + 1] - locD)
      locK = Khi;  switched = true
    }
 
    // Paso 7 Haukaas: actualizar fs y a si hubo conmutación
    if (switched) {
      fs[i + 1] = locK * (u[i + 1] - locD)
      KT[i + 1] = locK
      a[i + 1]  = (-m * ug[i + 1] - c * v[i + 1] - fs[i + 1]) / m
    }
 
    matK = locK
    d    = locD
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
    u: Array.from(u), v: Array.from(v),
    aRel: Array.from(a), aAbs: Array.from(aAbs), fs: Array.from(fs),
    maxU, maxV, maxAbs,
    ductility: uy > 0 ? maxU / uy : 0,
    convergedAll, T: 2 * Math.PI / wn,
  }
}
 
// ============================================================
//  WRAPPER
// ============================================================
export function computeSDOF({
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
  const args = { m, k, xi, betaN, gammaN, dt, u0, v0, uy, alpha, ug, tol, maxIter }
  return (alpha === 0.0)
    ? computeSDOF_EP(args)
    : computeSDOF_BL(args)
}
 
// ============================================================
//  EXPORTAR TXT
// ============================================================
export function exportSDOFTxt(result, dt, params, fileName, units) {
  const { m, k, xi, uy, alpha } = params
  const dispU  = units?.disp  || { label: 'cm',    factor: 100 }
  const accelU = units?.accel || { label: 'cm/s²', factor: 100 }
  const forceU = units?.force || { label: 'kN',    factor: 1   }
  const W = 18
  const p = (s) => String(s).padEnd(W)
  let txt = '# ============================================================\n'
  txt += '# INERTIX - Análisis SDOF No Lineal (Newmark-Beta)\n'
  txt += `# Registro: ${fileName || 'N/A'}\n`
  txt += `# m = ${m.toFixed(6)} ton    k = ${k.toFixed(6)} kN/m    xi = ${(xi * 100).toFixed(2)}%\n`
  txt += `# T = ${(2 * Math.PI / Math.sqrt(k / m)).toFixed(4)} s    uy = ${(uy * 100).toFixed(4)} cm    alpha = ${(alpha * 100).toFixed(2)}%\n`
  txt += `# max|u| = ${(result.maxU * dispU.factor).toFixed(4)} ${dispU.label}    max|v| = ${result.maxV.toFixed(4)} m/s\n`
  txt += `# max|a_abs| = ${(result.maxAbs * accelU.factor).toFixed(4)} ${accelU.label}    Ductilidad = ${result.ductility.toFixed(3)}\n`
  txt += '# ============================================================\n'
  txt += `  ${p('t(s)')}${p(`u(${dispU.label})`)}${p('v(m/s)')}${p(`a_abs(${accelU.label})`)}${p(`fs(${forceU.label})`)}\n`
  txt += `  ${'-'.repeat(W * 5)}\n`
  for (let i = 0; i < result.u.length; i++) {
    txt += `  ${p((i * dt).toFixed(6))}${p((result.u[i] * dispU.factor).toFixed(8))}${p(result.v[i].toFixed(8))}${p((result.aAbs[i] * accelU.factor).toFixed(8))}${p((result.fs[i] * forceU.factor).toFixed(8))}\n`
  }
  const blob = new Blob([txt], { type: 'text/plain' })
  const el = document.createElement('a')
  el.href = URL.createObjectURL(blob)
  el.download = 'sdof_nonlinear.txt'
  document.body.appendChild(el); el.click(); document.body.removeChild(el)
  URL.revokeObjectURL(el.href)
}
