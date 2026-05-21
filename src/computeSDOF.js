// ============================================================
//  computeSDOF.js — INERTIX
//  Newmark-Beta No Lineal — SDOF Bilineal
//  Traducción directa de newmark_nonlineal.cpp
//
//  Unidades internas: ton · kN · m · s
//    m   → ton        k   → kN/m
//    ug  → m/s²       u   → m
//    fs  → kN         v   → m/s
// ============================================================

function signFn(x) { return x > 0 ? 1.0 : x < 0 ? -1.0 : 0.0 }

// Conversores de unidades para la entrada
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

export function computeSDOF({
  m, k, xi,
  betaN  = 0.25,
  gammaN = 0.5,
  dt,
  u0 = 0, v0 = 0,
  uy,           // desplazamiento de fluencia [m]
  alpha = 0.0,  // endurecimiento post-fluencia (0 = elastoplástico perfecto)
  ug,           // array de aceleración del suelo [m/s²]
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

  let convergedAll = true

  for (let i = 0; i < n - 1; i++) {
    const pEff = -m * ug[i + 1] + a1N * u[i] + a2N * v[i] + a3N * a[i]

    let des  = u[i]
    let fel  = fs[i]
    let rigT = KT[i]
    let Kp   = rigT + a1N
    let R    = pEff - fel - a1N * des
    let iter = 0

    while (Math.abs(R) > tol && iter < maxIter) {
      des += R / Kp
      const fTrial = fel + k * (des - u[i])
      const Fy     = k * uy

      if (Math.abs(fTrial) > Fy) {
        rigT = alpha * k
        fel  = (1.0 - alpha) * Fy * signFn(fTrial) + alpha * fTrial
      } else {
        rigT = k
        fel  = fTrial
      }
      Kp = rigT + a1N
      R  = pEff - fel - a1N * des
      iter++
    }

    if (iter >= maxIter) convergedAll = false

    u[i + 1]  = des
    KT[i + 1] = rigT
    fs[i + 1] = fel

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
    u:    Array.from(u),
    v:    Array.from(v),
    aRel: Array.from(a),
    aAbs: Array.from(aAbs),
    fs:   Array.from(fs),
    maxU, maxV, maxAbs,
    ductility:    uy > 0 ? maxU / uy : 0,
    convergedAll,
    T: 2 * Math.PI / wn,
  }
}

export function exportSDOFTxt(result, dt, params, fileName) {
  const { m, k, xi, uy, alpha } = params
  const W = 16
  const p = (s) => String(s).padEnd(W)
  let txt = '# ============================================================\n'
  txt += '# INERTIX - Análisis SDOF No Lineal (Newmark-Beta)\n'
  txt += `# Registro: ${fileName || 'N/A'}\n`
  txt += `# m = ${m.toFixed(6)} ton    k = ${k.toFixed(6)} kN/m    xi = ${(xi * 100).toFixed(2)}%\n`
  txt += `# T = ${(2 * Math.PI / Math.sqrt(k / m)).toFixed(4)} s    uy = ${(uy * 100).toFixed(4)} cm    alpha = ${(alpha * 100).toFixed(2)}%\n`
  txt += `# max|u| = ${(result.maxU * 100).toFixed(4)} cm    max|v| = ${result.maxV.toFixed(4)} m/s\n`
  txt += `# max|a_abs| = ${result.maxAbs.toFixed(4)} m/s²    Ductilidad = ${result.ductility.toFixed(3)}\n`
  txt += '# ============================================================\n'
  txt += `  ${p('t(s)')}${p('u(m)')}${p('v(m/s)')}${p('a_abs(m/s2)')}${p('fs(kN)')}\n`
  txt += `  ${'-'.repeat(W * 5)}\n`
  for (let i = 0; i < result.u.length; i++) {
    txt += `  ${p((i * dt).toFixed(6))}${p(result.u[i].toFixed(8))}${p(result.v[i].toFixed(8))}${p(result.aAbs[i].toFixed(8))}${p(result.fs[i].toFixed(8))}\n`
  }
  const blob = new Blob([txt], { type: 'text/plain' })
  const el = document.createElement('a')
  el.href = URL.createObjectURL(blob)
  el.download = 'sdof_nonlinear.txt'
  document.body.appendChild(el); el.click(); document.body.removeChild(el)
  URL.revokeObjectURL(el.href)
}
