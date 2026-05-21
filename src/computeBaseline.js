// ============================================================
//  computeBaseline.js — INERTIX
//  Corrección de Línea Base por mínimos cuadrados (órdenes 0–3)
//  Traducción directa de baseline_correction.cpp
// ============================================================

function solveGauss(aug, n) {
  for (let col = 0; col < n; col++) {
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let f = col + 1; f < n; f++) {
      if (Math.abs(aug[f][col]) > maxVal) { maxVal = Math.abs(aug[f][col]); maxRow = f }
    }
    if (maxVal < 1e-14) throw new Error('Sistema singular en ajuste polinomial')
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    for (let f = col + 1; f < n; f++) {
      const fac = aug[f][col] / aug[col][col]
      for (let k = col; k <= n; k++) aug[f][k] -= fac * aug[col][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j]
    x[i] /= aug[i][i]
  }
  return x
}

export function computeBaseline(accelArr, dt, order) {
  const n = accelArr.length
  const coef = [0, 0, 0, 0]

  if (order === 0) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += accelArr[i]
    const mean = sum / n
    coef[0] = mean
    const poly = new Array(n).fill(mean)
    const corrected = accelArr.map(v => v - mean)
    return _buildResult(accelArr, corrected, poly, coef, 0)
  }

  const t = new Array(n)
  for (let i = 0; i < n; i++) t[i] = i * dt
  const deg = order + 1

  const T = new Array(2 * order + 1).fill(0)
  const R = new Array(deg).fill(0)
  T[0] = n
  for (let i = 0; i < n; i++) {
    let tp = t[i]
    for (let k = 1; k <= 2 * order; k++) { T[k] += tp; tp *= t[i] }
    let tp2 = 1
    for (let k = 0; k < deg; k++) { R[k] += tp2 * accelArr[i]; tp2 *= t[i] }
  }

  const aug = Array.from({ length: deg }, (_, j) => {
    const row = new Array(deg + 1)
    for (let k = 0; k < deg; k++) row[k] = T[j + k]
    row[deg] = R[j]
    return row
  })

  const c = solveGauss(aug, deg)
  for (let k = 0; k < deg; k++) coef[k] = c[k]

  const poly = new Array(n)
  const corrected = new Array(n)
  for (let i = 0; i < n; i++) {
    let val = 0, tp = 1
    for (let k = 0; k < deg; k++) { val += coef[k] * tp; tp *= t[i] }
    poly[i] = val
    corrected[i] = accelArr[i] - val
  }

  return _buildResult(accelArr, corrected, poly, coef, order)
}

function _buildResult(orig, corrected, poly, coef, order) {
  const n = orig.length
  let sumO = 0, sumC = 0, rmsO = 0, rmsC = 0
  for (let i = 0; i < n; i++) {
    sumO += orig[i];       sumC += corrected[i]
    rmsO += orig[i] ** 2;  rmsC += corrected[i] ** 2
  }
  return {
    corrected,
    poly,
    coef,
    order,
    stats: {
      meanOrig: sumO / n,
      meanCorr: sumC / n,
      rmsOrig:  Math.sqrt(rmsO / n),
      rmsCorr:  Math.sqrt(rmsC / n),
    },
  }
}

export function exportBaselineTxt(accelOrig, corrected, poly, dt, coef, order, stats, fileName) {
  const labels = ['Constante', 'Lineal', 'Cuadrático', 'Cúbico']
  const W = 18
  const p = (s) => String(s).padEnd(W)
  let txt = '# ============================================================\n'
  txt += '# INERTIX - Corrección de Línea Base\n'
  txt += `# Polinomio: ${labels[order]} (orden ${order})\n`
  let poly_str = `# P(t) = ${coef[0].toFixed(8)}`
  if (order >= 1) poly_str += ` + (${coef[1].toFixed(8)})*t`
  if (order >= 2) poly_str += ` + (${coef[2].toFixed(8)})*t^2`
  if (order >= 3) poly_str += ` + (${coef[3].toFixed(8)})*t^3`
  txt += poly_str + '\n'
  txt += `# Registro: ${fileName || 'N/A'}\n`
  txt += `# RMS original: ${stats.rmsOrig.toFixed(6)} cm/s²  →  corregida: ${stats.rmsCorr.toFixed(6)} cm/s²\n`
  txt += `# Media original: ${stats.meanOrig.toFixed(6)} cm/s²  →  corregida: ${stats.meanCorr.toFixed(6)} cm/s²\n`
  txt += '# ============================================================\n'
  txt += `  ${p('t(s)')}${p('a_orig(cm/s2)')}${p('P(t)(cm/s2)')}${p('a_corr(cm/s2)')}\n`
  txt += `  ${'-'.repeat(W * 4)}\n`
  for (let i = 0; i < accelOrig.length; i++) {
    txt += `  ${p((i * dt).toFixed(8))}${p(accelOrig[i].toFixed(8))}${p(poly[i].toFixed(8))}${p(corrected[i].toFixed(8))}\n`
  }
  const blob = new Blob([txt], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'baseline_corrected.txt'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}
