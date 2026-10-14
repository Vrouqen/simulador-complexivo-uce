# Simulador Complexivo UCE

Plataforma web de práctica para el examen complexivo con **licencias personales de un solo dispositivo**.
Next.js 15 (Vercel) + Postgres (Supabase, capa gratuita).

Bancos incluidos: Banco Maestro (480 preguntas, 6 materias), Auditoría de TI (80) e Inteligencia de Negocios (80).

---

## Cómo funciona la licencia

| Regla | Cómo se aplica |
|---|---|
| **1 licencia = 1 persona** | Correo y cédula únicos. No se pueden crear dos licencias con el mismo correo/cédula. |
| **Activación con código de un solo uso** | Tú validas el pago y generas un código `UCE-XXXX-XXXX-XXXX`. Se guarda cifrado y se borra al usarse. |
| **1 dispositivo** | Al activar, la licencia queda vinculada a ese navegador/equipo (cookie permanente + huella del equipo). Desde otro equipo el ingreso se **rechaza aunque la contraseña sea correcta**. |
| **1 sesión a la vez** | Cada inicio de sesión cierra el anterior. |
| **Copiar cookies no sirve** | La sesión solo vale junto con la cookie del navegador **y** la huella del equipo que la abrió. Si se copian a otro equipo, la sesión se cierra. |
| **Bloqueo automático** | 3 alertas de uso compartido en 7 días ⇒ la licencia se bloquea sola. Tú decides si desbloquearla. |
| **El banco no se puede descargar** | Las preguntas viven en la base de datos, nunca en el código. El navegador recibe solo las preguntas del intento actual **sin respuestas**. El servidor califica y entrega la explicación al final. |
| **Disuasión de capturas** | Marca de agua con nombre, correo y cédula del titular. Copiar, imprimir y el clic derecho están bloqueados. |

> Ningún sistema web es 100 % infalible (alguien siempre puede fotografiar la pantalla), pero con
> esto **compartir la cuenta deja de ser práctico**: otra persona no puede entrar desde su equipo, y
> cualquier intento queda registrado y termina en bloqueo.

### Casos de soporte habituales (panel `/admin` → licencia)
- **Cambió de computadora / borró el navegador** → *Liberar dispositivo*. El titular entra con su contraseña en el equipo nuevo y el anterior deja de funcionar.
- **Olvidó la contraseña** → *Nuevo código*. Activa de nuevo con el código nuevo.
- **Sospecha de uso compartido** → revisa *Actividad y seguridad* y *Bloquear*.

---

## Flujo de venta

1. El estudiante ve precio y datos de pago en la página principal y transfiere.
2. Llena **/solicitar** con su nombre, cédula, correo y número de comprobante.
3. Tú entras a **/admin → Solicitudes**, verificas el pago en tu banco y pulsas **Aprobar**.
4. Aparece el código y un mensaje listo para enviar por **WhatsApp** o correo.
5. El estudiante entra a **/activar** desde su equipo, pone el código y crea su contraseña.

También puedes crear licencias directamente en **/admin → + Nueva licencia** (pagos por WhatsApp, efectivo, etc.).

---

## Despliegue (Supabase + Vercel)

### 1. Base de datos en Supabase (gratis)
1. Crea una cuenta en <https://supabase.com> → **New project** (región: *East US* o *South America (São Paulo)*). Guarda la contraseña de la base.
2. Ve a **Project Settings → Database → Connection string** (botón *Connect*):
   - **Transaction pooler** (puerto **6543**) → será `DATABASE_URL` en Vercel.
   - **Session pooler** (puerto **5432**) → úsalo en tu PC para migrar/cargar datos.
   - Añade `?sslmode=require` al final de ambas.

> Las tablas se crean en un esquema privado `app` con RLS activado: la API pública de Supabase
> (anon key) **no puede leerlas**. La app se conecta directamente a Postgres.
>
> ⚠️ En el plan gratuito, Supabase **pausa el proyecto tras 7 días sin actividad**. Mientras tengas
> estudiantes activos no pasa; si se pausa, reactívalo desde el panel de Supabase.

### 2. Preparar la base desde tu PC
```bash
npm install
```
Crea `.env.local` copiando `.env.example` y pon la cadena *Session pooler* en `DATABASE_URL`. Luego:
```bash
npm run db:migrate
```
Extrae los bancos de tus HTML originales (genera `content/*.json`, que **no** se sube a git):
```bash
npm run extract -- --maestro "C:/Users/luise/Desktop/Complexivo/Banco_Maestro_Complexivo_UCE_480_Preguntas_v4.html" --bi "C:/Users/luise/Downloads/Banco_Complexivo_BI_80_Preguntas.html" --auditoria "C:/Users/luise/Downloads/simulador_auditoria_TI.html"
```
Súbelos a Supabase:
```bash
npm run db:seed
```
Cada vez que edites un banco, repite `extract` + `db:seed` (actualiza sin borrar el historial).

### 3. Publicar en Vercel
1. Sube el proyecto a un repositorio de GitHub (**privado** recomendado). Las preguntas no están en el repo.
2. En <https://vercel.com> → **Add New → Project** → importa el repositorio (Vercel detecta Next.js).
3. En **Environment Variables** añade las de `.env.example`:
   `DATABASE_URL` (Transaction pooler, 6543), `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `LICENSE_PRICE`, `CONTACT_WHATSAPP`, `PAYMENT_INFO`.
4. **Deploy**. Entra a `https://tu-proyecto.vercel.app/admin` con tu correo y contraseña de admin.

> `SESSION_SECRET` debe ser el mismo siempre. Si lo cambias, los códigos pendientes y las sesiones dejan de valer.

---

## Desarrollo local (sin Supabase)
Usa una base Postgres embebida (PGlite):
```bash
npm run db:local
```
En otra terminal, con `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` y `DB_POOL_MAX=1` en `.env.local`:
```bash
npm run db:migrate && npm run db:seed && npm run dev
```

## Estructura
```
db/schema.sql            Tablas (esquema "app")
scripts/                 extract-banks, db-migrate, db-seed
src/lib/auth.ts          Licencias: activación, dispositivo único, sesión única, detección de uso compartido
src/lib/exam.ts          Motor de exámenes en el servidor (arma, autoguarda, califica)
src/lib/admin.ts         Panel de administración
src/lib/fingerprint.ts   Comparación de huellas de dispositivo
src/components/          Simulador, formularios y panel admin
src/app/                 Páginas y API
```
