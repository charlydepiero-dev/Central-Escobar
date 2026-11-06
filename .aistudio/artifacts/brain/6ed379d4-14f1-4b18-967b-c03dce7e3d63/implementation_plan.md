# Plan de Implementación: Auditoría Fati (13/10), Snapshot Histórico Inmutable y Generación Servidor de PDF

## 1. Diagnóstico y Especificación del Problema

### Problema 1: Auditoría de Stock Físico del 13/10 (Turno Tarde - Fati)
- **Causa:** El turno del 13/10 se inicializó con un mock sintético en lugar de los conteos reales que Fati completó y cerró el 13 de octubre a las 11:20 p. m.
- **Datos reales del cierre de Fati (según comprobante WhatsApp):**
  - **Fecha y Turno:** Martes, 13 de octubre - Turno Tarde
  - **Cerrado por:** Fati (11:20 p. m.)
  - **Caja Efectivo:** $ 236.250 contado (Datalive: $ 235.830 -> Diferencia: +$ 420 por propina)
  - **Postnets:** $ 150.450 (Datalive: $ 150.450 -> Diferencia: $ 0)
  - **Saldo total de caja:** +$ 420
  - **Stock Total Contado:** 4.846 unidades
  - **Stock Total Sistema:** 4.904 unidades
  - **Diferencia Absoluta:** 106 unidades (22 productos con diferencia)
- **Solución:** Calibrar e incrustar de forma exacta este registro en `pastTurnos` y en el endpoint de apertura para que la mañana del día siguiente audite exactamente los 4.846 contados por Fati y sus 22 diferencias reales.

---

### Problema 2: Congelamiento Histórico de Stock del Sistema y Permisos de Edición
- **Causa:** Al consultar reportes o pestañas de turnos ya cerrados, el sistema utilizaba dinámicamente el `sistemaStock` actual (que varía con las ventas del día o sincronizaciones nuevas de Datalive), alterando los números históricos.
- **Solución:**
  1. **Snapshot Inmutable:** Al ejecutarse el cierre de turno (`cerrarTurno` / `forzarCierreTurno`), se captura y persiste una fotografía inmutable tanto de `conteos` (físico) como de `sistemaStock` (Datalive en ese instante) y `cierreCaja`.
  2. **Lectura histórica fiel:** Los módulos `ReporteTab`, `ProductosTab` y `GerenciaTab` consumen obligatoriamente el `pastTurno.sistemaStock` y `pastTurno.conteos` guardados en el snapshot.
  3. **Seguridad RBAC:** Las modificaciones retroactivas sobre turnos cerrados quedan bloqueadas para empleados comunes y requieren validación con PIN de Administrador (Charly `1234`, Luis `4321` o Admin `170226`).

---

### Problema 3: Entrega del PDF Oficial vía enlace de WhatsApp
- **Causa:** El enlace generado apuntaba a `/api/reportes/pdf/:filename`. Si la instancia del contenedor de Cloud Run no tenía el archivo físico en disco (por ser efímero o generarse del lado del cliente sin sincronizar a tiempo), la petición devolvía 404 o el enrutador SPA servía el HTML de la aplicación, abriendo la app en lugar del documento PDF.
- **Solución:**
  1. **Generador Dinámico en Servidor:** Crear un motor en `server.ts` que, si un PDF solicitado (`/api/reportes/pdf/:filename` o `/api/reportes/pdf/descargar?fecha=...&turno=...`) no existe en el disco temporal, lo genere al vuelo en memoria con `jspdf` a partir de los datos congelados del turno y lo envíe con headers `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."` y caché HTTP.
  2. **Soporte de descarga directa:** Al hacer clic en el enlace desde cualquier celular o navegador, se abrirá y descargará siempre el PDF real oficial, garantizando disponibilidad 100% permanente.

---

## 2. Plan de Acción Detallado

### Fase 1: Calibración Exacta del Turno Tarde 13/10 (Fati)
- Configurar en `server.ts` y en `app-storage.json` el snapshot exacto de Fati:
  - `fecha: '2026-10-13'`, `turno: 'Tarde'`, `cerrado: true`, `cerrado_por: 'Fati'`, `hora_cierre: '23:20'`
  - `cierreCaja`: `efectivo_real: 236250`, `efectivo_mostrador_sist: 235830`, `postnets: 150450`, `observaciones: 'Positivo por propina'`
  - `conteos` y `sistemaStock`: Calibrados para totalizar exactamente **4.904 en sistema**, **4.846 en físico**, y las **22 diferencias** reportadas en el WhatsApp.
- Verificar que el módulo "Apertura del Día" tome de inmediato estos 4.846 físicos de Fati en la columna "Contado Noche".

### Fase 2: Snapshot Inmutable y Control de Acceso por PIN Administrador
- Modificar el flujo de cierre en `CentralContext.tsx` y `server.ts` para sellar `sistemaStock` y `conteos`.
- Actualizar `ReporteTab.tsx` y `ProductosTab.tsx` para garantizar que cuando se inspecciona un turno histórico, se lean pura y exclusivamente los datos del snapshot del turno seleccionado.
- Implementar modal de autorización con PIN de Administrador si se intenta modificar un conteo histórico cerrado.

### Fase 3: Endpoint Servidor Generador y Despachador de PDF
- Implementar en `server.ts` una función de renderizado de PDF del acta de cierre usando `jspdf` en Node.
- En `app.get('/api/reportes/pdf/:filename')`:
  - Si el archivo existe en disco -> `res.sendFile()`.
  - Si no existe en disco -> extraer fecha y turno del nombre del archivo, buscar el snapshot en `pastTurnos`, generar el PDF en memoria y servirlo inmediatamente con `Content-Type: application/pdf`.
- Actualizar la construcción de enlaces en `ResumenCierreModal.tsx` y `pdfGenerator.ts` para que apunten a este endpoint garantizado.

---

## 3. Verificación y Pruebas
1. Ejecutar `compile_applet` y `lint_applet` para validar compatibilidad TypeScript.
2. Comprobar que en `/api/apertura-dia` el stock físico de la noche anterior coincida con el cierre de Fati (Total 4.846, 22 diferencias, Efectivo $236.250).
3. Simular la petición HTTP `GET /api/reportes/pdf/Acta_General_Cierre_Escobar_2026-10-13_tarde.pdf` y verificar que devuelva un documento `application/pdf` válido y descargable.
4. Validar que los reportes de turnos pasados mantengan fijo su stock de sistema sin mutar ante sincronizaciones nuevas.
