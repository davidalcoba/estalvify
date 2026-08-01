# Roadmap de producto — Estalvify

> **Propósito de este fichero.** Es la fuente de verdad única para evolucionar
> Estalvify hacia una app de finanzas personales completa: prever gasto futuro,
> programar gastos recurrentes, hacer presupuestos, tener reports, notificaciones y
> recomendaciones con IA. Está pensado para ejecutarse **en varias sesiones**, de
> forma incremental. Cada sesión toma la **siguiente fase pendiente**, la implementa
> como un PR independiente siguiendo `PLAYBOOK_NEW_FEATURE.md`, y **marca la fase como
> hecha aquí** en el mismo cambio.

**Última actualización:** 2026-08-01 · **Fase en curso:** ninguna ·
**Siguiente a construir:** Fase 4 — Reports + Dashboard con datos reales.

---

## 1. Revisión de lo existente

| Área | Estado | Archivos / notas clave |
|---|---|---|
| Conexión bancaria (PSD2 / Enable Banking) | ✅ Estable | `lib/banking/*`, `app/(app)/accounts/`, `app/api/banking/*` |
| Sync de transacciones (cron diario + colas) | ✅ Estable | `app/api/cron/sync`, `app/api/queues/sync-connection`, `lib/queue.ts` |
| Transacciones (solo lectura, vienen del banco) | ✅ Estable | `app/(app)/transactions/`, `lib/transactions/transaction-dto.ts` |
| Categorización manual | ✅ Estable | `app/(app)/categorize/`, `lib/categorize.ts` |
| Motor de reglas (auto-categorización) | ✅ Estable | `app/(app)/rules/`, `lib/rules/*` |
| Categorías (usuario + sistema, jerárquicas) | ✅ Estable | `components/settings/category-manager.tsx`, `app/(app)/settings/actions.ts` |
| Cuentas y balances | ✅ Estable | `app/(app)/accounts/`, modelos `BankAccount` / `AccountBalance` |
| Ajustes / preferencias (zona, moneda, locale) | ✅ Estable | `app/(app)/settings/`, `lib/user-prefs.ts` |
| **Dashboard** | 🟡 Stub | `app/(app)/dashboard/page.tsx` — KPIs hardcodeados a 0, sin queries |
| **Presupuestos** | ✅ Estable | Presupuesto mensual por categoría vs gasto real: `app/(app)/budget/`, `lib/budget/`, `lib/analytics/spending.ts`, `components/budget/` |
| **Reports** | 🟡 Stub | `app/(app)/reports/page.tsx` — pantalla vacía; **sin librería de gráficas** (tokens `--chart-1..5` ya en `app/globals.css`) |
| Gastos recurrentes / suscripciones | ✅ Estable | Detección automática desde el histórico + confirmar/ignorar: `app/(app)/recurring/`, `lib/recurring/`, `components/recurring/`, modelo `RecurringSeries` |
| Previsión (forecast) | ❌ No existe | — |
| Notificaciones | ✅ Estable (in-app) | Centro in-app: campana en el header + generación idempotente por cron: `lib/notifications/`, `components/notifications/`, `app/(app)/notifications/`, modelo `Notification`. Push/email pendientes |
| Recomendaciones con IA | ❌ No existe | El valor `CategorizationSource.AI` se reservó y luego se eliminó |

**Convenciones a respetar** (de `ARCHITECTURE.md` / `CODING_RULES.md`): lógica de
dominio en `lib/`, mutaciones en `actions.ts` (Server Actions) o `app/api/`, UI de
dominio en `components/<dominio>/` con **vistas desktop y mobile separadas**, primitivas
en `components/ui/`. **Scoping estricto por `userId`** (multi-usuario). DTOs planos en el
límite server→client (nada de `Date`/`Decimal`). Dinero y fechas siempre vía
`lib/formatters`. Colores solo con **tokens semánticos**. Tests de lógica pura con
Vitest, co-locados como `lib/**/*.test.ts`. Preferencia **Vercel-first** para infra.

---

## 2. Benchmarking de apps similares

Ideas destiladas de YNAB, Copilot Money, Monarch y Rocket Money, adaptadas al hecho de
que en Estalvify **las transacciones son reales del banco** (no manuales):

- **Presupuesto por categoría / zero-based** ("cada euro tiene un trabajo", YNAB): el
  usuario reparte un importe planificado por categoría y ve el progreso real.
- **Auto-detección de suscripciones y "subscription creep"** (Rocket Money, Copilot):
  detectar cargos recurrentes del histórico y avisar de subidas o suscripciones que ya
  no se usan. Es el punto donde el dato bancario de Estalvify brilla.
- **Predicción de gasto del próximo mes** por patrones históricos (ExpenseMind,
  Copilot): "vas camino de gastar X este mes".
- **Insights en lenguaje natural** y búsqueda conversacional (Copilot, Monarch):
  resúmenes y recomendaciones legibles, no solo tablas.
- **Alertas proactivas**: presupuesto excedido, saldo bajo previsto, cargo inusual,
  nuevo recurrente detectado.

---

## 3. Funcionalidades propuestas (visión)

1. **Presupuestos.** Presupuesto mensual por categoría con barras de progreso vs gasto
   real del mes. Los modelos ya existen; es lo más cercano a estar listo y la base de
   las alertas de presupuesto.
2. **Gastos recurrentes + suscripciones.** Detección automática desde el histórico
   agrupando por comercio/importe/periodicidad. Nuevo modelo `RecurringSeries`. UI para
   revisar/confirmar series. Diferenciador clave del producto.
3. **Previsión (forecast).** Proyección de gasto y saldo a fin de mes y próximos N meses
   combinando recurrentes confirmados + medias históricas por categoría.
4. **Reports + Dashboard con datos reales.** Dar vida al dashboard (KPIs reales) y a
   Reports con gráficas: gasto por categoría, tendencia mensual, ingresos vs gastos, top
   comercios. Requiere instalar una librería de charts (candidata: **Recharts**),
   consumiendo los tokens `--chart-*`.
5. **Centro de notificaciones in-app.** Modelo `Notification` + campana en el header,
   generadas por heurísticas (presupuesto excedido, recurrente nuevo, saldo bajo
   previsto). Base para push/email en el futuro.
6. **Recomendaciones con IA.** Wrapper agnóstico de proveedor en `lib/ai/` que genera
   insights/recomendaciones a partir de **resúmenes estructurados y anonimizados** (no
   transacciones crudas). Por defecto proveedor Claude, intercambiable por env var.

---

## 4. Plan por fases

Orden recomendado con dependencias explícitas. Cada fase = un PR independiente que
respeta `PLAYBOOK_NEW_FEATURE.md` (capas correctas, vistas desktop+mobile, scoping por
usuario, tests de lógica pura, y actualización de docs + `.env.example` en el mismo
cambio). Marca el estado aquí al terminar.

- [x] **Fase 0 — Fundaciones de datos** ✅ — `lib/analytics/spending.ts` (rango de mes,
  `where` de gasto mensual y agregación por categoría, con tests). Ampliar con ingresos
  vs gastos y totales por mes cuando lleguen Dashboard/Reports (Fase 4).
- [x] **Fase 1 — Presupuestos** ✅ — presupuesto mensual por categoría vs gasto real, con
  navegación de mes, copiar mes anterior y sección de gasto sin presupuestar. Ver §5.
- [x] **Fase 2 — Recurrentes + suscripciones** ✅ — modelo `RecurringSeries`, detector puro
  en `lib/recurring/` (normalización de comercio, clasificación de cadencia con check de
  consistencia) con tests, y `/recurring` con detección en vivo + confirmar/ignorar y
  resumen de coste mensual. Falta (fases futuras): asignar categoría a una serie desde la
  UI y persistir snapshots de forma proactiva en el sync.
- [x] **Fase 3 — Centro de notificaciones in-app** ✅ — modelo `Notification`, campana en
  el header con badge de no leídas, generadores puros (presupuesto excedido/cercano y
  cargo recurrente próximo) idempotentes por `(userId, dedupeKey)`, ejecutados en el cron
  diario y por un botón "Check now". Falta (fases futuras): push (PWA) y email.
- [ ] **Fase 4 — Reports + Dashboard con datos reales.** Instalar librería de charts,
  construir sobre la Fase 0. Envolver los charts en `components/ui/`.
- [ ] **Fase 5 — Forecast.** Proyección usando recurrentes (Fase 2) + medias (Fase 0).
  Alimenta una notificación de "saldo bajo previsto".
- [ ] **Fase 6 — Recomendaciones con IA.** Wrapper de proveedor; recomendaciones
  ancladas en las agregaciones (Fase 0) y presupuestos (Fase 1) ya existentes.

**Dependencias:** F1 y F4 dependen de F0. F3 depende de F1 (para la alerta de
presupuesto). F5 depende de F0 + F2. F6 se apoya en F0 + F1 (y mejora con F2/F5).

---

## 5. Detalle ejecutable — Fase 1: Presupuestos

Listo para que la próxima sesión lo implemente sin re-diseñar:

- **Datos.** Reutilizar `Budget` / `BudgetItem` (`prisma/schema.prisma`) — **no hacen
  falta migraciones**. Añadir `lib/analytics/spending.ts`: gasto real por categoría en
  un `(year, month)`, uniendo `Transaction` + `TransactionCategorization` con estado
  `APPROVED` + `Category`, **scoped por `userId`**. Co-locar `lib/analytics/spending.test.ts`.
- **Mutaciones.** `app/(app)/budget/actions.ts`: crear/actualizar el presupuesto del mes,
  upsert de `BudgetItem` por categoría, y "copiar del mes anterior". Patrón de
  `app/(app)/rules/actions.ts`: `const session = await auth()` → `userId` de la sesión →
  queries scoped → `revalidatePath`.
- **DTO.** `lib/budget/budget-dto.ts` (Decimal→number; sin `Date`/`Decimal` cruzando al
  cliente), patrón de `lib/transactions/transaction-dto.ts`.
- **UI.** `components/budget/` con orquestador + `views/budget-desktop-view.tsx` /
  `views/budget-mobile-view.tsx` + `shared/`. Barras de progreso con
  `components/ui/progress.tsx`. Selector de categoría con
  `components/categorize/category-select`. Dinero/fechas con `lib/formatters`. Sustituir
  el stub de `app/(app)/budget/page.tsx`.
- **Estados.** Vacío (sin presupuesto del mes → CTA "crear presupuesto del mes").
  Progreso con colores **semánticos**: `success` (holgado), `warning` (cerca del
  límite), `destructive` (excedido).
- **Docs.** Actualizar `PROJECT_OVERVIEW.md` (budget pasa de stub a estable) y marcar la
  Fase 1 (y 0) como hechas aquí.

---

## 6. Notas de diseño para fases futuras (decisiones ya tomadas)

Para no volver a decidir cuando lleguen estas fases:

- **Wrapper de IA (Fase 6).** `lib/ai/index.ts` exporta una interfaz `AiProvider`
  (p. ej. `generateRecommendations(summary)` / `complete(prompt)`). `lib/ai/factory.ts`
  elige implementación según la env `AI_PROVIDER` (`claude` por defecto).
  `lib/ai/providers/claude.ts` primero; otros proveedores después implementando la misma
  interfaz. Nuevas env en `.env.example`: `AI_PROVIDER`, `ANTHROPIC_API_KEY`. **La IA
  recibe solo agregados anonimizados** (totales por categoría, tendencias), nunca IBANs
  ni descripciones crudas de transacciones.
- **Notificaciones (Fase 3).** Modelo `Notification` (`userId`, `type`, `title`, `body`,
  `severity`, `readAt?`, `metadata Json`, `createdAt`). Lógica en `lib/notifications/`.
  Campana en el header (`components/layout/`). Generadores **idempotentes** que pueden
  correr dentro del cron diario existente (`app/api/cron/sync`). Diseñado como base para
  añadir push (PWA) o email después.
- **Recurrentes (Fase 2).** Modelo `RecurringSeries` (`userId`, `merchantKey`,
  `categoryId?`, `averageAmount`, `cadence`, `nextExpectedDate`, `lastSeenAt`, `status`).
  Detector puro y testeable en `lib/recurring/` (agrupa por comercio/importe/periodicidad
  sobre el histórico de `Transaction`).
- **Charts (Fase 4).** Una sola librería para todo (Recharts como candidata), consumiendo
  `--chart-1..5` de `app/globals.css`. Envolver siempre en `components/ui/` — nunca
  hand-rollear gráficas dentro de un `page.tsx`.

---

## 7. Cómo usar este fichero en cada sesión

1. Lee este roadmap y coge la **primera fase sin marcar** en §4.
2. Sigue `PLAYBOOK_NEW_FEATURE.md` para implementarla (un PR).
3. Al terminar: marca la casilla de la fase, actualiza "Última actualización" y
   "Siguiente a construir" arriba, y actualiza cualquier doc de `context/` afectado.
4. Corre `npm run typecheck && npm run lint && npm run test` antes de cerrar.
