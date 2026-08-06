# Plan — Multiusuario por hogar (invitaciones y roles)

> **Estado:** plan aprobado a nivel de diseño, pendiente de ejecución ·
> **Fecha:** 2026-08-06 · **Origen:** petición del propietario ("invitar a otros
> con diferentes roles, p. ej. que tu pareja tenga visibilidad") + AUDIT.md B3
> ("modelo de acceso: allowlist global → alta por usuario").
>
> Este documento es el spec de referencia. Cada fase de §9 es un PR independiente
> que sigue `PLAYBOOK_NEW_FEATURE.md` y marca aquí su casilla al terminar.

## 1. Objetivo

Que una cuenta de Estalvify deje de ser una persona y pase a ser un **hogar**:
el propietario invita a otras personas por email, cada invitado entra con su
propio Google login y ve/opera sobre los datos del hogar según su **rol**:

| Rol | Caso de uso |
|---|---|
| `OWNER` | El dueño actual. Todo: bancos, miembros, borrado, ajustes del hogar. |
| `EDITOR` | La pareja que gestiona: categoriza, reglas, plan, recurrentes, conectar/reconectar bancos. |
| `VIEWER` | Solo lectura: dashboard, reports, transacciones, plan. Ninguna mutación. |

## 2. Punto de partida (lo que condiciona el diseño)

- **Todo el dominio cuelga de `User.id` directamente**: 15 tablas con `userId`,
  ~440 referencias en 44 ficheros. No existe ninguna entidad intermedia.
- **Las dos puertas de entrada bloquean hoy a cualquier invitado** (`auth.ts`):
  `ALLOWED_EMAILS` (allowlist por env) y el registro cerrado (`ALLOW_SIGNUP`
  unset ⇒ solo entra quien ya tiene fila `users`). Además `proxy.ts` re-verifica
  el allowlist **en cada request** y revoca al que no está.
- **El MCP hereda el login**: los JWT llevan `userId` y scopes `read`/`write`;
  todas las tools derivan `userId` del token.
- **GDPR**: export y borrado de cuenta son "todo lo del `userId`". Con miembros,
  "mi cuenta" y "los datos del hogar" dejan de ser lo mismo.
- **AUDIT.md**: B1 (cola confiaba en el `userId` del mensaje) y B2 (secuestro de
  `BankAccount`) están **resueltos** — eran los dos agujeros cross-user reales.
  B3 (este plan) es lo que queda del bucket "abrir a más usuarios".

## 3. Decisión de arquitectura: hogar *encima* del scope actual

Dos opciones sobre la mesa:

- **(A) Migrar la propiedad de los datos**: nueva FK `householdId` en las 15
  tablas de dominio, backfill, y reescribir todas las queries. Es el modelo SaaS
  "canónico", pero es una migración larga y arriesgada para ganar algo que este
  producto no necesita aún (un usuario en N hogares, transferencia de propiedad).
- **(B) elegida — Membresía sobre el `userId` del propietario**: los datos
  siguen colgando del `userId` del OWNER (el "scope de datos" del hogar). Se
  añade una capa fina de membresía + roles, y **el único punto que cambia es de
  dónde sale el `userId` con el que se consulta**: en vez de `session.user.id`,
  un helper resuelve *sesión → membresía → hogar → userId del propietario*.
  Las 440 referencias siguen siendo válidas; el refactor es mecánico
  (sustituir la derivación, no las queries).

(B) no cierra la puerta a (A): si algún día hace falta multi-hogar real, la tabla
`households` ya existe y la migración de FKs es una fase posterior (§9, fase 6).
La invariante de `ARCHITECTURE.md` ("Multi-User Data Isolation") no cambia:
todo sigue filtrado por un `userId` derivado del servidor, nunca del cliente.

## 4. Modelo de datos (nuevas tablas, sin tocar las existentes)

```prisma
model Household {
  id          String   @id @default(cuid())
  name        String   // "Casa Alcoba" — solo display
  // El User cuyo `userId` ancla TODOS los datos del hogar. Único: un usuario
  // solo puede anclar un hogar. No se transfiere en v1.
  ownerUserId String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  owner   User              @relation("OwnedHousehold", fields: [ownerUserId], references: [id], onDelete: Cascade)
  members HouseholdMember[]
  invites HouseholdInvite[]

  @@map("households")
}

model HouseholdMember {
  id          String        @id @default(cuid())
  householdId String
  userId      String        @unique // v1: un usuario pertenece a UN hogar
  role        HouseholdRole
  createdAt   DateTime      @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([householdId, userId])
  @@map("household_members")
}

enum HouseholdRole {
  OWNER
  EDITOR
  VIEWER
}

model HouseholdInvite {
  id              String        @id @default(cuid())
  householdId     String
  email           String        // se compara case-insensitive, como en signIn
  role            HouseholdRole // nunca OWNER
  // El link de invitación lleva el token en claro; aquí solo el hash
  // (mismo patrón que McpAuthCode/McpRefreshToken).
  tokenHash       String        @unique
  invitedByUserId String
  expiresAt       DateTime      // p. ej. 7 días
  acceptedAt      DateTime?
  revokedAt       DateTime?
  createdAt       DateTime      @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@index([householdId])
  @@map("household_invites")
}
```

**Backfill** (en la misma migración): un `Household` por cada `User` existente
(`ownerUserId = user.id`, nombre por defecto) + su fila `HouseholdMember` como
`OWNER`. Con un solo usuario en producción es una fila de cada.

**Alta futura sin invitación**: si algún día se abre el registro, el primer
login sin membresía crea su hogar propio (lazy). Un invitado **nunca** pasa por
ahí — su membresía se crea al aceptar la invitación.

## 5. Resolución de scope y permisos

Nuevo `lib/auth/scope.ts`, en dos mitades (patrón habitual del repo):

- **Pura + testeada**: matriz rol→permiso. Tres niveles bastan:
  `read` (todos), `write` (EDITOR, OWNER), `admin` (OWNER: miembros, invites,
  ajustes del hogar, Privacy & data).
- **Con IO**: `requireScope(level)` — hace `auth()`, resuelve la membresía y
  devuelve `{ dataUserId, actorUserId, role, householdId }` o lanza. `dataUserId`
  es `household.ownerUserId` (lo que hoy es `session.user.id`); `actorUserId` es
  quién está actuando (para auditoría, notificaciones propias, prefs personales).

**El refactor**: todos los `actions.ts`, `page.tsx` y rutas API que hoy hacen
`const session = await auth()` → `session.user.id` pasan a `requireScope(...)`
con el nivel que corresponda a lo que hacen (los ~44 ficheros del grep). Para el
usuario actual el comportamiento es idéntico (OWNER de su propio hogar), así que
la fase 1 se puede desplegar sin ningún cambio visible.

Matriz de referencia (la fuente de verdad será el test de `scope.ts`):

| Acción | VIEWER | EDITOR | OWNER |
|---|---|---|---|
| Dashboard, reports, transacciones, plan, forecast, recurring (leer) | ✅ | ✅ | ✅ |
| Categorizar, reglas, plan/recurring CRUD, sync manual | ❌ | ✅ | ✅ |
| Conectar/reconectar/desconectar bancos | ❌ | ✅ | ✅ |
| Ajustes del hogar (moneda, `lowBalanceThreshold`, categorías) | ❌ | ✅ | ✅ |
| Miembros e invitaciones | ❌ | ❌ | ✅ |
| Privacy & data (export del hogar, borrar el hogar) | ❌ | ❌ | ✅ |
| Prefs personales (idioma, formato numérico, zona horaria) | ✅ (las suyas) | ✅ | ✅ |

La UI esconde lo que el rol no puede hacer, pero **la seguridad es el
server**: cada action/route valida su nivel — esconder un botón no es control
de acceso.

## 6. Flujo de invitación

Sin infraestructura de email (no la hay), la invitación es un **link
copiable**, mismo patrón de secreto que los tokens MCP:

1. OWNER, en Settings → Members: email + rol → se crea `HouseholdInvite`
   (token aleatorio, se guarda el hash, expira en 7 días) → la UI muestra
   `https://…/invite/<token>` para pasarlo por WhatsApp/mano.
2. El invitado abre el link. Sin sesión → `/login` (el link sobrevive vía
   `callbackUrl`). El `signIn` callback (§7) le deja entrar y el adapter crea su
   fila `users`.
3. La página `/invite/<token>` (autenticada) valida: hash existe, no expirado,
   no revocado, no aceptado, **y el email de la sesión coincide** con el de la
   invitación (case-insensitive — el token solo no basta: un link reenviado no
   debe dar acceso a un tercero). Muestra hogar + rol → "Aceptar" crea
   `HouseholdMember` y marca `acceptedAt`.
4. Si el usuario ya pertenece a otro hogar (en v1: si ya es OWNER con datos),
   se rechaza con mensaje claro — un usuario, un hogar (v1).

Revocar: OWNER borra la membresía → `revokeUserAccess` (ya existe,
`lib/auth/revoke.ts`: mata sesiones Auth.js + refresh tokens MCP en una
transacción). El access token MCP vivo caduca solo (≤ 1 h), igual que hoy al
quitar un email del allowlist.

## 7. Integración con las puertas de entrada existentes

Las dos puertas de `auth.ts` y el enforcement vivo de `proxy.ts` deben aprender
lo que es una invitación — **sin abrir nada más**:

- **`signIn` callback**: el orden pasa a ser —
  (1) `isEmailAllowed(ALLOWED_EMAILS)` **o** invitación activa / membresía
  existente para ese email (case-insensitive); si no, fuera.
  (2) existe fila `users` **o** `ALLOW_SIGNUP` **o** invitación activa (la
  invitación autoriza la creación de la fila). Las propiedades fail-closed de
  `allowed-emails.ts` no se tocan; la invitación es una tercera vía *aditiva*
  con su propia caducidad.
- **`proxy.ts`** hoy hace un match puro de strings contra `ALLOWED_EMAILS` en
  cada request. Pasa a: allowlist **o membresía activa**. La membresía es una
  query — mitigación: `proxy.ts` ya consulta la sesión en BD en cada request;
  la membresía se puede resolver en esa misma pasada o cachear con TTL corto
  (los minutos de gracia tras una revocación los cubre `revokeUserAccess`, que
  mata la sesión al instante).
- **Token MCP**: el JWT gana claims `hh` (householdId) y `role`. Los scopes
  `read`/`write` se **intersecan con el rol**: un VIEWER nunca obtiene `write`
  aunque lo pida, y `requireUserId(extra, "write")` falla para su token. El
  grant `refresh_token` re-verifica la membresía igual que hoy re-verifica
  `ALLOWED_EMAILS` (un miembro expulsado deja de renovar). Tokens legacy sin
  claims nuevos = OWNER de su propio hogar (mismo patrón de envejecimiento
  ≤ 1 h que se usó con los scopes).

## 8. Consecuencias en el resto del sistema

- **Prefs personales vs. ajustes del hogar** (`User` hoy mezcla ambos):
  `language`, `locale`, `timezone` son **personales** — cada miembro las lee de
  su propia fila `users` (`actorUserId`), y Settings se las edita a sí mismo.
  `currency` y `lowBalanceThreshold` son **del hogar** — se leen de la fila del
  owner (`dataUserId`). `lib/user-prefs.ts` es el único sitio que decide esto.
- **Notificaciones**: se generan sobre los datos del hogar (`dataUserId`), así
  que en v1 la campana es **compartida** (marcar leído afecta a todos — trade-off
  aceptado y documentado). La fase 5 separa el estado de lectura por miembro
  (tabla `notification_reads` o duplicado por miembro con `dedupeKey` por
  usuario); la generación idempotente no cambia.
- **GDPR** (`lib/account/*`, páginas legales):
  - Borrado de un **miembro**: borra su `users`, sesiones, tokens MCP y
    membresía — **no** los datos del hogar (no son suyos).
  - Borrado del **OWNER** = borrar el hogar entero (el flujo actual, más el
    cascade de las tablas nuevas). La confirmación tipada debe decirlo.
  - Export: OWNER exporta el hogar (flujo actual); un miembro no-OWNER exporta
    su perfil (su fila `users` + membresía). `/privacy` y `/terms` se
    actualizan en la misma fase.
- **Auditoría de actor** (fase 5): con dos personas escribiendo, "quién
  categorizó esto" importa. `actorUserId` opcional en las mutaciones de
  `TransactionCategorization`, `CategoryRule`, `PlannedItem`, `RecurringSeries`
  (columna nullable, sin FK restrictiva — histórico, como `previousCategoryId`).
- **Caches**: la única cache user-scoped (`recurring-review-count:<userId>`)
  ya usa el scope de datos — con `dataUserId` sigue siendo una sola entrada por
  hogar, correcto (el conteo es del hogar, no del miembro).
- **Cron/cola**: iteran por conexiones/datos, que siguen colgando de
  `dataUserId` — sin cambios. (B1 ya re-deriva el `userId` de la conexión.)

## 9. Fases (un PR cada una, por el camino feature → `preview` → `main`)

- [x] **Fase 1 — Modelo + scope (sin cambio visible).** ✅ 2026-08-06 —
  Migración `20260806130000_households` (3 tablas + backfill idempotente);
  matriz pura en `lib/auth/roles.ts` + `requireScope`/`getScope` en
  `lib/auth/scope.ts` (bootstrap lazy del hogar incluido) con tests; refactor
  completo de `app/(app)` (pages, actions, layout) y de
  `api/banking/{connect,sync}` (write) y `api/export` (admin, con `getScope` +
  `roleAllows` para responder 401/403); `deleteMyAccount` es `admin`;
  el export GDPR incluye el hogar y sus miembros (sin token hashes); y un test
  de guardia (`lib/auth/scope-guard.test.ts`) impide que `session.user.id`
  reaparezca en las zonas guardadas. OAuth/MCP/cron/cola intactos como estaba
  previsto.
- [x] **Fase 2 — Invitaciones + miembros.** ✅ 2026-08-06 — `lib/household/`:
  `invite.ts` (validación pura + TTL 7 días + roles invitables, testeada),
  `manage.ts` (crear/renovar/revocar invitación con token hasheado, aceptar,
  cambiar rol, expulsar → `revokeUserAccess`, DTOs) y `access.ts` (membresía
  o invitación viva por email, para las puertas). `signIn` y `proxy.ts`
  aceptan la vía invitación/membresía **solo cuando el allowlist no casa**
  (aditiva, nada se abre); el proxy además preserva `callbackUrl` al botar a
  /login, que es lo que hace sobrevivir el link de invitación. UI: card
  "Household members" en Settings (solo OWNER; invitar con link copiable
  de un solo uso, renovar, revocar, cambiar rol, expulsar — skeleton
  actualizado) y página `/invite/<token>` en `(auth)` (+ `loading.tsx`) con
  mensajes por causa de rechazo. Aceptar exige email de sesión = email
  invitado; un usuario con hogar propio VACÍO (bootstrap lazy) lo suelta y
  se une; con datos propios u otro hogar, se rechaza.
- [x] **Fase 3 — Roles en la UI.** ✅ 2026-08-06 — `RoleProvider` +
  `useCanWrite`/`useHouseholdRole` montados en el layout de `(app)`
  (`components/layout/role-provider.tsx`); la matriz se refleja ruta a ruta:
  sidebar sin Categorize/Rules para VIEWER (`WRITE_ONLY_URLS`), esas dos
  páginas devuelven un `EmptyState` de solo-lectura en deep link, accounts sin
  conectar/reconectar/sync/renombrar/borrar, transacciones sin recategorizar
  ni crear regla/serie (diálogo y vista móvil), plan sin editar objetivo de
  ahorro/objetivos/fondos ni one-offs, recurring sin sugerencias ni CRUD (la
  lista queda legible), campana/notificaciones sin marcar-leído ni "check
  now", y Settings recortado (VIEWER: aviso; EDITOR: sin Privacy & data).
  Regla nueva en `UI_RULES.md` → "Role-Aware Affordances": toda affordance de
  mutación se esconde por rol, y esconder nunca es el control de acceso.
- [x] **Fase 4 — MCP con roles.** ✅ 2026-08-06 — El JWT gana claims `du`
  (dataUserId del hogar) y `role`; `requireUserId` devuelve el scope de datos
  del hogar (legacy sin claims = own-owner, caduca ≤1h); la intersección
  scope×rol vive en `scopesForRole` (pura, testeada: VIEWER ⇒ exactamente
  `["read"]`, nunca `[]` — vacío redondearía a acceso total) y se aplica en
  mint (token endpoint, ambos grants), en refresh (contexto re-resuelto en
  cada rotación, así un cambio de rol propaga ≤1h) y en verify (cinturón para
  legacy). El consent screen muestra el hogar y anuncia solo-lectura a un
  VIEWER. El refresh token guarda el scope ORIGINAL para que un ascenso de
  rol restaure `write` en la siguiente rotación.
- [x] **Fase 5 — Convivencia.** ✅ 2026-08-06 — (a) Campana por miembro:
  tabla `notification_reads` (+ backfill al owner), no-leídas y marcar-leído
  por `actorUserId` (nivel `read` — un VIEWER gestiona su campana;
  `Notification.readAt` queda como agregado de primera-lectura para la
  retención); "Check now" (generación) sigue siendo write. (b) Prefs
  partidas: `lib/user-prefs.ts` decide — `locale`/`language`/`timezone` del
  ACTOR, `currency` del owner; `updatePersonalPreferences` (nivel read, fila
  propia) + Settings de VIEWER con su formulario personal. (c) Auditoría:
  columna `actorUserId` (nullable, sin FK) en categorizaciones MANUAL,
  reglas, planned one-offs y series, escrita desde las actions (MCP y
  rule-runs quedan null a propósito). **Pendiente de esta fase**: mostrar
  "quién" en la UI (p. ej. en el detalle de transacción) — los datos ya se
  acumulan; hacerlo pide extender el DTO de transacciones y un mapa de
  miembros, mejor cuando haya histórico que enseñar.
- [ ] **Fase 6 (opcional, sin fecha) — Hogar de pleno derecho.** Solo si
  aparece la necesidad real: FK `householdId` en las tablas de dominio,
  multi-hogar por usuario, transferencia de propiedad. El diseño (B) de §3 la
  deja preparada pero no la necesita.

Cada fase actualiza los docs afectados en el mismo cambio
(`PROJECT_OVERVIEW.md` §Multi-User Model, `ARCHITECTURE.md` §Access control y
§Multi-User Data Isolation, `GLOSSARY.md`: hogar/miembro/rol/invitación,
`.env.example` si aparece alguna env) — regla de `CLAUDE.md`.

## 10. Riesgos y decisiones tomadas

- **Un usuario = un hogar (v1).** Simplifica scope, invitación y GDPR. El caso
  "me invitan pero ya tengo mi hogar con datos" se rechaza con mensaje; migrar
  datos entre hogares queda explícitamente fuera.
- **El OWNER no se transfiere (v1).** `ownerUserId` ancla los datos; una
  transferencia es en realidad la fase 6.
- **Campana compartida en v1** — trade-off visible, con plan de salida (fase 5).
- **`ALLOWED_EMAILS` sigue existiendo** como cinturón exterior: una invitación
  no puentea el allowlist si el operador lo tiene cerrado a un dominio. Para el
  hogar familiar típico (Gmail variados) la recomendación operativa es dejar el
  allowlist sin fijar o en `*` y confiar en invitación + registro cerrado, que
  pasan a ser el control principal por-hogar.
- **Enforcement en server actions, no en middleware**: el nivel exigido depende
  de la acción concreta (leer plan vs. escribir plan comparten ruta), así que
  vive en `requireScope(level)` por action — el middleware solo sigue
  garantizando "hay sesión válida y sigue permitida".
- **Lo más delicado es la fase 1** por anchura: el criterio de revisión es que
  **ningún** sitio quede leyendo `session.user.id` para datos de dominio (grep
  de guardia en CI o test que lo impida sería deseable), y que cada action
  declare nivel explícito — un `requireScope()` sin nivel no compila.
