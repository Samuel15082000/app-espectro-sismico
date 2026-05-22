// ============================================================
//  computeSDOF.js — INERTIX
//  Newmark-Beta No Lineal — SDOF Bilineal (modelo bilineal no degradante)
//
//  Algoritmo: Newmark-Beta + conmutación de ramas post-paso (Gavin, pasos 5-7)
//  Ref: Gavin, CEE 541 Duke (NumericalIntegration 2020, BilinearHysteresis 2014)
//
//  Correcciones respecto a versión anterior:
//  - Detección de inversión con v[i+1]·v[i] < 0 (ambas velocidades calculadas)
//  - Detección de fluencia con f_yield = k2·u + (k−k2)·uy·sgn(v) (Gavin ec. 44)
//  - Corrección de v y a con paso pequeño dt/1e4 tras conmutación (Gavin paso 7)
//
//  Línea A (plástica positiva): fs = k2·u + Fy·(1−α)
//  Línea B (plástica negativa): fs = k2·u − Fy·(1−α)
//  Línea C (descarga elástica): fs = k·u + (Rt − k·xt)  ← varía por punto de giro
//
//  Unidades internas: ton · kN · m · s
//    m   → ton        k   → kN/m
//    ug  → m/s²       u   → m
//    fs  → kN         v   → m/s
// ============================================================

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

  const Fy    = k * uy
  const k2    = alpha * k
  const A_off = Fy * (1.0 - alpha)   // fs = k2·u + A_off  (línea A, rama plástica +)
  const B_off = -A_off               // fs = k2·u + B_off  (línea B, rama plástica −)

  // Estado de rama persistente entre pasos:
  //   bSign = 0  → elástica (línea C)
  //   bSign = 1  → plástica positiva (línea A)
  //   bSign = -1 → plástica negativa (línea B)
  //   bK, bOff  → fs = bK·u + bOff para la rama actual
  let bSign = 0
  let bK    = k
  let bOff  = 0.0   // línea C desde el origen: fs = k·u + 0

  let convergedAll = true

  for (let i = 0; i < n - 1; i++) {
    const pEff = -m * ug[i + 1] + a1N * u[i] + a2N * v[i] + a3N * a[i]

    // ── NR con rigidez tangente local (copia mutable del estado) ──
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

      // Elástica → plástica: se verifica solo cuando estamos en línea C
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

    // Actualizar estado de rama para el próximo paso
    bK    = locK
    bOff  = locOff
    bSign = locSign

    v[i + 1] = gammaN / (betaN * dt) * (u[i + 1] - u[i])
             + (1.0 - gammaN / betaN) * v[i]
             + dt * (1.0 - 0.5 * gammaN / betaN) * a[i]

    a[i + 1] = (u[i + 1] - u[i]) / (betaN * dt * dt)
             - v[i] / (betaN * dt)
             - (0.5 / betaN - 1.0) * a[i]

    // ── Post-paso: detección de inversión y fluencia (Gavin, pasos 5 y 6) ──
    if (uy > 0) {
      let switched = false

      // Paso 6 Gavin: inversión (plástica → elástica)
      // Usa v[i+1]·v[i] < 0, ambas velocidades ya calculadas
      if (bSign !== 0 && v[i + 1] * v[i] < 0) {
        // Nuevo origen de línea C desde el punto de giro (u[i+1], fs[i+1])
        bK    = k
        bOff  = fs[i + 1] - k * u[i + 1]
        bSign = 0
        switched = true
      }

      // Paso 5 Gavin: fluencia (elástica → plástica)
      // f_yield = k2·u[i+1] + (k − k2)·uy·sgn(v[i+1])
      if (!switched && bSign === 0) {
        const fYield = k2 * u[i + 1] + (k - k2) * uy * Math.sign(v[i + 1])
        const fCurr  = k * u[i + 1] + bOff
        if (v[i + 1] > 0 && fCurr > fYield) {
          bK    = k2;  bOff = A_off;  bSign = 1
          switched = true
        } else if (v[i + 1] < 0 && fCurr < fYield) {
          bK    = k2;  bOff = B_off;  bSign = -1
          switched = true
        }
      }

      // Paso 7 Gavin: si hubo conmutación, corregir v y a con paso pequeño
      if (switched) {
        const dtSmall = dt / 1e4
        const a1S = m / (betaN * dtSmall * dtSmall) + gammaN * c / (betaN * dtSmall)
        const pS  = a1S * u[i + 1] + (m / (betaN * dtSmall) + c * (gammaN / betaN - 1.0)) * v[i + 1]
                  + (m * (0.5 / betaN - 1.0) + dtSmall * c * (0.5 * gammaN / betaN - 1.0)) * a[i + 1]
        const fsS = bK * u[i + 1] + bOff
        const uS  = (pS - fsS) / (bK + a1S)   // ≈ u[i+1] (paso ínfimo, δu ≈ 0)
        v[i + 1]  = gammaN / (betaN * dtSmall) * (uS - u[i + 1])
                  + (1.0 - gammaN / betaN) * v[i + 1]
                  + dtSmall * (1.0 - 0.5 * gammaN / betaN) * a[i + 1]
        a[i + 1]  = (-m * ug[i + 1] - c * v[i + 1] - fsS) / m
      }
    }
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

export function exportSDOFTxt(result, dt, params, fileName, units) {
  const { m, k, xi, uy, alpha } = params
  const dispU  = units?.disp  || { label: 'cm',    factor: 100      }
  const accelU = units?.accel || { label: 'cm/s²', factor: 100      }
  const forceU = units?.force || { label: 'kN',    factor: 1        }
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