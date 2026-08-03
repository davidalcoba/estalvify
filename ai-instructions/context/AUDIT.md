# Codebase Audit — Diseño, arquitectura, coherencia y seguridad

**Fecha del snapshot:** 2026-08-03 · **Commit base:** rama `claude/codebase-architecture-security-qaevxy`

> Auditoría de solo lectura. Es un **mapa priorizado** de mejoras, no un plan de
> "hacerlo todo". Los buckets separan lo que conviene arreglar ya (aunque la app sea
> mono-usuario) de lo que es **requisito para abrir la app a internet / multi-usuario**,
> de la calidad continua. Los hallazgos críticos se verificaron leyendo el código
> (`proxy.ts`, `api/queues/sync-connection/route.ts`, `api/cron/sync/route.ts`,
> `accounts/setup/actions.ts`, `rule-matcher.ts`, `next.config.ts`).

## Estado de implementación (rama `claude/codebase-architecture-security-qaevxy`)

**Resuelto en esta rama** (gate verde: typecheck, lint, tests):
A1, A2, A3, A4, A6, A7 · B1, B2, B7, B8.

**Pendiente / deliberadamente diferido** (decisiones de producto o infra, no aptos
para hacer sin revisión): B3 (modelo de alta multi-usuario), B4 (rate limiting — elige
infra), B5 (consent screen + enforcement de scopes OAuth), B6 (trustHost/AUTH_URL +
separar `MCP_JWT_SECRET`), C5 (rediseño de la cola), C6 (harness de tests con BD), D6
(estrategia i18n). El resto de C/D son quick-wins oportunistas.

## Contexto

Estalvify es una app de finanzas personales (Next.js 16 App Router, Auth.js v5 con
Google, Prisma 7 + Neon, integración PSD2 con Enable Banking, un servidor MCP con
OAuth 2.1, y Vercel Cron + Queues). Hoy es **de un solo usuario** (el dueño, cerrado con
`ALLOWED_EMAILS`), pero el objetivo declarado es no descartar **abrirla a internet /
instalable por cualquiera (multi-usuario)** en el futuro. Esta auditoría se escribió con
ese posible futuro como criterio de priorización.

## Qué está bien y hay que preservar

Para no romperlo al mejorar:

- **Aislamiento por `userId`** consistente en casi todo `lib/**` y `actions.ts`; los ids
  provistos por el cliente se re-resuelven siempre contra la sesión.
- **Criptografía OAuth 2.1 correcta**: PKCE S256, códigos de un solo uso atómicos, solo
  se guardan hashes SHA-256, comparaciones en tiempo constante.
- `lib/auth/allowed-emails.ts` **falla-cerrado** y está bien testeado.
- **Separación puro/impuro** en `lib/rules/` (matcher/plan/order puros y testeados;
  `apply.ts` hace I/O) — es el modelo a replicar.
- **Escrituras idempotentes por construcción**: `skipDuplicates` en transacciones,
  upserts sobre únicos compuestos en balances, `(userId, dedupeKey)` en notificaciones.
- `ai-instructions/context/` es documentación de arquitectura de calidad real (decisiones
  escritas con el fallo que las motivó).
- Todas las rutas tienen `loading.tsx`; cero colores hardcodeados (todo por tokens); cero
  `NEXT_PUBLIC_*`; cero `dangerouslySetInnerHTML`; cero `any`/`TODO`/`FIXME`.

---

## Bucket A — Arreglar ya (afecta incluso siendo un solo usuario)

Bugs de corrección y fugas que muerden hoy, sin depender de abrir la app.

### A1. Verificación de `CRON_SECRET` con fallback peligroso
`app/api/cron/sync/route.ts:18` compara `authHeader !== "Bearer " + process.env.CRON_SECRET`.
Si `CRON_SECRET` no está definido, el literal `Bearer undefined` autentica. Comparación
además no es de tiempo constante.
- **Fix**: si `CRON_SECRET` no está seteado, devolver 500 (no dejar el endpoint abierto);
  comparar en tiempo constante. Mismo patrón para cualquier endpoint con secreto compartido.

### A2. ReDoS y recursión sin límite en el motor de reglas
El operador `matches` compila patrones de usuario con `new RegExp(source, "i")`
(`lib/rules/rule-matcher.ts:67-74`) y los corre en memoria sobre **todas** las
transacciones del usuario. El único guard es un tope de 200 caracteres (`rule-dto.ts`),
que no protege de backtracking catastrófico (`(a+)+$` son 6 chars). Node no tiene timeout
de regex → cuelga la invocación serverless. Alcanzable desde la UI (`saveRule`) y desde
MCP (`test_rule`, `create_rule`; `isValidRegex` solo prueba que compila). Además
`matchesNode` (`rule-matcher.ts:185-195`) recursiona por nivel de `children` sin tope de
profundidad → un árbol muy anidado hace stack-overflow en cada corrida.
- **Fix**: validar profundidad máxima del árbol de condiciones y limitar/desactivar regex
  de usuario (o correr con presupuesto de tiempo / pre-validar contra backtracking).
  Compartir la validación entre la vía UI y la vía MCP.

### A3. PII (IBANs, nombres de contraparte) en logs
`lib/banking/sync.ts:138` hace `console.warn(… JSON.stringify(tx))` que vuelca la
transacción completa de Enable Banking — IBANs completos de contraparte, nombres — justo
los campos que el esquema trunca a propósito. También `app/api/banking/callback/route.ts:58-61`
loguea uid/nombre/producto/IBAN de cada cuenta. Va contra `CODING_RULES.md`. Persiste en
la retención de logs de Vercel.
- **Fix**: eliminar/enmascarar los volcados; introducir un logger con niveles y una regla
  de "nunca datos bancarios crudos".

### A4. `bulkCategorize` sin tope (la vía UI diverge de la MCP)
`app/(app)/categorize/actions.ts:94-140` hace `findMany` sin `take` y un `$transaction`
con un `upsert` por fila. Su gemelo MCP **sí** tope a 1000 (`lib/mcp/categorize.ts`). Un
lote grande puede reventar la transacción/timeout.
- **Fix**: aplicar el mismo `BULK_CATEGORIZE_CAP` en ambas vías (idealmente extrayendo una
  sola función a `lib/`).

### A5. Falta de límites de recurso en consultas calientes
65 de 68 `findMany` no tienen `take`. Las que muerden: cargas de 6/13 meses de
transacciones en **cada render** de dashboard/forecast/reports/plan/recurring/insights, y
el motor de reglas cargando la tabla entera en memoria por cuenta por sync y por pulsación
en el preview de reglas (`lib/rules/apply.ts:141-150, 337-341`).
- **Fix (incremental)**: acotar las cargas de preview (mover el límite a la query en vez de
  `.slice` tras cargar todo) y auditar los `findMany` de páginas.

### A6. Índices que faltan en tablas calientes
`CategoryRule` **no tiene ningún índice** (se consulta por `userId`/`priority` en muchos
sitios). `TransactionCategorization` solo tiene `transactionId @unique` pese a consultarse
por `categoryRuleId`, `categoryId`, `groupBy(categoryId)`. `Category`, `BankConnection`,
`BankAccount` tampoco tienen índices por `userId`/estado.
- **Fix**: `@@index([userId, priority])` a `CategoryRule`; índices sobre `categoryRuleId` y
  `categoryId` a `TransactionCategorization`; `@@index([userId])` a
  `Category`/`BankConnection`/`BankAccount`. Una sola migración.

### A7. Sin error boundaries y errores silenciados en el cliente
Cero `error.tsx` / `global-error.tsx` / `not-found.tsx` en todo `app/`. Muchos componentes
cliente hacen `catch { /* no-op */ }` (recurring, plan, notifications, insights, sync-now,
y 3 acciones destructivas sin manejo de error). No hay primitiva de toast/alert en
`components/ui/`.
- **Fix**: añadir `error.tsx` (al menos a nivel `(app)`) y `not-found.tsx`; una primitiva
  de feedback (toast) para mutaciones; que las acciones destructivas muestren el error.

---

## Bucket B — Requisito antes de abrir a internet / multi-usuario

Contenido hoy porque hay un solo usuario de confianza, pero explotable en cuanto entra un
segundo usuario o tráfico anónimo. **Esta es la lista de gating para "abrir la app".**

### B1. El consumidor de la cola confía en el `userId`/ids del mensaje  ⚠️ el más grave
`app/api/queues/sync-connection/route.ts:26,64-76,93` desestructura `userId`, `accountId`,
`connectionId` directo del mensaje, sin zod y **sin filtrar por `userId`**: busca la cuenta
solo por `{id, isActive}` y la conexión solo por `{id}`, y luego escribe transacciones con
el `userId` del mensaje y corre las reglas de ese `userId`. `proxy.ts` **no** lista
`/api/queues` como público, así que un request anónimo va a `/login` — pero **cualquier
usuario autenticado** puede alcanzar el consumidor con un cuerpo forjado y
escribir/corromper datos de otro usuario. La única otra barrera es lo que verifique
`@vercel/queue@0.1.3` `handleCallback` (no auditable aquí; `node_modules` ausente).
- **Fix**: no confiar en el `userId` del mensaje — rederivar desde la conexión/cuenta, o
  verificar que `accountId`/`connectionId` pertenecen al `userId`. Validar el payload con
  zod. Confirmar si la invocación de Vercel Queues atraviesa `proxy.ts`.

### B2. Secuestro cross-user de `BankAccount` por `externalAccountId` global
`prisma/schema.prisma:145` — `BankAccount.externalAccountId` es **único global** (entre
todos los usuarios). `accounts/setup/actions.ts:54-70` hace `upsert` con
`where: {externalAccountId}` sin `userId`, y la rama `update` reasigna `bankConnectionId`
de una fila que puede pertenecer a **otro usuario** (deja `userId` intacto, así que las
lecturas siguen scoped, pero la cuenta de la víctima se desengancha de su conexión y se
resincroniza bajo el fan-out del atacante). Alcanzable si dos cuentas comparten un uid de
Enable Banking (cuentas conjuntas, reuso de uid).
- **Fix**: `externalAccountId` único **por usuario** (`@@unique([userId, externalAccountId])`)
  y filtrar el upsert por `userId`.

### B3. Modelo de acceso: allowlist global → alta por usuario
Hoy el control es un env `ALLOWED_EMAILS` (un solo dueño). Instalable por cualquiera exige
un modelo de signup/tenant por cuenta. Además:
- `ALLOWED_EMAILS` se aplica **solo en el sign-in** — quitar un email no invalida sesiones
  vivas (30 días) ni tokens MCP (access 1 h, refresh 30 días).
- Un solo client OAuth confidencial estático para todo el deployment; DCR abierta cuando
  `MCP_OAUTH_CLIENT_ID` no está seteado (los self-hosters que siguen los docs heredan
  escritura anónima de filas en `/api/oauth/register`).

### B4. Sin rate limiting en ningún sitio
Nada limita login, `/api/oauth/{register,token}`, `/api/mcp`, `/api/cron/sync`,
`/api/banking/*`, ni ninguna server action — y `proxy.ts` hace una **consulta de sesión a
la BD en cada request**. En una instancia compartida esto es DoS y fuerza-bruta.
- **Fix**: rate limiting (p.ej. Vercel/Upstash) en los endpoints anónimos y en el login.

### B5. OAuth/MCP: sin pantalla de consentimiento y sin enforcement de scopes
`app/api/oauth/authorize/route.ts:80-96` auto-aprueba sin consent screen; los scopes se
parsean pero **nunca se enforçan** (`app/api/mcp/route.ts:27`). Cada token es
lectura/escritura total sobre datos financieros y puede disparar syncs bancarios.
- **Fix (multi-usuario)**: consent screen + enforcement de scopes + revocación
  (`/api/oauth/revoke`; `McpRefreshToken.revokedAt` hoy se lee pero nunca se escribe;
  rotación de refresh tokens) + limpieza de códigos/tokens expirados.

### B6. Redirecciones derivadas del Host header + secretos acoplados
`app/api/banking/callback/route.ts:23` y `login/page.tsx:59-62` construyen redirects desde
`X-Forwarded-Host`/origin. En Vercel el host está normalizado; detrás de un proxy
self-hosted permisivo es un primitivo de redirect-to-attacker. No hay `trustHost`/`AUTH_URL`
fijado. Además `lib/mcp/oauth.ts:20` usa `AUTH_SECRET` como fallback del secreto de firma
MCP (acopla dominios de confianza, impide rotación independiente; sin validación de `iss`
los tokens son fungibles entre deployments que compartan el secreto — p.ej. preview y prod).
- **Fix (self-hosting)**: fijar `AUTH_URL`/`trustHost`, validar Host contra allowlist,
  separar `MCP_JWT_SECRET` de `AUTH_SECRET`, añadir claim/validación de `iss`.

### B7. Cabeceras de seguridad web incompletas
`next.config.ts:8-28` tiene `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
pero **no CSP, ni HSTS, ni Permissions-Policy**. `lib/mcp/http.ts` pone
`Access-Control-Allow-Origin: *` (correcto para endpoints bearer/PKCE, pero hace la DCR
scriptable desde cualquier página si está abierta).
- **Fix**: añadir CSP, HSTS y Permissions-Policy.

### B8. Cuerpos de error de terceros propagados a URLs/UI
El `message` crudo de Enable Banking termina en la query del redirect
(`callback/route.ts:184-186`), en la respuesta al cliente (`connect/route.ts:96-100`) y en
`BankAccount.lastSyncError`, y se renderiza en `accounts/page.tsx`. React escapa (no XSS),
pero filtra internos a URLs/historial/referrers.
- **Fix**: mapear a mensajes propios, no propagar cuerpos crudos.

---

## Bucket C — Arquitectura, diseño y datos (calidad continua)

Deuda que no es urgente pero encarece cada cambio y ya ha causado *drift* real entre la
vía UI y la vía MCP.

### C1. Duplicación entre server actions y MCP (ya han divergido)
- La comprobación de propiedad de categoría está copiada **7 veces** (mismas 6 líneas).
- `bulkCategorize`, create/update rule, y create/update/**delete** category tienen dos
  implementaciones que **ya divergen**: `settings/actions.ts` `createCategory` ignora `kind`
  (siempre EXPENSE) y no valida ciclos/profundidad; su `deleteCategory` no desactiva reglas
  que apuntan a la categoría ni maneja transacciones huérfanas — todo lo cual
  `deleteCategoryForUser` (MCP) **sí** hace.
- El bloque analítico "net worth + tendencia 6 meses + mapeo Decimal→number + proyección"
  aparece **4 veces casi idéntico** (dashboard, forecast, insights/actions, notifications).
- **Fix**: extraer a `lib/`: `requireUserId`, `assertCategoryOwnership`, una única
  `deleteCategory`/`createCategory`/`bulkCategorize`/`saveRule` compartida por UI y MCP, y
  un módulo de analítica reutilizable. `lib/rules/apply.ts` ya es el modelo correcto (una
  sola vía de ejecución para runs de reglas): replicarlo.

### C2. Fugas de capa (lógica de dominio en páginas, escrituras en render)
- Tres páginas **escriben durante el render**: `accounts/page.tsx:71-83` (recovery de
  SYNCING + `expireStaleConsents`, con un `eslint-disable react-hooks/purity`),
  `settings/page.tsx:33-46` (`seedDefaultCategories` a mitad de render + re-consulta).
- Lógica de dominio pura viviendo en páginas: `forecast/page.tsx:174-219`
  (`nextMonthlyOccurrence`), `accounts/page.tsx:107-152` (agrupación de bancos).
- Lógica de negocio en `actions.ts` en vez de `lib/`: `insights/actions.ts` (185 líneas),
  `settings/actions.ts` (datos semilla + loop), `recurring/actions.ts` (mirror serie↔plan).
- **Fix**: mover a `lib/` (testeable); sacar las escrituras del render a acciones/cron.

### C3. Falta DTO de categoría — se pasan filas Prisma crudas al cliente
No hay `category-dto`. Se pasan `Category` crudas (con `Date` `createdAt`/`updatedAt`,
`isSystem`, etc.) a componentes `"use client"` (rules, transactions, categorize, settings).
Contradice `CODING_RULES.md`/`ARCHITECTURE.md`. TS lo acepta estructuralmente por las
interfaces estrechas, pero cruza el modelo completo. (`plan/page.tsx:48-52` lo hace bien
con un `select` explícito — es la referencia.)
- **Fix**: `lib/categories/category-dto.ts` + un `getCategoryOptions(userId)` con `select`
  explícito, usado en las 4 vías.

### C4. `lib/mcp/tools.ts` es un god-file (817 líneas)
Un solo `registerTools()` con 17 registros, ~350 líneas de descripciones y consultas Prisma
inline para 5 tools (los otros 12 delegan a `manage.ts`). Layering a medias.
- **Fix**: separar registros; mover las 5 queries inline a `lib/`.

### C5. Diseño de la cola: detección de fin heurística, sin dedupe
La conexión pasa a ACTIVE por un **conteo heurístico** de cuentas "hechas" (por
`lastSyncAt`/`lastSyncError`/balance de hoy), no por un contador real → re-runs pueden
re-flipear, un cambio de cuentas a mitad rompe la aritmética, un `lastSyncError` viejo
cuenta como "hecho". No hay dedupe al encolar (N clicks = N fan-outs; cron + manual + MCP
concurrentes). El estado del job es un solo enum en la conexión; la UI reconstruye "error
de sync" por substring de `lastSyncError`. La clasificación de error está duplicada:
`lib/banking/sync-errors.ts` (puro, testeado) vs inline `msg.includes("401")…` en el
consumidor.
- **Fix (mayor)**: una tabla de run/job con estado real por cuenta, dedupe al encolar, y
  clasificación de error tipada en vez de substring.

### C6. Tests: cero cobertura donde hay BD/red/dinero
22 tests, todos de `lib/` puro. **Sin tests**: el motor de sync (`lib/banking/sync.ts`), el
consumidor de la cola, el cron, la mitad que escribe de `lib/rules/apply.ts`, **todas** las
server actions (incluidos los checks de autorización), **todas** las rutas API (incluidos
OAuth authorize/token/register y el callback bancario), `lib/mcp/manage.ts` y `tools.ts`.
En una app que mueve datos de dinero.
- **Fix**: harness de test con Prisma (mock o BD efímera); priorizar tests de los checks de
  propiedad en actions, el consumidor de la cola (B1), y el path de escritura de reglas.

### C7. Config de entorno dispersa, sin validación al arranque
14 env vars leídas en ~22 sitios `process.env.*`, sin módulo central ni validación al boot
(una mala config revienta en runtime dentro de un request). Cadenas de fallback implícitas
en los call sites (`MCP_JWT_SECRET ?? AUTH_SECRET`, etc.). `.env.example` en cambio está
completo y bien anotado.
- **Fix**: un `lib/env.ts` con esquema zod validado al arranque; centralizar los fallbacks.

### C8. Datos: observaciones de esquema
- `SyncLog` es **código muerto** (cero lecturas/escrituras; `userId` sin relación/FK).
- `Category.parent` y las FKs de `TransactionCategorization`/`BudgetItem`/`PlanItem`/
  `RecurringSeries` no tienen `onDelete` → `Restrict` por defecto; el app depende de soft
  delete (`isActive`) en todas partes (coherente, pero implica que un hard delete es
  imposible).
- Manejo de `Decimal` inconsistente: `Number(x.toString())` en unos sitios, `Number(x)` en
  otros (`apply.ts:114,129`, `tools.ts:280,355`); no hay un `toNumber` compartido.
- `AccountBalance` usa `today.setHours(0,0,0,0)` (hora local del server) como componente de
  su clave, no UTC ni la zona del usuario (`lib/banking/sync.ts:36-37`).

---

## Bucket D — Coherencia de código y UI (bajo riesgo, alto ROI)

El codebase es **inusualmente disciplinado** (cero colores hardcodeados, 100% de
`ariaLabel` en los 28 selects, cero `any`/`TODO`, todas las rutas con `loading.tsx`). La
deriva está concentrada en copy-paste entre vistas desktop/mobile y en primitivas
compartidas que faltan. Todos son cambios contenidos.

### D1. Formateo de fecha ad-hoc (7 sitios, 4 copias byte-idénticas)
Contra `CODING_RULES` "renderiza fechas vía `lib/formatters`". 6 helpers locales
(`fmtDate`/`formatLongDate`/…) en `transactions-*` y `categorize-*` views, más 2
`Intl.DateTimeFormat` inline en `forecast/page.tsx`. El propio código ya sabe la respuesta
(`transactions-mobile-view.tsx:51-59` sí usa `formatDate`). Además el parámetro se llama
`locale` pero recibe `language`/`dateLocale` — el nombre miente. (El dinero **sí** va
siempre por `formatCurrency` — eso está bien.)
- **Fix**: `formatShortDate`/`formatLongDate`/`formatSectionDate` en `lib/formatters`;
  borrar los 6 helpers.

### D2. Primitivas que faltan (cada una la reimplementan 3-6 sitios)
- **No hay `Alert`/`Callout`**: 6+ callouts a mano con alpha inconsistente
  (`bg-destructive/10` vs `/5`); `badge.tsx` ya declara un `destructive-soft` sin uso.
- **No hay `StatCard`/`Kpi`**: `Kpi` es **byte-idéntico** en `dashboard/page.tsx` y
  `forecast/page.tsx`, y `plan-view.tsx` tiene una 3ª copia.
- **No hay `CategoryDot`**: 6 `<span style={{backgroundColor}}>` inline.
- `ConfirmDialog` está scoped a `rules/`; `disconnect-bank-button` y `delete-account-button`
  son **~85% idénticos** y no lo reusan.
- `EmptyState` existe y se usa en 26 sitios, pero **7 lo reimplementan** a mano.
- **Fix**: crear `components/ui/{alert,stat-card,category-dot}.tsx`, promover
  `confirm-dialog`, y una variante inline de `EmptyState`.

### D3. Controles crudos donde existe la primitiva
4 `<input type="checkbox">` crudos (existe `components/ui/checkbox`), 4 `<button>` y 1
`<input>` crudos en `components/accounts/*` (existen `Button`/`Input`). Inconsistencia
directa: `delete-account-button` usa `<button>` mientras su gemelo `disconnect-bank-button`
usa `<Button variant="ghost">`.

### D4. Deriva de skeletons (drift ya materializado)
`rules/loading.tsx:128` dibuja un subtítulo fantasma que la vista real no tiene (contra
UI_RULES "nunca dibujes una línea de subtítulo"); `settings/loading.tsx:32` omite un hint
que sí existe; `transactions`/`categorize` tienen **dos** skeletons por ruta (`loading.tsx`
con `Card`, el in-page con `div`) que ya divergieron.
- **Fix**: mover los skeletons de fila a `components/layout/skeletons.tsx` y que `page.tsx`
  los **importe** en vez de mantener copias. Cierra toda esta clase de drift.

### D5. Feedback de mutaciones: dos convenciones incompatibles y sin toasts
No hay librería de toast. Unos componentes hacen `setError` + `<span destructive>`; otros
hacen `catch {}` silencioso (plan/recurring/categorize/notifications/sync) — un delete
fallido es indistinguible de éxito. Como **todas** las server actions hacen `throw`, añadir
un toaster convierte el patrón silencioso en feedback real con un solo handler compartido.

### D6. i18n sin decidir (la mayor decisión latente de UI)
Todo el texto de UI está hardcodeado en inglés, pero los datos por defecto son español/EUR
(`es-ES`, `Europe/Madrid`) y `app/layout.tsx:48` fija `<html lang="en">` mientras las fechas
se renderizan en español → documento declarado inglés con contenido español.
- **Decisión (no código todavía)**: elegir estrategia i18n antes de abrir la app; hoy
  bloquea la corrección de `<html lang>` y cada string futuro.

### D7. Duplicación de helpers en actions (detalle de C1)
`requireUserId` definido 3× idéntico (+ 5 inline); el check de acceso a categoría 6× bajo 3
nombres distintos; `revalidateAfterCategorization` extraído en un sitio e inline en otros 3;
el shape de categoría de 4 campos declarado 3×; el color por defecto `"#6366f1"` hardcodeado
en 4 paths de runtime.

### D8. Código muerto y docs obsoletos
- `components/ui/navigation-menu.tsx` (168 líneas) y `components/ui/tabs.tsx` (91): **cero
  importadores**. `CHART_COLORS`, `Logo`, `transactionCounterparty` (siempre devuelve
  `null`), `transactionLabel`, `lib/mcp/oauth.ts:49-54` `verifyTokenHash`: exportados sin
  consumidores.
- `REPO_HEALTH.md` está **obsoleto**: afirma "cero tests / cero CI / falta dark mode", todo
  falso hoy (22 tests, CI activo, `next-themes`). `UI_RULES.md:53-56` dice que `Logo` se usa
  en el login; no es cierto (solo `LogoMark`).
- `public/sw.js:15` precachea `/offline` que **no existe** → el SW nunca activa.
- `proxy.ts:33` `startsWith("/icon")` también matchea `/iconoclast` (prefijo en vez de
  segmento) — revisar el allowlist de rutas públicas.
- **Fix**: borrar el código muerto; regenerar o marcar como snapshot fechado `REPO_HEALTH.md`.

### D9. Divergencias menores de coherencia
- `settings/page.tsx` re-declara los defaults en vez de usar `getUserPrefs`, y discrepa:
  `Europe/London` vs `Europe/Madrid` de `DEFAULTS`.
- `PAGE_TITLES` (`app-header.tsx`) **no tiene `/notifications`** → cae a "Estalvify"; el
  mismo nombre de ruta se escribe hasta 4× y no coinciden ("Accounts" vs "Bank Accounts").
- Doble título de página: `<h1>` de chrome + `<h2>` del título real → lectores de pantalla
  lo anuncian dos veces.
- `categorize-mobile-view` reimplementa la paginación con `<a href>` (navegación completa,
  pierde el routing cliente y el `NavProgressBar`) en vez de `TransactionPagination`.
- Filas clicables `<div onClick>` sin `role`/`tabIndex`/`onKeyDown` (`transaction-item.tsx:29`)
  — no operables por teclado.
- `app/layout.tsx:39` `maximumScale: 1` desactiva el pinch-zoom.

---

## Recomendación de secuencia

1. **Bucket A** primero (te ayuda ya, bajo riesgo): A1, A3, A6 son cambios pequeños y
   contenidos; A2 y A4 cierran vías de cuelgue; A7 mejora el día a día.
2. **Bucket B** como un hito explícito "**preparar para abrir**": B1 y B2 son los dos
   agujeros cross-user reales; el resto (B3–B8) es el trabajo de multi-tenant/hardening.
3. **Bucket C** de forma oportunista, empezando por C1/C3 (frenan el drift que ya existe) y
   C6 (tests donde se mueve dinero).
4. **Bucket D** en ratos sueltos: D4 y D7 eliminan clases enteras de drift con un solo
   cambio; D2/D3 unifican primitivas; D6 (i18n) es una **decisión**, no código, y conviene
   tomarla antes de abrir la app.

## Notas de verificación (si se implementa algún tranche de código)

- `npm run typecheck && npm run lint && npm run test` antes de terminar (regla de
  `CLAUDE.md`; recordar el stub de `PRISMA_SCHEMA_ENGINE_BINARY` para `prisma generate`).
- Migraciones de esquema (A6, B2): revisar el SQL generado y correr sobre la rama Neon de
  dev/preview, **nunca** producción.
- Cambios de reglas (A2): tests en `lib/rules/*.test.ts` con patrones de backtracking y
  árboles profundos.
- Cola/consumidor (B1): test de que un mensaje con `userId` ajeno no escribe datos.
- Cabeceras (B7): verificar con `curl -I` sobre el preview.
