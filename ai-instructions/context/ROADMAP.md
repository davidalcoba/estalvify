# Roadmap de producto — Estalvify

> **Propósito de este fichero.** Es la fuente de verdad única para evolucionar
> Estalvify hacia una app de finanzas personales completa: prever gasto futuro,
> programar gastos recurrentes, hacer presupuestos, tener reports, notificaciones y
> recomendaciones con IA. Está pensado para ejecutarse **en varias sesiones**, de
> forma incremental. Cada sesión toma la **siguiente fase pendiente**, la implementa
> como un PR independiente siguiendo `PLAYBOOK_NEW_FEATURE.md`, y **marca la fase como
> hecha aquí** en el mismo cambio.

**Última actualización:** 2026-08-03 · **Fase en curso:** ninguna ·
**Estado:** 🎉 roadmap completo (Fases 1–6 hechas) · **Siguiente:** mantenimiento y mejoras
(push/email para notificaciones, persistencia/caché de insights de IA, asignar categoría a
recurrentes, etc.).

> **Post-roadmap — Auditar el árbol de categorías desde MCP.** `list_transactions` acepta
> `categoryId` (con subcategorías incluidas por defecto, vía `subtreeIds` puro en
> `lib/categories/hierarchy.ts`) y `categoryCounts: true`, que devuelve el **conteo por
> categoría** del mismo conjunto filtrado: todas las categorías visibles **incluidas las
> que están a cero**, las borradas que aún retienen transacciones, y el total sin
> categorizar. Sin esos conteos el árbol no se podía auditar desde un cliente MCP — una
> categoría vacía o casi vacía solo se ve como ausencia. Un `REJECTED` cuenta como sin
> categorizar, igual que en `buildUncategorizedWhere`. Y hay `delete_category`: el mismo
> borrado suave de ajustes (`isActive: false`, categoría + subcategorías) pero **se niega**
> mientras haya transacciones dentro — quedarían en una categoría borrada, invisibles
> también para la bandeja de categorizar — salvo que se pase `reassignToCategoryId` (las
> mueve, MANUAL/APPROVED) o `force: true` (les quita la categorización y vuelven a la
> bandeja). Las reglas que **apuntan** a la categoría se desactivan, porque `runRules` filtra
> por el `isActive` de la regla y nunca por su categoría destino: seguirían categorizando
> dentro de algo borrado.

> **Post-roadmap — `Category.kind` y notificaciones.** Todo importe se deriva ahora de
> `kind` (`EXPENSE`/`INCOME`/`TRANSFER`), no de listas de nombres: el gasto cuenta solo
> EXPENSE y la gráfica de tendencias descarta TRANSFER, que antes hacía que un traspaso entre
> cuentas propias sumara **a la vez** como ingreso y como gasto. Sustituye a `isNonComputable`,
> que estaba en el esquema y no lo leía nadie. `update_category` acepta `parentId` y `kind`,
> con validación de ciclos y del límite de dos niveles (`lib/categories/hierarchy.ts`, puro).
> Y `/notifications` da el histórico completo con paginación y filtro de no leídas — la
> campana solo guarda las 20 últimas y una notificación nunca se repite, así que lo que se
> salía de ahí era irrecuperable.

> **Post-roadmap — Salud del sync.** Un consentimiento PSD2 dura **90 días fijos**; al caducar
> los cuatro productores de sync filtran por `status: "ACTIVE"` y se saltan la conexión **en
> silencio**. Una caída real duró 8 semanas sin que nada avisara. Ahora hay aviso **preventivo**
> (`CONSENT_EXPIRING`, a 14/7/3 días) más red de seguridad (`NO_TRANSACTIONS`, medida sobre la
> transacción más reciente y no sobre `lastSyncAt`, que miente cuando el endpoint devuelve 404).
> Además: reconectar encola sync al momento en vez de esperar al cron, el 404 se registra con
> prefijo `UNSUPPORTED:` en vez de desaparecer, y el cron de notificaciones ya no deriva sus
> usuarios de las conexiones activas — hacerlo silenciaba **todas** las notificaciones justo para
> quien tenía el sync caído.

> **Post-roadmap — Motor de reglas v2.** Las condiciones pasan de un array plano AND a un
> **árbol `{op, children}`** con OR y `negate`, campos nuevos (`any` por defecto, `amount`,
> `direction`, `account`) y operadores `word` (límite de palabra) y `matches` (regex). El
> matching se evalúa **en memoria** (`lib/rules/rule-matcher.ts`, puro) sobre un prefiltro SQL
> estrecho, con **normalización de acentos** en ambos lados. La ejecución es determinista:
> prioridad **ascendente** (número menor primero), first-match-wins, y la categorización
> `MANUAL` **nunca** se sobreescribe sin `force`. Hay **dry run** (con `conflicts`), **undo**
> (`undo_rule_run`, vía `previousCategoryId`/`previousSource`), métricas por regla
> (`matchCount`/`lastRunAt`/`lastMatchAt`) y **auto-run al final del sync** sobre lo no
> categorizado. `lib/rules/apply.ts` es el único camino de ejecución, compartido por MCP y las
> Server Actions. Tools MCP nuevas: `test_rule`, `undo_rule_run`; `run_rule` acepta
> `dryRun`/`force` y `list_transactions` ya devuelve `remittanceInfo`.

> **Post-roadmap — Plan (planificador manual de flujo de caja).** El antiguo *Budget*
> (un importe por categoría y mes) se ha sustituido por **Plan** (`/plan`): el usuario
> declara a mano ingresos y gastos previstos, **varios por categoría** y con **cadencias**
> (semanal/mensual/trimestral/anual/puntual) y **fecha de fin opcional** (`endDate`,
> inclusiva del mes: un préstamo o contrato deja de contar a partir de ahí, pero la
> entrada sigue visible como "ended"). El total mensual estable de una categoría es
> su **límite** (barras real-vs-previsto reutilizando `lib/budget/budget-progress`). El
> **Forecast** proyecta el saldo desde el Plan (`projectBalancesVariable` + `plannedForMonth`),
> con fallback a la media histórica si no hay Plan. Confirmar un recurrente lo añade al
> Plan automáticamente. Modelo `PlanItem` + enum `PlanCadence`; lógica pura en `lib/plan/`.
> `/budget` redirige a `/plan` (tablas `budgets`/`budget_items` intactas pero sin uso).

> **Post-roadmap — Aviso de cargos duplicados.** `DUPLICATE_CHARGE` avisa cuando un cargo
> parece haberse cobrado más de una vez. El id del banco ya impide importar dos veces la
> misma operación (`unique(bankAccountId, externalTransactionId)`), así que esto cubre lo
> que el import no puede ver: el comercio o el banco cobrando dos veces (doble paso de
> tarjeta, pago reintentado que cuela dos veces, recibo presentado dos veces) — algo que
> solo se puede reclamar mientras es reciente, y por eso es una notificación y no un
> informe. Detección pura en `lib/transactions/duplicates.ts`: mismo importe **al céntimo**,
> misma cuenta, misma dirección y misma clave de comercio normalizada, dentro de 3 días
> (por debajo de la cadencia semanal mínima de `lib/recurring/detect.ts`, así que una
> suscripción nunca se confunde con un duplicado) y por encima de **2 €**. Ese suelo es un
> filtro de ruido, **no** parte de la definición: un cargo de 4 € cobrado dos veces está
> igual de mal que uno de 40, y un umbral cómodo (10 €) convertía "no tienes duplicados" en
> "no tienes duplicados de más de 10 €" sin que nada lo dijera. Por debajo de ~2 € las
> repeticiones idénticas son sobre todo transporte, vending y café, donde comprar lo mismo
> dos veces en una tarde es rutina. La versión correcta de ese test no es un umbral de dinero
> sino el **precedente por comercio** ("¿ha repetido este comercio con este importe dentro de
> la ventana alguna vez antes?"), que no necesita suelo pero exige cargar mucho más histórico
> en cada pasada del cron; el suelo es la aproximación barata, deliberadamente baja. Solo cargos: que te paguen dos
> veces no es este aviso. Se mira solo la ventana de 21 días más reciente — escanear todo el
> histórico volcaría cada coincidencia antigua en la campana en la primera ejecución.

---

## 1. Revisión de lo existente

| Área | Estado | Archivos / notas clave |
|---|---|---|
| Conexión bancaria (PSD2 / Enable Banking) | ✅ Estable | `lib/banking/*`, `app/(app)/accounts/`, `app/api/banking/*` |
| Sync de transacciones (cron diario + colas) | ✅ Estable | `app/api/cron/sync`, `app/api/queues/sync-connection`, `lib/queue.ts` |
| Transacciones (solo lectura, vienen del banco) | ✅ Estable | `app/(app)/transactions/`, `lib/transactions/transaction-dto.ts` |
| Categorización manual | ✅ Estable | `app/(app)/categorize/`, `lib/categorize.ts` |
| Motor de reglas (auto-categorización) | ✅ Estable (v2) | Árbol AND/OR, campos `any`/importe/dirección, `word`/regex, normalización de acentos, dry run, undo y auto-run en el sync: `app/(app)/rules/`, `lib/rules/*` |
| Categorías (usuario + sistema, jerárquicas) | ✅ Estable | `components/settings/category-manager.tsx`, `app/(app)/settings/actions.ts` |
| Cuentas y balances | ✅ Estable | `app/(app)/accounts/`, modelos `BankAccount` / `AccountBalance` |
| Ajustes / preferencias (zona, moneda, locale) | ✅ Estable | `app/(app)/settings/`, `lib/user-prefs.ts` |
| **Dashboard** | ✅ Estable | KPIs reales (patrimonio, ingresos/gastos del mes, por categorizar) + gráfica 6 meses + top categorías: `app/(app)/dashboard/page.tsx`, `lib/analytics/trends.ts`, `components/reports/` |
| **Presupuestos** | ✅ Estable | Presupuesto mensual por categoría vs gasto real: `app/(app)/budget/`, `lib/budget/`, `lib/analytics/spending.ts`, `components/budget/` |
| **Reports** | ✅ Estable | Tendencia 12 meses (ingresos vs gastos), donut por categoría y top comercios con **Recharts**: `app/(app)/reports/page.tsx`, `components/reports/` |
| Gastos recurrentes / suscripciones | ✅ Estable | Detección automática desde el histórico + confirmar/ignorar (confirmar añade la serie al Plan), contador de pendientes en el sidebar: `app/(app)/recurring/`, `lib/recurring/`, `components/recurring/`, modelo `RecurringSeries` |
| Previsión (forecast) | ✅ Estable | Proyección de saldo/gasto + alerta de saldo bajo: `app/(app)/forecast/`, `lib/analytics/forecast.ts`, `components/reports/balance-forecast-chart.tsx` |
| Notificaciones | ✅ Estable (in-app) | Centro in-app: campana en el header + generación idempotente por cron: `lib/notifications/`, `components/notifications/`, `app/(app)/notifications/`, modelo `Notification`. Avisa de presupuesto, cargos recurrentes próximos, saldo bajo proyectado, salud del sync y **posibles cargos duplicados** (`lib/transactions/duplicates.ts`). Push/email pendientes |
| Recomendaciones con IA | ✅ Estable (apagada) | Wrapper agnóstico de proveedor + página de insights: `lib/ai/`, `app/(app)/insights/`, `components/insights/`. Envía solo agregados anonimizados. Claude por defecto (`AI_PROVIDER`). **`ANTHROPIC_API_KEY` no está puesta en ningún entorno de Vercel**, así que en producción `/insights` no da recomendaciones: muestra el estado "no configurado" (`app/(app)/insights/actions.ts` → `status: "not_configured"`). Encenderla es solo poner la variable; el código no necesita cambios |

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
  resumen de coste mensual. Confirmar una serie la añade al Plan automáticamente
  (`PlanItem.recurringMerchantKey`, enlace 1:1; ignorar/deshacer la retira). Falta (fases
  futuras): asignar categoría a una serie desde la UI —hoy un gasto sin categoría no se
  planifica— y persistir snapshots de forma proactiva en el sync.
- [x] **Fase 3 — Centro de notificaciones in-app** ✅ — modelo `Notification`, campana en
  el header con badge de no leídas, generadores puros (presupuesto excedido/cercano y
  cargo recurrente próximo) idempotentes por `(userId, dedupeKey)`, ejecutados en el cron
  diario y por un botón "Check now". Falta (fases futuras): push (PWA) y email.
- [x] **Fase 4 — Reports + Dashboard con datos reales** ✅ — `recharts` instalado;
  `lib/analytics/trends.ts` (meses, ingresos vs gastos, top categorías) con tests;
  charts theme-aware en `components/reports/` (barras ingresos/gastos, donut por
  categoría) usando tokens `--chart-*`; Dashboard con KPIs reales y Reports con
  tendencia + donut + top comercios.
- [x] **Fase 5 — Forecast** ✅ — `lib/analytics/forecast.ts` (medias, proyección de saldo,
  gasto fin de mes) con tests; página `/forecast` con KPIs, curva de saldo proyectado y
  próximos cargos recurrentes; y alerta `LOW_BALANCE_PROJECTED` en el centro de
  notificaciones cuando la proyección cae por debajo de 0.
- [x] **Fase 6 — Recomendaciones con IA** ✅ — wrapper agnóstico `lib/ai/` (interfaz +
  factory por `AI_PROVIDER`, proveedor Claude con `@anthropic-ai/sdk`), resumen financiero
  **anonimizado** puro (con tests) + parser zod, y página `/insights` con generación bajo
  demanda y estado "no configurado" si falta la API key. Envs: `AI_PROVIDER`,
  `ANTHROPIC_API_KEY`, `AI_MODEL`.

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
