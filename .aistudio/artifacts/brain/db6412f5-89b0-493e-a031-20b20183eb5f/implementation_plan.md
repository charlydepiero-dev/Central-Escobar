# Plan de Diagnóstico Profundo y Solución Definitiva: Control de Stock y Turno Tarde

Diagnóstico exhaustivo de las causas raíces identificadas tras 3 días de incidencias y arquitectura de la solución definitiva para el control de stock en móviles y la persistencia inmutable del Turno Tarde.

---

## Diagnóstico Profundo: ¿Por qué ocurrían estos 2 errores?

### Error 1: Ingresa en Turno Tarde pero a los pocos segundos se cambia solo a Turno Mañana
* **Causa Raíz Identificada:** En `src/context/CentralContext.tsx`, la función `sincronizarConServidor` se ejecuta en un temporizador periódico cada 4 segundos. El archivo del servidor (`.data/app-storage.json`) tenía guardado `"turnoActivo": { "turno": "Mañana" }`. Aunque el usuario elegía "Tarde" en la pantalla de PIN o en su sesión local, a los 4 segundos el poller traía el JSON del servidor y ejecutaba `setCurrentTurno(data.turnoActivo.turno)` (que era "Mañana"), sobrescribiendo la sesión del colaborador.
* **Causa Secundaria:** La variable `ignoreSyncTurno` agregada recientemente era solo un estado volátil en memoria que iniciaba en `false` cada vez que la página recargaba o se abría la PWA en el celular, por lo que a los 4 segundos exactos de entrar, se volvía a poner en "Mañana".
* **Solución Definitiva:**
  1. **Autoridad de Sesión:** Si el usuario tiene una sesión activa con turno seleccionado (guardado en `localStorage` y en la sesión del empleado), el poller periódico **NUNCA** puede alterar su `currentTurno`.
  2. **Persistencia Inmediata en Servidor y Archivo:** Cuando el usuario selecciona Turno Tarde (al ingresar con PIN o al cambiarlo en la cabecera), se emite una llamada inmediata al servidor que actualiza de inmediato `.data/app-storage.json` a `"Tarde"`.
  3. **Selector Directo en Cabecera:** Se habilita un botón conmutador directo en la barra superior (`CentralHeader`) que permite alternar entre "Turno Mañana" y "Turno Tarde" con un solo toque y confirmación visual inmediata.

---

### Error 2: Al scrolear en el celular mientras se completa el stock, la pantalla se bloquea y pide "Tomar para contar"
* **Causa Raíz Identificada:** En `ContarTab.tsx`, la propiedad que deshabilita los campos de entrada de stock está definida como:
  ```typescript
  const isLockedInputs = esAjena || estaLibre || turnoCerrado;
  ```
  Observar el término `estaLibre`: el sistema consideraba que si una categoría no estaba tomada explícitamente (`estaLibre === true`), **todos los casilleros de números debían estar deshabilitados (`disabled={isLockedInputs}`)** y mostrar un botón invasivo que tapaba la pantalla: *"Esta categoría está libre para contar · Tomar para contar"*.
* **Por qué ocurría mientras scroleabas:**
  1. Mientras el empleado scrolea hacia abajo completando las empanadas, el intervalo de 4 segundos consulta `/api/turno/state`.
  2. Si el servidor respondía con `reclamos: {}` (porque el servidor se reinició, o no hubo reclamo previo guardado en disco), la función de sincronización ejecutaba `setReclamos(data.reclamos)`.
  3. Esto borraba el reclamo local del empleado en memoria. Inmediatamente `estaLibre` pasaba a valer `true`.
  4. Al pasar a `true`, todos los `input` de la pantalla se deshabilitaban (`disabled={true}`), el teclado del celular se cerraba abruptamente, se perdía el foco y aparecía el cartel verde bloqueante pidiendo "Tomar para contar".
* **Solución Definitiva:**
  1. **Eliminar el bloqueo por "Categoría Libre":** Una categoría libre **NUNCA** debe tener los inputs bloqueados. Todo empleado autenticado puede ingresar números directamente sin tener que presionar previamente ningún botón de "Tomar".
  2. **Auto-Reclamo Transparente:** En el instante en que el usuario toca cualquier casillero o escribe un número, el sistema auto-asigna la categoría a ese colaborador automáticamente en segundo plano.
  3. **Preservación Inmutable Local:** La sincronización periódica jamás pisará ni borrará la categoría que el empleado actual está editando en su dispositivo.
  4. **Auto-Guardado Continuo:** Cada número ingresado se sincroniza de inmediato con `conteoActual` y `localStorage` para que scrolear o cambiar de aplicación jamás borre los datos ingresados.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisión Arquitectónica Clave:** Se elimina la fricción de "Tomar para contar" para categorías libres. Los empleados podrán escribir sus conteos directamente al entrar a cualquier categoría sin bloqueos ni pasos intermedios. El bloqueo solo existirá si **otro** empleado diferente la está contando en ese mismo instante en otro teléfono.

---

## 1. Overview & Core Concept
* **Experiencia de Usuario Fluida en Celulares:** El empleado ingresa su PIN, selecciona su turno ("Tarde") y va directamente a contar stock.
* **Cero Bloqueos al Scrolear:** Los campos de texto permanecen interactivos, el teclado numérico no se cierra y los valores no se pierden al desplazarse verticalmente.
* **Persistencia Robusta:** El turno seleccionado se congela tanto en el teléfono como en el archivo físico del servidor (`app-storage.json`).

---

## 2. User Experience & Visual Design

### Flujo de Trabajo en Celular
1. **Login Simple con Turno Fijo:** El usuario toca su nombre (ej. Axel o Fati), confirma "Turno Tarde", ingresa su PIN y entra. La cabecera muestra inmediatamente `Turno Tarde` con un punto verde.
2. **Entrada Directa a Contar:**
   * Al seleccionar "Empanadas", los casilleros de Freezer, Heladera, Mostrador, etc. están listos para escribir de inmediato.
   * Sin botones de "Tomar para contar" bloqueando la pantalla.
   * Al escribir un valor, se guarda al instante.
3. **Indicador Discreto de Estado:**
   * Si la categoría la está editando el usuario actual: badge sutil verde *"Editando por vos"*.
   * Si está libre: editable directamente sin bloqueo.
   * Si la está editando otro colaborador en simultáneo: badge ámbar avisando quién la tiene tomada, con botón para liberar si es Administrador.

---

## 3. Key Product Decisions & Trade-Offs

* **Decisión 1: Eliminar `estaLibre` de la condición `isLockedInputs`**
  * *Estrategia:* `const isLockedInputs = esAjena || turnoCerrado;`
  * *Beneficio:* Corrige el 100% de los incidentes de congelamiento de pantalla y cierre de teclado en teléfonos móviles.
* **Decisión 2: Sincronización Protegida del Turno**
  * *Estrategia:* En `sincronizarConServidor`, si hay un empleado autenticado en el dispositivo (`currentEmpleado !== null`), el turno local manda sobre el servidor. A su vez, el cliente notifica al servidor su turno para que el servidor también se actualice a "Tarde".
* **Decisión 3: Recompilación y Reinicio Limpio**
  * *Estrategia:* Ejecutar `npm run build` para asegurar que `server.js` y `dist/` contengan el código corregido y reiniciar el proceso Node.js.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   DISPOSITIVO MÓVIL                    │
│                                                        │
│  CheckinScreen ──> loginWithPin('Tarde')               │
│       │                                                │
│       ▼                                                │
│  CentralContext (Session: Turno Tarde Inmutable)       │
│       │                                                │
│       ├──> ContarTab: Inputs SIEMPRE habilitados        │
│       │    (Auto-claim al escribir / scroleo libre)    │
│       │                                                │
│       └──> Poller (cada 4s): Protegido                  │
│            • NO pisa el turno seleccionado             │
│            • NO borra reclamos del usuario activo      │
└───────────────────────┬────────────────────────────────┘
                        │ HTTP POST / PUT
                        ▼
┌────────────────────────────────────────────────────────┐
│                    BACKEND NODE.JS                     │
│                                                        │
│  /api/turno/actualizar-turno                           │
│  /api/auth/verify (Persiste turno: 'Tarde' en disco)   │
│  /api/reclamos/toggle                                  │
│  .data/app-storage.json (Actualizado inmutablemente)  │
└────────────────────────────────────────────────────────┘
```

### Plan de Cambios Específicos
1. **`src/components/ContarTab.tsx`**:
   - Cambiar `const isLockedInputs = esAjena || turnoCerrado;` (eliminando `estaLibre`).
   - Agregar auto-claim al escribir en cualquier campo (`handleInputChange`).
   - Reemplazar la barra invasiva de "Tomar para contar" por un indicador sutil no bloqueante.
2. **`src/context/CentralContext.tsx`**:
   - Proteger `currentTurno`: si el usuario está logueado, la sincronización de fondo jamás lo revierte a "Mañana".
   - Crear función `cambiarTurnoActual(turno: 'Mañana' | 'Tarde')` expuesta al header y a toda la app que sincronice inmediatamente al backend.
   - Proteger `reclamos`: fusionar inteligentemente los reclamos del servidor sin borrar los reclamos que el usuario tiene activos localmente.
3. **`server.ts`**:
   - Asegurar endpoint `/api/turno/set-turno` para actualizar `storage.turnoActivo.turno` en cualquier momento y persistirlo en `.data/app-storage.json`.
   - Modificar `.data/app-storage.json` para que `turnoActivo.turno` sea `"Tarde"`.
4. **Build & Verificación**:
   - Ejecutar `npm run build` y recompilar `server.js`.
   - Reiniciar el servidor de desarrollo y verificar que ambos comportamientos queden 100% estables.
