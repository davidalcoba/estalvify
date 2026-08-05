# Roadmap de producto — Estalvify

> **Propósito de este fichero.** Es la fuente de verdad única para evolucionar
> Estalvify hacia una app de finanzas personales completa: prever gasto futuro,
> programar gastos recurrentes, hacer presupuestos, tener reports, notificaciones y
> recomendaciones con IA. Está pensado para ejecutarse **en varias sesiones**, de
> forma incremental. Cada sesión toma la **siguiente fase pendiente**, la implementa
> como un PR independiente siguiendo `PLAYBOOK_NEW_FEATURE.md`, y **marca la fase como
> hecha aquí** en el mismo cambio.

**Última actualización:** 2026-08-04 · **Fase en curso:** ninguna ·
**Estado:** 🎉 roadmap completo (Fases 1–6 hechas) · **Siguiente:** mantenimiento y mejoras
(push/email para notificaciones, persistencia/caché de insights de IA, asignar categoría a
recurrentes, etc.).

> **Post-roadmap — MODELO DE PLANIFICACIÓN V3 (spec definitivo, 2026-08-04).** Sustituye
> a los dos specs anteriores (el batch de 8 features y el modelo v2 del mismo día).
> Cuatro principios y sus consecuencias:
>
> - **Las cuentas no llevan semántica** (§1.1): no hay cuenta de ahorro, ni envelopes, ni
>   pools — `stock_envelopes`, `User.savingsGoal*`, `User.savingsAccountId` y
>   `User.baseMonthlyIncome` están **eliminados** del esquema. La planificación es siempre
>   consolidada; la única pantalla donde las cuentas importan es la previsión de caja
>   (`lib/analytics/cashflow-data.ts`, por cuenta, mensajes operativos sin juicios).
> - **El ahorro es DERIVADO** (§1.2): ahorro del mes = variación del saldo consolidado.
>   No es una línea, ni una categoría, ni un traspaso. Se muestra en el bloque de
>   **reconciliación** de /plan junto al check flujos-vs-saldo (`reconciliationGap`:
>   una discrepancia = flujo sin capturar).
> - **El objetivo mensual es el RESULTADO ESPERADO** (§1.3, `lib/budget/cascade.ts`):
>   ingresos previstos (planned CREDIT) − cargos previstos (planned DEBIT) − cuotas
>   rollover − presupuesto variable = **resultado esperado**. La cascada usa SIEMPRE
>   importes previstos — la realidad aterriza en `performance` (real − esperado), nunca
>   moviendo la portería. Para ahorrar más se baja el presupuesto variable.
> - **Devengo y caja no se mezclan** (§1.4, `lib/planned/matching.ts`): una transacción
>   emparejada computa en el `year/month` de su planned item (tolerancia ±5/−7 días
>   cruzando el borde de mes, emparejamiento FIFO, MISSED al cerrar la tolerancia, mes
>   **provisional** hasta el día 7); el gasto variable computa por fecha, sin devengo.
>   La proyección de saldo usa la fecha real. `buildMonthStatus` excluye TRANSFER.
> - **Objetivos por categoría** (/plan, `ObjectivesCard`): los budget items no-rollover
>   son el presupuesto variable, con **% consumido siempre junto a % de mes transcurrido**
>   (ritmo). Los rollover tienen **polaridad invertida** (acumular es bueno — misma
>   widget, significado opuesto, distinguidos visualmente) y su saldo se deriva
>   (`rolloverBalance`). Toda asignación se propaga sola al mes siguiente
>   (`ensureBudgetPropagation`); borrar la fila del mes la retira. La vista es
>   **navegable por mes** (`/plan?y=&m=`): un mes pasado se lee cerrado (ritmo
>   100%, saldo consolidado al cierre de ese mes), uno futuro llega ya asignado
>   por propagación — nunca se materializan filas en meses pasados.
> - Se mantienen de v2: **series manuales** (CRUD en /recurring),
>   **planned_items como fuente de verdad** (motor a 4 meses, `lib/planned/engine.ts`),
>   **disponible SEMANAL** con contador de operaciones vs mediana de 12 semanas, y la
>   previsión de caja alimentada por planned items (cargos al inicio de su ventana,
>   ingresos al final). Ajustes queda reducido a `lowBalanceThreshold`.
> - **v3.1 — recurring como automatización del monthly.** Una serie es la base
>   recurrente del objetivo de su categoría: `categoryId` obligatorio, **sin campo
>   cuenta** en el formulario (la columna sigue; la previsión usa fallback). Cada
>   objetivo del control mensual = **base** (planned DEBIT del mes, subárbol de
>   categorías vía `nearestInSet`) + **extra manual** (`budget_items`); un cargo
>   planificado sin budget item aflora como objetivo base-only en su categoría
>   raíz. `consumed` acumula TODAS las transacciones EXPENSE del mes del subárbol
>   (fila expandible: recurrings + transacciones). La **detección vuelve solo como
>   propuestas** (`lib/recurring/detect.ts`, puro): cadencia casi regular +
>   importe casi estable (±30%, las facturas varían) ⇒ sugerencia editable en
>   /recurring con contador; aceptar precarga el formulario, descartar persiste
>   en `dismissed_recurring_suggestions`. El matching queda como mecánica interna
>   (avisos MISSED/desviación, reconciliación y fechas de la previsión). **Borrar
>   una serie retira hacia delante**: sus PENDING desaparecen y sus
>   MATCHED/MISSED se desvinculan (`recurringSeriesId = null`) — los meses
>   cerrados nunca se reescriben.
> - **v3.2 — matching endurecido (informe test_rule 2026-08-05).** Un match por
>   descriptor exige además importe en la misma liga (`MAX_MATCH_DEVIATION`
>   ±75% — el alquiler no matchea un taxi de 19 €) y entre candidatos gana la
>   menor desviación (separa los dos seguros "BBVA PLAN ESTARSEGURO" por
>   importe), luego FIFO. Una serie puede **enlazar una regla**
>   (`recurring_series.ruleId`): el árbol de condiciones de la regla decide el
>   reconocimiento y la categoría SE FUERZA a la de la regla — plan y realidad
>   no pueden divergir. Guardar un matcher lo audita contra 12 meses de
>   histórico y se bloquea si **no casa nada** (0 hits ⇒ la serie solo hace
>   MISSED pero se ve "sana", el caso que escondía los typos) o si toca >2
>   categorías raíz. Y `normalizeDescriptor` pliega TODA la puntuación a espacios
>   (el asterisco de pasarela "UBER *ONE", el punto donde el nombre lleva
>   apóstrofo "d.Investigacio", los guiones de referencia SEPA) en el descriptor
>   Y en el matcher, para que un matcher escrito desde el nombre comercial case
>   el texto crudo del banco. `refreshSeriesSchedule`
>   recalcula el horario DESDE LA REALIDAD en cada sync: `nextExpectedDate` = el
>   inicio de ventana del primer PENDING (para MONTHLY se deriva de
>   windowFromDay/anchorMonthEnd, sin anchorDate), y `lastSeenAt` = la fecha de
>   la transacción más reciente que la serie reconoce (árbol de la regla o
>   matcher sobre el descriptor) — no un match de planned item, así que un cargo
>   anterior al horizonte (la hipoteca) cuenta igual, y una serie que no
>   reconoce nada vuelve a null. MCP: `update_planned_item` nuevo; `ruleId` en
>   create/update_recurring_series; descripción de get_budgets corregida.
>   Además, un `ReferenceError` en producción (un `export type` en un módulo
>   `"use server"` que Turbopack dejaba como referencia en runtime) tumbaba TODAS
>   las server actions de /recurring — corregido, con un smoke test de contrato
>   MCP↔handler (`lib/mcp/tools.smoke.test.ts`, una lectura por familia + el
>   split read/write). Datos de producción alineados: matcher del alquiler
>   `ALQUILER`→`COMERCIO EDIFICACION` (dejaba de casar taxis), O2→Suministros
>   Barcelona, Ring enlazado a su regla → Suministros Palafrugell.
> - **Deuda v3.2 — seguros gemelos vs. matcher único.** El guard de importe se
>   diseñó para que dos series compartan descriptor y se separen por importe,
>   pero `@@unique(userId, merchantKey)` impide que compartan el `merchantKey`.
>   Los dos "BBVA PLAN ESTARSEGURO" (hogar 59,49 / vida 10,97, descriptor
>   idéntico sin "hogar"/"vida") no pueden llevar el mismo matcher; hoy casan
>   por categoría+importe, que basta. El cierre correcto es enlazar cada uno a
>   una regla con condición de importe (como Ring), no forzar el matcher.
> - **v3.3 — atribución y horizonte.** Al actualizar una serie, la categoría se
>   propaga también a los planned MATCHED del **mes en curso** y siguientes (no
>   solo a los PENDING), para que un recategorizado (O2 → Suministros) no deje
>   el cargo del mes bajo la categoría vieja; los meses cerrados NUNCA se
>   reescriben. Añadida categoría **Impuestos** (el IBI de 600 € estaba en
>   Suministros Palafrugell, inflándola). **La planificación empieza en agosto
>   2026** (fecha de siembra): no hay planned items en meses anteriores, así que
>   no hay performance ni MISSED antes de esa fecha — es esperado, no un fallo.
> - **Deuda v3.3 — varios cargos por periodo (matching agregado).** El modelo
>   asume 1 cargo por planned item, pero algunas categorías reciben varios: AFA
>   Teixidores (3×20 € el mismo día = 60), Escola Gràcia (6 adeudos en julio que
>   suman ~259). Hoy la serie casa uno y deja el resto fuera del plan, así que el
>   bloque de Educación (~320 €/mes) queda mal. Pendiente: que un planned item
>   agregue TODOS los cargos que reconoce dentro de la ventana (`matchedAmount` =
>   suma) hasta cerrar el esperado, en vez de exigir un único cargo.
> - **Deuda v3.3 — `merchant` limpio en ingesta.** `normalizeDescriptor` ya
>   pliega el ruido para el matching; falta extraer un campo `merchant` estable
>   en la ingesta (sin "PAGO CON TARJETA", asteriscos de pasarela, sufijos de
>   ciudad/país) para limpiar además la lista de *Detected* y la detección.

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
| **Reports** | ✅ Estable | Tendencia (ingresos vs gastos), donut por categoría y top comercios con **Recharts**, filtrados por mes / ventana de tendencia (6-12-24) / cuenta desde la URL: `app/(app)/reports/page.tsx`, `lib/analytics/report-filters.ts`, `components/reports/` |
| Gastos recurrentes / suscripciones | ✅ Estable | Detección automática desde el histórico + confirmar/ignorar (confirmar añade la serie al Plan), contador de pendientes en el sidebar: `app/(app)/recurring/`, `lib/recurring/`, `components/recurring/`, modelo `RecurringSeries` |
| Previsión (forecast) | ✅ Estable | Proyección de saldo/gasto + alerta de saldo bajo: `app/(app)/forecast/`, `lib/analytics/forecast.ts`, `components/reports/balance-forecast-chart.tsx` |
| Notificaciones | ✅ Estable (in-app) | Centro in-app: campana en el header + generación idempotente por cron: `lib/notifications/`, `components/notifications/`, `app/(app)/notifications/`, modelo `Notification`. Push/email pendientes |
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
