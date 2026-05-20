// =============================================================================
//  INERTIX - Nucleo Newmark-Beta para WebAssembly
//  Compilar con Emscripten:
//
//  emcc newmark.cpp -O3 -o newmark.js \
//       -s MODULARIZE=1 \
//       -s EXPORT_NAME="NewmarkModule" \
//       -s EXPORTED_FUNCTIONS='["_computeSpectrum","_malloc","_free"]' \
//       -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF64","HEAP32"]' \
//       -s ALLOW_MEMORY_GROWTH=1 \
//       -s ENVIRONMENT='web,worker'
// =============================================================================

#include <cmath>
#include <cstdlib>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// -----------------------------------------------------------------------------
//  newmarkMaxDisp
//  Retorna el desplazamiento maximo absoluto para un oscilador SDOF.
//
//  ag      : aceleraciones del registro [cm/s²], longitud npts
//  dt      : paso de tiempo [s]
//  Tn      : periodo natural [s]
//  xi      : fraccion de amortiguamiento critico (0.05 = 5%)
//  beta    : parametro Newmark (0.25 = acel. constante, 1/6 = acel. lineal)
//  gam     : parametro Newmark (siempre 0.5)
// -----------------------------------------------------------------------------
static double newmarkMaxDisp(
    const double* ag,
    int           npts,
    double        dt,
    double        Tn,
    double        xi,
    double        beta,
    double        gam)
{
    if (Tn < 1e-10) return 0.0;

    const double omega = 2.0 * M_PI / Tn;
    const double k     = omega * omega;          // masa = 1
    const double c     = 2.0 * xi * omega;       // masa = 1

    const double a1   = 1.0 / (beta * dt * dt) + gam * c / (beta * dt);
    const double a2   = 1.0 / (beta * dt)       + (gam / beta - 1.0) * c;
    const double a3   = (0.5 / beta - 1.0)      + dt * (gam / (2.0 * beta) - 1.0) * c;
    const double keff = k + a1;

    double u    = 0.0;
    double v    = 0.0;
    double a    = -ag[0];           // a(0) = -ag(0) / m,  m=1
    double umax = 0.0;

    for (int i = 0; i < npts - 1; ++i)
    {
        double peff  = -ag[i + 1] + a1 * u + a2 * v + a3 * a;
        double u_new = peff / keff;
        double v_new = gam / (beta * dt) * (u_new - u)
                     + (1.0 - gam / beta) * v
                     + dt  * (1.0 - gam / (2.0 * beta)) * a;
        double a_new = (u_new - u) / (beta * dt * dt)
                     - v  / (beta * dt)
                     - (0.5 / beta - 1.0) * a;

        u = u_new;  v = v_new;  a = a_new;
        double absU = u < 0.0 ? -u : u;
        if (absU > umax) umax = absU;
    }
    return umax;
}

// =============================================================================
//  computeSpectrum  — funcion exportada al JS
//
//  Parametros de entrada (todos pasados por puntero / valor):
//    ag        [double*]  : arreglo de aceleraciones en cm/s², longitud npts
//    npts      [int]      : numero de puntos del registro
//    dt        [double]   : paso de tiempo en segundos
//    xiArr     [double*]  : arreglo de fracciones de amortiguamiento (ej. 0.05)
//    nxi       [int]      : cantidad de curvas de amortiguamiento (max 5)
//    newmarkType [int]    : 0 = aceleracion constante, 1 = aceleracion lineal
//    nPeriods  [int]      : numero de periodos a evaluar (ej. 1000)
//    TMin      [double]   : periodo minimo (ej. 0.01 s)
//    TMax      [double]   : periodo maximo (ej. 10.0 s)
//
//  Salida (arreglos pre-asignados por el caller en JS con _malloc):
//    outPeriods [double*] : periodos calculados, longitud nPeriods
//    outSa      [double*] : Sa[xi_i * nPeriods + t_i], longitud nxi * nPeriods
//
//  Retorna 0 si OK, codigo de error negativo si falla.
// =============================================================================
extern "C"
int computeSpectrum(
    const double* ag,
    int           npts,
    double        dt,
    const double* xiArr,
    int           nxi,
    int           newmarkType,
    int           nPeriods,
    double        TMin,
    double        TMax,
    double*       outPeriods,
    double*       outSa)
{
    // --- Validaciones basicas ---
    if (!ag || npts < 2)       return -1;
    if (!xiArr || nxi < 1)     return -2;
    if (nxi > 10)              return -3;
    if (dt <= 0.0)             return -4;
    if (nPeriods < 2)          return -5;
    if (TMin <= 0.0 || TMax <= TMin) return -6;
    if (!outPeriods || !outSa) return -7;

    // --- Parametros Newmark ---
    double beta = (newmarkType == 0) ? 0.25 : (1.0 / 6.0);
    double gam  = 0.5;

    // --- Grilla de periodos (espaciado lineal) ---
    for (int i = 0; i < nPeriods; ++i)
        outPeriods[i] = TMin + (double)i * (TMax - TMin) / (double)(nPeriods - 1);

    // --- Calculo del espectro ---
    for (int xi_i = 0; xi_i < nxi; ++xi_i)
    {
        double xi = xiArr[xi_i];
        if (xi < 0.0) xi = 0.0;
        if (xi > 1.0) xi = 1.0;

        for (int t_i = 0; t_i < nPeriods; ++t_i)
        {
            double Tn   = outPeriods[t_i];
            double umax = newmarkMaxDisp(ag, npts, dt, Tn, xi, beta, gam);
            double omg  = 2.0 * M_PI / Tn;
            // Sa = omega^2 * Sd  (pseudoaceleracion, cm/s²)
            outSa[xi_i * nPeriods + t_i] = omg * omg * umax;
        }
    }

    return 0;   // OK
}
