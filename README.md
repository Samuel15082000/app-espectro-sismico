# INERTIX WASM — Guía de integración en React + Vite
# =====================================================

## Archivos entregados

| Archivo              | Descripción                                         |
|----------------------|-----------------------------------------------------|
| newmark.cpp          | Núcleo C++ listo para compilar con Emscripten       |
| useNewmark.js        | Hook React que carga y llama al módulo WASM         |
| EjemploEspectro.jsx  | Componente de ejemplo con parseo + cálculo + tabla  |


## PASO 1 — Instalar Emscripten (una sola vez)

    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk
    ./emsdk install latest
    ./emsdk activate latest
    source ./emsdk_env.sh          # Linux/Mac
    emsdk_env.bat                  # Windows


## PASO 2 — Compilar newmark.cpp → WASM

Ejecutar en la carpeta donde está newmark.cpp:

    emcc newmark.cpp -O3 -o newmark.js \
         -s MODULARIZE=1 \
         -s EXPORT_NAME="NewmarkModule" \
         -s EXPORTED_FUNCTIONS='["_computeSpectrum","_malloc","_free"]' \
         -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF64","HEAP32"]' \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s ENVIRONMENT='web,worker'

Esto genera dos archivos:
    newmark.js    ← glue code de Emscripten
    newmark.wasm  ← binario WebAssembly


## PASO 3 — Copiar al proyecto React

    mi-proyecto-vite/
    └── public/
        └── wasm/
            ├── newmark.js      ← copiar aquí
            └── newmark.wasm    ← copiar aquí


## PASO 4 — Agregar el hook y el componente

    mi-proyecto-vite/
    └── src/
        ├── useNewmark.js          ← copiar aquí
        └── EjemploEspectro.jsx    ← copiar aquí (opcional, es de ejemplo)

En tu componente principal:

    import EjemploEspectro from './EjemploEspectro'

    function App() {
      return <EjemploEspectro />
    }


## PASO 5 — Vite: habilitar headers COOP/COEP (necesario para SharedArrayBuffer)

En vite.config.js agregar:

    export default {
      server: {
        headers: {
          'Cross-Origin-Opener-Policy':   'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      },
    }

Si usas Netlify/Vercel, agregar en netlify.toml o vercel.json:

    # netlify.toml
    [[headers]]
      for = "/*"
      [headers.values]
        Cross-Origin-Opener-Policy   = "same-origin"
        Cross-Origin-Embedder-Policy = "require-corp"

    # vercel.json
    {
      "headers": [
        {
          "source": "/(.*)",
          "headers": [
            { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
            { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
          ]
        }
      ]
    }


## API del hook useNewmark

    const { ready, loadError, computeSpectrum } = useNewmark()

    const { periods, Sa, error } = await computeSpectrum({
      accel      : Float64Array,   // aceleraciones en cm/s²
      dt         : number,         // paso de tiempo [s]
      dampings   : number[],       // fracciones de amortiguamiento (ej. [0, 0.02, 0.05])
      newmarkType: 0 | 1,          // 0=accel. constante  1=accel. lineal
      nPeriods   : number,         // puntos del espectro (defecto 1000)
      TMin       : number,         // periodo mínimo (defecto 0.01 s)
      TMax       : number,         // periodo máximo (defecto 10.0 s)
    })

    // Resultado:
    periods        // Float64Array  longitud nPeriods
    Sa[i]          // Float64Array  Sa para dampings[i], longitud nPeriods
    error          // string | null


## Rendimiento esperado

| Registro     | JS puro   | WASM (-O3) |
|--------------|-----------|------------|
| 2,000 pts    | ~0.8 s    | ~0.05 s    |
| 10,000 pts   | ~4.0 s    | ~0.25 s    |
| 50,000 pts   | ~20 s     | ~1.2 s     |

(5 curvas de amortiguamiento, 1000 periodos, máquina moderna)


## Conectar a una librería de gráficos

El hook retorna arrays nativos Float64Array.
Ejemplo con Recharts:

    const chartData = Array.from(result.periods, (T, i) => ({
      T,
      xi0:  result.Sa[0][i],
      xi2:  result.Sa[1][i],
      xi5:  result.Sa[2][i],
    }))

    <LineChart data={chartData}>
      <XAxis dataKey="T" label="Período (s)" />
      <YAxis label="Sa (cm/s²)" />
      <Line dataKey="xi0" name="xi=0%" dot={false} />
      <Line dataKey="xi2" name="xi=2%" dot={false} />
      <Line dataKey="xi5" name="xi=5%" dot={false} />
      <Legend />
      <Tooltip />
    </LineChart>
