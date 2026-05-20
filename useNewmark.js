// =============================================================================
//  useNewmark.js  —  Hook React para el nucleo Newmark-Beta (WASM)
//
//  SETUP:
//    1. Compilar newmark.cpp con Emscripten (ver comando al inicio de newmark.cpp)
//    2. Copiar newmark.js y newmark.wasm a /public/wasm/ en tu proyecto Vite/CRA
//    3. Importar este hook donde lo necesites:
//         import { useNewmark } from './useNewmark'
//
//  USO:
//    const { ready, computeSpectrum } = useNewmark()
//
//    const result = await computeSpectrum({
//      accel      : Float64Array,   // aceleraciones en cm/s²
//      dt         : number,         // paso de tiempo en segundos
//      dampings   : number[],       // fracciones: [0, 0.02, 0.05]
//      newmarkType: 0 | 1,          // 0 = cte, 1 = lineal
//      nPeriods   : number,         // puntos del espectro (defecto 1000)
//      TMin       : number,         // periodo minimo (defecto 0.01 s)
//      TMax       : number,         // periodo maximo (defecto 10.0 s)
//    })
//
//    result => {
//      periods : Float64Array,      // longitud nPeriods
//      Sa      : Float64Array[],    // Sa[i] = curva para dampings[i]
//      error   : string | null
//    }
// =============================================================================

import { useEffect, useRef, useState } from 'react'

// Ruta del modulo WASM generado por Emscripten (relativa a /public)
const WASM_JS_URL = '/wasm/newmark.js'

// --------------------------------------------------------------------------
//  Carga el modulo Emscripten una sola vez (singleton por pagina)
// --------------------------------------------------------------------------
let _modulePromise = null

function loadNewmarkModule() {
  if (_modulePromise) return _modulePromise

  _modulePromise = new Promise((resolve, reject) => {
    // Emscripten genera un script que expone window.NewmarkModule()
    const script = document.createElement('script')
    script.src = WASM_JS_URL
    script.onload = () => {
      // NewmarkModule() retorna una Promise que resuelve con la instancia
      window.NewmarkModule({ locateFile: (f) => `/wasm/${f}` })
        .then(resolve)
        .catch(reject)
    }
    script.onerror = () => reject(new Error(`No se pudo cargar ${WASM_JS_URL}`))
    document.head.appendChild(script)
  })

  return _modulePromise
}

// --------------------------------------------------------------------------
//  Hook principal
// --------------------------------------------------------------------------
export function useNewmark() {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const moduleRef = useRef(null)

  useEffect(() => {
    loadNewmarkModule()
      .then((mod) => {
        moduleRef.current = mod
        setReady(true)
      })
      .catch((err) => {
        setLoadError(err.message)
      })
  }, [])

  // ------------------------------------------------------------------------
  //  computeSpectrum  —  funcion principal del hook
  // ------------------------------------------------------------------------
  async function computeSpectrum({
    accel,                    // Float64Array | number[]  en cm/s²
    dt,                       // number  [s]
    dampings = [0, 0.02, 0.05],
    newmarkType = 0,           // 0 = accel. constante, 1 = accel. lineal
    nPeriods = 1000,
    TMin = 0.01,
    TMax = 10.0,
  }) {
    if (!moduleRef.current) {
      return { periods: null, Sa: null, error: 'Modulo WASM no cargado aun.' }
    }

    const mod  = moduleRef.current
    const npts = accel.length
    const nxi  = dampings.length

    // Cada double ocupa 8 bytes
    const DOUBLE = 8

    // --- Reservar memoria en el heap WASM ---
    const pAg       = mod._malloc(npts * DOUBLE)
    const pXi       = mod._malloc(nxi  * DOUBLE)
    const pPeriods  = mod._malloc(nPeriods * DOUBLE)
    const pSa       = mod._malloc(nxi * nPeriods * DOUBLE)

    try {
      // --- Escribir aceleraciones en el heap ---
      const agView = new Float64Array(mod.HEAPF64.buffer, pAg, npts)
      agView.set(accel instanceof Float64Array ? accel : Float64Array.from(accel))

      // --- Escribir fracciones de amortiguamiento ---
      const xiView = new Float64Array(mod.HEAPF64.buffer, pXi, nxi)
      xiView.set(Float64Array.from(dampings))

      // --- Llamar a la funcion C++ ---
      const ret = mod.ccall(
        'computeSpectrum',
        'number',
        [
          'number', // ag*
          'number', // npts
          'number', // dt
          'number', // xiArr*
          'number', // nxi
          'number', // newmarkType
          'number', // nPeriods
          'number', // TMin
          'number', // TMax
          'number', // outPeriods*
          'number', // outSa*
        ],
        [pAg, npts, dt, pXi, nxi, newmarkType, nPeriods, TMin, TMax, pPeriods, pSa]
      )

      if (ret !== 0) {
        return { periods: null, Sa: null, error: `Error en nucleo WASM: codigo ${ret}` }
      }

      // --- Leer resultados desde el heap (copias independientes) ---
      const periods = new Float64Array(
        mod.HEAPF64.buffer.slice(pPeriods, pPeriods + nPeriods * DOUBLE)
      )

      const Sa = []
      for (let i = 0; i < nxi; i++) {
        const offset = pSa + i * nPeriods * DOUBLE
        Sa.push(new Float64Array(
          mod.HEAPF64.buffer.slice(offset, offset + nPeriods * DOUBLE)
        ))
      }

      return { periods, Sa, error: null }

    } finally {
      // --- Liberar memoria WASM siempre ---
      mod._free(pAg)
      mod._free(pXi)
      mod._free(pPeriods)
      mod._free(pSa)
    }
  }

  return { ready, loadError, computeSpectrum }
}
