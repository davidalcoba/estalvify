# Estado del repositorio — Estalvify

> Diagnóstico realizado el **2026-07-31**. Foto del estado actual del repo tras
> ~4,5 meses de inactividad, con recomendaciones priorizadas en arquitectura,
> diseño, calidad de código e instrucciones AI. Documento de referencia, no
> normativo: cada recomendación se decide y ejecuta por separado.

---

## 1. Resumen ejecutivo

Estalvify es una **app de finanzas personales** (Next.js 16 / React 19 / Prisma 7
sobre Neon Postgres, desplegada en Vercel) que conecta bancos reales vía **Enable
Banking (PSD2)**, sincroniza transacciones y saldos, y permite categorizar gasto,
definir reglas de auto-categorización y (a futuro) presupuestar y reportar.

**La salud general es alta para la edad del proyecto.** El stack está en las últimas
versiones de casi todo, la arquitectura es disciplinada (frontera DTO server→client,
aislamiento multi-usuario, sync asíncrono por colas) y la deuda "sucia" es casi nula
(1 solo TODO en todo el código, `strict: true`, sin `ts-ignore`). El backend de banca
es código genuinamente de calidad de producción.

Los **tres riesgos principales** son: (1) **cero tests y cero CI** en una app que
maneja dinero y datos bancarios; (2) **dependencias beta / 0.x** en rutas críticas
(`next-auth` beta, `@vercel/queue` con triggers experimentales); y (3) **~la mitad de
la superficie es andamiaje** — dashboard con métricas hardcodeadas, budget/reports sin
implementar, y la categorización con AI declarada pero no cableada. Además el repo
lleva **~4,5 meses dormido** (último commit 2026-03-10), por lo que conviene un paso de
"re-entrada" antes de retomar.

---

## 2. Snapshot del repo

### Stack (versiones reales de `package.json`)

| Área | Tecnología | Versión | Nota |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 | Bleeding edge |
| UI runtime | React / React DOM | 19.2.3 | React 19 |
| ORM | Prisma + `@prisma/client` | ^7.4.2 | Prisma v7 (config-file) |
| DB driver | `@prisma/adapter-neon` + `@neondatabase/serverless` | ^7.4.2 / ^1.0.2 | Postgres serverless (Neon) |
| Auth | `next-auth` (Auth.js v5) | ^5.0.0-beta.30 | **Beta** |
| Colas | `@vercel/queue` | ^0.1.3 | **0.x, triggers experimentales** |
| AI SDK | `ai` + `@ai-sdk/openai` | ^6.0.104 / ^3.0.36 | Declarado, **sin usar** |
| Estilos | Tailwind CSS | ^4 | v4 (CSS-first) |
| Componentes | shadcn/ui + `radix-ui` (paquete unificado) | 3.8.5 / ^1.4.3 | "new-york" |
| Validación | `zod` | ^4.3.6 | Zod v4 |
| Iconos | `lucide-react` | ^0.575.0 | |
| Lenguaje | TypeScript | ^5 | `strict: true` |
| Package manager | npm | — | `package-lock.json` |

### Estructura

App única (no monorepo), alias `@/*` → raíz:

- `app/` — App Router con route groups `(auth)/` (login) y `(app)/` (shell
  autenticado). Features: `dashboard`, `accounts` (+ `setup`), `transactions`,
  `categorize`, `rules`, `budget`, `reports`, `settings`. Cada feature con `page.tsx`
  y a menudo `actions.ts` (server actions) + `loading.tsx`.
- `app/api/` — handlers: `auth/[...nextauth]`, `banking/{connect,callback,sync}`,
  `cron/sync`, `queues/sync-connection`.
- `components/` — por dominio (`accounts`, `categorize`, `rules`, `transactions`,
  `settings`, `layout`) + `components/ui/` (21 primitivas shadcn). Patrón de vistas
  `views/*-desktop-view.tsx` + `*-mobile-view.tsx` + `shared/*`.
- `lib/` — lógica no visual: `banking/` (`enable-banking.ts`, `sync.ts`), `rules/`,
  `transactions/transaction-dto.ts`, `categorize.ts`, `queue.ts`, `prisma.ts`,
  `formatters.ts`.
- `prisma/` — `schema.prisma` (434 líneas) + 8 migraciones.
- `ai-instructions/` — contexto para asistentes AI (ARCHITECTURE, CODING_RULES,
  UI_RULES, PLAYBOOK, GLOSSARY + skill `frontend-design`).

Puntos de entrada: `app/layout.tsx` + `app/page.tsx`, `proxy.ts` (protección de rutas,
el "middleware" renombrado de Next 16), `auth.ts` (Auth.js).

### Estado git

- Rama por defecto: `main`. 155 commits, inicio **2026-02-28**, último **2026-03-10**.
- **~4,5 meses sin commits** relativo a hoy. Desarrollo en solitario vía PRs (#23–#27),
  cadencia alta, muchos commits autoría "Claude" mergeados por `davidalcoba`.
- Los últimos commits son pulido de UI y bugfixes sobre categorize/transactions/rules.

### Qué funciona vs. qué es stub

| Ruta / feature | Estado |
|---|---|
| Conexión y sync bancario (Enable Banking) | ✅ Funcional, bien construido |
| `/transactions` (lista, filtros, paginación) | ✅ Funcional |
| `/categorize` (inbox de categorización) | ✅ Funcional (feature estrella) |
| `/rules` (reglas de auto-categorización) | ✅ Funcional |
| `/settings` (preferencias, gestor de categorías) | ✅ Funcional |
| `/dashboard` | ⚠️ **Stub** — KPIs `€0.00` / `0` hardcodeados, sin queries |
| `/budget` | ⚠️ **Stub** — estado vacío, botones deshabilitados |
| `/reports` | ⚠️ **Stub** — tarjeta "coming soon" |
| Categorización con AI | ⚠️ **No implementada** — modelo `AiCategorySuggestion` y deps `ai`/`@ai-sdk/openai` existen, pero no hay código que las use |

---

## 3. Arquitectura

**Fortalezas**

- **Separación de capas clara**: Server Components por defecto, `"use client"` solo
  donde hay interacción; mutaciones vía server actions; trabajo en background vía
  `/api/queues` + `@vercel/queue` y un cron diario (`vercel.json`, `0 1 * * *`).
- **Frontera DTO server→client** aplicada por convención (`lib/**/*-dto.ts`): ningún
  `Date`/`Decimal`/instancia de clase cruza al cliente. Es una decisión correcta y
  bien mantenida.
- **Aislamiento multi-usuario** como regla dura: siempre filtrar por `userId`, nunca
  confiar en un `userId` del cliente. Verificado en los server actions.
- **Sync bancario centralizado** en `lib/banking/sync.ts` (compartido por cron y
  post-conexión): IDs externos deterministas con fallback por hash (bancos como BBVA
  que omiten IDs), `createMany` + `skipDuplicates` contra timeouts de Vercel,
  detección de rate-limit (429/HUB046), recuperación de syncs "colgados".
- **Privacidad por diseño**: solo se almacenan los últimos 4 dígitos de los IBAN; las
  transacciones se tratan como datos crudos inmutables del banco.

**Recomendaciones**

- **A1 · Fijar/planificar las dependencias beta y 0.x.** `next-auth@5-beta.30` y
  `@vercel/queue@0.1.3` (triggers `queue/v2beta`) están en rutas críticas. Los rangos
  `^` sobre 0.x pueden romper en un minor bump. Recomendado: pinear versiones exactas
  de las 0.x y documentar un plan de subida a Auth.js v5 estable cuando salga.
- **A2 · Decidir el destino del stack de AI**. `ai` + `@ai-sdk/openai` + el modelo
  `AiCategorySuggestion` están declarados pero sin cablear. Dos caminos válidos:
  implementarlo (categorización asistida con OpenAI y confianza/umbral) o retirar las
  dependencias y el modelo hasta que se vaya a construir. Hoy es superficie muerta.
- **A3 · Cerrar el bucle de observabilidad del sync.** Existe `SyncLog`; conviene una
  vista/consulta mínima (o alertas) para syncs fallidos o conexiones `EXPIRED` /
  `PENDING_REAUTH`, dado que el cron corre desatendido.

---

## 4. Diseño / UI

**Fortalezas**

- **Sistema de diseño con tokens** en OKLCH vía CSS custom properties, tema `.dark`
  completo, acento de marca índigo consistente. Tailwind v4 CSS-first + shadcn/ui.
- **Desktop y móvil como vistas de primera clase**: patrón orquestador +
  `views/FeatureDesktopView` / `FeatureMobileView` + `shared/*`, documentado en
  `UI_RULES.md` y bien aplicado. Reutilización real de primitivas de transacción entre
  `transactions` y `categorize`.
- **Accesibilidad por encima de la media**: `sr-only`, `DialogTitle`, aria vía Radix,
  headings semánticos. UI optimista con rollback consistente.

**Recomendaciones**

- **D1 · Activar el dark mode.** El tema `.dark` está definido pero **no hay toggle**
  (falta `next-themes`); hoy el usuario no puede activarlo. Añadir `next-themes` + un
  switch, o retirar el tema si no se quiere ofrecer. `suppressHydrationWarning` ya está
  puesto en `<html>`.
- **D2 · Usar tokens semánticos en vez de colores Tailwind hardcodeados.** Varias
  páginas usan `text-green-600`, `bg-purple-100`, `bg-red-100 text-red-500`,
  `bg-indigo-600` en lugar de tokens. Rompe la coherencia y complica el dark mode.
- **D3 · Corregir la violación de `UI_RULES` en el FocusModal.** En
  `components/categorize/categorize-inbox.tsx` hay un `<select>` nativo con estilos
  inline en lugar de la primitiva compartida `components/ui/select`.
- **D4 · Revisar el viewport.** `maximumScale: 1` desactiva el zoom del usuario, un
  anti-patrón de accesibilidad. Quitarlo salvo justificación fuerte.
- **D5 · Decidir la estrategia de i18n.** La UI está 100% en inglés hardcodeado (sin
  librería), pero el contexto de datos es español/EUR (`locale` por defecto `es-ES`,
  banca SEPA). Si se quiere localizar, introducir `next-intl` antes de que crezca el
  texto; si no, dejarlo consciente y documentado.

---

## 5. Calidad de código y deuda técnica

**Fortalezas**: TypeScript estricto con DTOs de dominio explícitos, comentarios que
explican el *por qué*, deuda "sucia" casi inexistente (1 TODO en todo el repo, sin
supresiones de tipos ni lint). Ficheros de tamaño razonable (el mayor es
`components/ui/sidebar.tsx`, 720 líneas, generado por shadcn).

**Recomendaciones**

- **C1 · (P0) Introducir tests.** No hay ningún test ni runner. Para una app
  financiera es el gap más grave. Empezar por la lógica pura de mayor riesgo:
  `lib/banking/sync.ts` (IDs deterministas, dedupe), `lib/rules/rule-evaluator.ts`
  (evaluación de condiciones) y `lib/categorize.ts`. Sugerido: **Vitest** (encaja con
  el stack) + algún test de integración de server actions.
- **C2 · (P0) Añadir CI.** No existe `.github/workflows/`; el único gate es la
  integración Git de Vercel. Un workflow mínimo (`typecheck` + `lint` + `test` en cada
  PR) evita regresiones. `.github/` hoy solo tiene `copilot-instructions.md`.
- **C3 · Extraer la lógica de categorización duplicada.** El bloque de upsert de
  categorización está copiado en `categorizeTransaction`, `bulkCategorizeByIds` y
  `bulkCategorize` (`app/(app)/categorize/actions.ts`). Extraer a un helper compartido.
- **C4 · Limpiar dead/placeholder code.** `transactionCounterparty()` siempre devuelve
  `null`; el sidebar tiene un comentario "Badge count will come from props in the
  future". Implementar o retirar.
- **C5 · Sacar el hardcoding específico de banco de código genérico.**
  `BBVA_DESCRIPTION_PREFIXES` vive en `lib/transactions/transaction-dto.ts`; conviene
  una capa de normalización por-proveedor separada del DTO genérico.
- **C6 · Añadir Prettier.** No hay config de formato; se depende de ESLint/editor. Un
  Prettier + regla en CI homogeneiza el estilo.

---

## 6. Instrucciones AI (`ai-instructions/`, `CLAUDE.md`, skill)

El sistema de instrucciones es **bueno y, cosa rara, fiel al código real**: la
arquitectura, el patrón DTO, las vistas desktop/móvil y el modelo de colas descritos
existen tal cual. Los arreglos son concretos y de bajo esfuerzo:

- **AI1 · Ruta rota repetida.** `PLAYBOOK_NEW_FEATURE.md` (paso 1) y el `README.md`
  raíz apuntan a `ai-instructions/README.md`, que **no existe**. Debe ser
  `ai-instructions/context/README.md`.
- **AI2 · El skill `frontend-design` contradice `UI_RULES.md`.** Es el skill genérico
  de Anthropic (empuja "maximalismo", "tipografía distintiva", "evita Inter", "evita
  patrones de componentes predecibles"), mientras que las reglas del proyecto mandan
  reutilizar primitivas shadcn y mantener consistencia. Además referencia un
  `LICENSE.txt` que no está en el directorio del skill. Recomendado: reescribir el
  skill adaptándolo al proyecto (o acotarlo explícitamente a páginas de
  marketing/landing) y arreglar la referencia de licencia.
- **AI3 · `CLAUDE.md` sin comandos ejecutables.** Es un índice puro; no incluye
  `npm run dev` / `build` / `lint` ni menciona que **no hay tests**. Añadir una sección
  breve de comandos y estado de testing ayuda a cualquier asistente.
- **AI4 · Detalles sub-especificados en OVERVIEW/GLOSSARY.** Conviene nombrar
  explícitamente: proveedor de AI = **OpenAI** (`@ai-sdk/openai`), banca = **Enable
  Banking**, Tailwind = **v4**, primitivas sobre el paquete **unificado `radix-ui`**.
- **AI5 · Mantener la disciplina de actualización.** El `README.md` de contexto ya
  exige actualizar docs y `README.md` en el mismo PR; conviene extender esa regla a
  añadir/actualizar tests cuando se toque lógica.

---

## 7. Roadmap priorizado

| ID | Recomendación | Prioridad | Esfuerzo | Área |
|---|---|---|---|---|
| AI1 | ✅ **Hecho** — ruta rota `ai-instructions/README.md` corregida (2 sitios) | **P0** | Trivial | Instrucciones AI |
| C2 | ✅ **Hecho** — CI en `.github/workflows/ci.yml` (typecheck + lint + test en PR) | **P0** | Bajo | Calidad |
| C1 | ✅ **Hecho** — 30 tests (Vitest) sobre sync/parsing, reglas, categorize, formatters | **P0** | Medio | Calidad |
| A1 | Pinear/planificar deps beta y 0.x (next-auth, @vercel/queue) | **P1** | Bajo | Arquitectura |
| A2 | ✅ **Hecho** — stack de AI retirado (modelo, enum y deps `ai`/`@ai-sdk/openai`); valor `CategorizationSource.AI` reservado para el futuro | **P1** | Medio | Arquitectura |
| — | Completar u ocultar los stubs (dashboard/budget/reports) | **P1** | Medio | Producto |
| D1 | Activar dark mode (`next-themes` + toggle) o retirar el tema | **P1** | Bajo | Diseño |
| AI2 | Reescribir/acotar el skill `frontend-design` + fix licencia | **P1** | Bajo | Instrucciones AI |
| AI3 | Añadir comandos y estado de tests a `CLAUDE.md` | **P1** | Trivial | Instrucciones AI |
| C3 | Extraer la lógica de categorización duplicada | **P2** | Bajo | Calidad |
| D2 | Migrar colores hardcodeados a tokens semánticos | **P2** | Medio | Diseño |
| D3 | Reemplazar el `<select>` nativo por `components/ui/select` | **P2** | Trivial | Diseño |
| D4 | Quitar `maximumScale: 1` del viewport | **P2** | Trivial | Diseño/a11y |
| D5 | Decidir estrategia de i18n (`next-intl` o documentar) | **P2** | Medio | Diseño |
| C4/C5 | Limpiar dead code y aislar hardcoding por-banco | **P2** | Bajo | Calidad |
| C6 | Añadir Prettier + regla en CI | **P2** | Trivial | Calidad |
| AI4/AI5 | Precisar OVERVIEW/GLOSSARY y regla de tests en PR | **P2** | Trivial | Instrucciones AI |

### Antes de retomar (re-entrada tras la dormancia)

1. `npm install` y `npm run build` para detectar drift de dependencias.
2. `npm run lint` para confirmar que el estado base sigue limpio.
3. Revisar si las versiones beta/0.x tienen releases estables disponibles antes de
   fijar (ver A1).
