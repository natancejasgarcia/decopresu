# Decoralia Proyectos

![Decoralia Pintores](public/decoralia-logo.png)

> Aplicacion web privada para organizar obras, presupuestos y operaciones de una empresa de pintura y lacado.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-estricto-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth%20%7C%20Storage-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

## Sobre el proyecto

### Gestion comercial: albaranes y facturas

Decoralia incorpora un circuito de ventas inspirado en herramientas de gestion como ClassicGes:

- Inicio con accesos directos y navegacion permanente en movil.
- Directorio de clientes agrupado a partir de las obras existentes.
- Creacion de albaranes y facturas desde un presupuesto de obra o desde un documento vacio.
- Borradores editables con datos fiscales, conceptos, unidades, precios, IVA y observaciones.
- Emision con numeracion correlativa por serie y ejercicio, asignada mediante una transaccion de PostgreSQL.
- Conversion de un albaran emitido en factura, evitando duplicar la factura de origen.
- Datos fiscales del emisor conservados en cada documento emitido.
- Cobros parciales por factura registrados tambien en Finanzas.
- Descarga privada de PDFs A4 con logo y paginacion.

**Activacion:** ejecutar `supabase/migrations/20261005_sales_documents.sql` despues del esquema base. A continuacion, completar los datos fiscales en `/settings`. La migracion no borra proyectos, presupuestos ni movimientos existentes. Si aun no esta aplicada, la pantalla de ventas muestra que el modulo esta pendiente de activar.

**Alcance fiscal:** esta version no implementa registros encadenados, remision a la AEAT, QR tributario, declaracion responsable del sistema ni facturas rectificativas. No se presenta como un sistema adaptado a VERI*FACTU. Su utilizacion para facturacion oficial requiere completar y revisar esa integracion.

Verificacion del modulo: `node --test tests/sales.test.cjs`.

Prueba opcional de migraciones y transacciones sobre PostgreSQL embebido, sin conectar con datos reales:

```bash
npm install --prefix tmp/sales-verification --no-save --package-lock=false @electric-sql/pglite
node tests/sales-db.cjs
```

Decoralia Proyectos sustituye la gestion dispersa de obras por WhatsApp, hojas de calculo y documentos sueltos. Centraliza el ciclo completo de una obra en una interfaz responsive pensada para usarse desde movil:

- Proyectos de pintura y lacado, con estados, clientes y actividad.
- Chat interno, fotos, documentos y justificantes privados.
- Mediciones por habitaciones, zonas y modulos.
- Presupuestos editables, ordenables y descargables en PDF A4.
- Gastos, cobros, costes fijos y seguimiento financiero.
- Notas diarias, calendario de obras y validador de presupuestos.
- Envio de correos con identidad visual de Decoralia.
- Generacion asistida de presupuestos con IA.

El producto esta pensado para un equipo pequeno y prioriza claridad, rapidez y trazabilidad.

## Funcionalidades

### Proyectos

- Dashboard con accesos rapidos, indicadores y actividad reciente.
- Separacion entre **Pintura** y **Laca**.
- Estados: Pendiente, Presupuestado, Aprobado, En ejecucion, Terminado y Cobrado.
- Busqueda, filtros, creacion, edicion, clonacion y borrado.
- Calendario mensual para organizar las obras.
- Indicador de mensajes no leidos por proyecto.

### Presupuestos y mediciones

- Conceptos libres con notas, cantidad, unidad y precio.
- Autocompletado de conceptos con descripcion editable, basado en trabajos habituales y los ultimos presupuestos del equipo.
- Conceptos de precio cerrado sin cantidad ni unidad.
- Edicion, borrado y drag and drop de lineas.
- Medicion de techo, paredes, huecos y superficie manual.
- Modulos o subpartidas dentro de una habitacion o zona.
- Precio propio por habitacion o modulo.
- Condiciones comerciales, terminos legales y desglose de importes.
- Descarga en PDF A4.
- Generador IA que propone conceptos desde texto, mediciones e imagenes.

> La IA genera un borrador editable. La revision humana sigue siendo obligatoria antes de enviarlo al cliente.

Calculos principales:

```text
Techo = largo x ancho
Paredes = 2 x (largo + ancho) x alto
Total pintable = techo + paredes - huecos
Importe = cantidad x precio unitario
```

### Comunicacion y archivos

- Chat privado por obra actualizado con Supabase Realtime.
- Subida multiple de imagenes y documentos.
- Pegado directo de capturas desde el portapapeles.
- Archivos privados con URLs firmadas de duracion limitada.
- Soporte para imagenes, PDF y documentos de oficina.
- Ficha de cliente con llamada, WhatsApp y copia de telefono.

### Finanzas

- Panel mensual con navegacion por meses anteriores.
- Cobros vinculados a proyectos o cobros varios.
- Gastos de obra, materiales y costes fijos.
- Adjuntos PDF o imagen para gastos y cobros.
- Beneficio estimado e indicadores de ingresos y costes.
- Graficas de ingresos, gastos, beneficio y estados de presupuestos.
- Edicion y borrado de movimientos.

### Operativa diaria

- Notas del dia con fecha, proyecto enlazado y fotografias.
- Edicion, archivo y marcado como completado.
- Acceso directo desde una nota al proyecto relacionado.
- Validador de presupuestos PDF: pendiente, pendiente de revision y validado.
- Comentarios de revision e historico de validaciones.
- Envio de correos con plantilla de marca, adjuntos e historico.

## Arquitectura

```text
app/
  dashboard/                 Dashboard operativo
  projects/                  Listado, alta y detalle de proyectos
    [id]/                    Resumen, chat, archivos, medidas y presupuesto
    [id]/budget/pdf/         Generacion de PDF A4
  finance/                   Finanzas y movimientos
  emails/                    Composicion e historico de correos
  validations/               Validador de presupuestos PDF
  notes/                     Notas diarias con fotos y proyectos
  login/                     Acceso privado

components/                  Componentes de interfaz reutilizables
actions/                     Server Actions y mutaciones seguras
lib/                         Clientes Supabase, tipos y calculos
supabase/
  schema.sql                 Esquema consolidado
  migrations/                Cambios incrementales
public/                      Branding y recursos estaticos
middleware.ts                Proteccion de rutas y sesion
```

## Stack tecnico

- **Next.js 14** con App Router y Server Components.
- **React 18** y **TypeScript** estricto.
- **Tailwind CSS** y **Lucide React**.
- **Supabase Auth, PostgreSQL, Storage y Realtime**.
- **Server Actions** para mutaciones y revalidacion.
- **Zod** para validacion de entradas.
- **pdf-lib** para documentos A4.
- **Nodemailer/SMTP** para correo.
- **OpenAI API** como integracion opcional de presupuestos asistidos.

## Modelo de datos

El esquema incluye:

- `profiles`: usuarios autorizados y roles.
- `projects`: obras, clientes, tipo y estado.
- `messages`: chat por proyecto.
- `project_files`: fotos y documentos.
- `rooms` y `room_modules`: mediciones y partidas por zona.
- `budget_items`: conceptos ordenables del presupuesto.
- `project_expenses`, `project_payments` y `fixed_costs`: contabilidad.
- `daily_notes` y `daily_note_files`: seguimiento diario.
- `budget_validations`: control de PDFs.
- `sent_emails`: historico de comunicaciones.

Las tablas sensibles tienen Row Level Security activado. El bucket de archivos es privado y se usan enlaces firmados para la visualizacion temporal.

## Instalacion local

### Requisitos

- Node.js 18.17 o superior.
- Proyecto de Supabase.
- Cuenta SMTP para habilitar el modulo de correo.

### 1. Clonar e instalar

```bash
git clone https://github.com/natancejasgarcia/decopresu.git
cd decopresu
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en Supabase.
2. Activa Authentication con email y contrasena.
3. Crea manualmente los usuarios privados.
4. Ejecuta `supabase/schema.sql` desde el SQL Editor.
5. En bases existentes, ejecuta las migraciones de `supabase/migrations/` en orden cronologico.
6. Confirma el bucket privado `project-files`.
7. Anade los usuarios a `public.profiles` usando sus UUID reales:

```sql
insert into public.profiles (user_id, name, role)
values
  ('UUID_REAL_DEL_USUARIO', 'Jose Antonio', 'admin'),
  ('UUID_REAL_DEL_USUARIO', 'Padre', 'member');
```

No uses textos como `UUID_DE_JOSE_ANTONIO`: la columna espera un UUID real de Supabase Auth.

### 3. Variables de entorno

Copia `.env.example` a `.env.local` y configura:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_publishable_o_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@tu-dominio.es
SMTP_PASSWORD=tu_password_smtp
SMTP_FROM_NAME=Decoralia Pintores

NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
EMAIL_LOGO_URL=http://127.0.0.1:3000/decoralia-logo.png
OPENAI_API_KEY=tu_api_key_opcional
```

Las variables `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASSWORD` y `OPENAI_API_KEY` son secretos de servidor. No deben llevar el prefijo `NEXT_PUBLIC_` ni subirse al repositorio.

### 4. Ejecutar

```bash
npm run dev
```

Abre http://127.0.0.1:3000.

Scripts disponibles:

```bash
npm run dev       # Desarrollo local
npm run build     # Build de produccion
npm run start     # Servir la build
npm run lint      # Lint
```

## Despliegue en Vercel

1. Importa el repositorio desde GitHub.
2. Configura las variables en Production, Preview y Development.
3. Verifica que `NEXT_PUBLIC_SUPABASE_URL` apunta al proyecto activo e incluye `https://`.
4. Despliega la rama `main`.
5. En Supabase, configura el dominio de produccion en Authentication > URL Configuration.
6. Comprueba login, dashboard, subida de archivos y descarga de PDF.

Un error `ENOTFOUND ...supabase.co` en Vercel indica que la URL configurada no resuelve en DNS o apunta a un proyecto que ya no existe; no es un fallo de compilacion de Next.js.

## Seguridad y decisiones tecnicas

- No existe registro publico.
- Las rutas privadas pasan por middleware y validacion de sesion.
- Las mutaciones se ejecutan en servidor y revalidan las rutas afectadas.
- PostgreSQL RLS limita los datos a usuarios autenticados y autorizados.
- Los archivos no son publicos; se consultan mediante URLs firmadas.
- La IA no publica automaticamente presupuestos.
- Los errores de funciones opcionales se tratan para mantener el dashboard operativo durante migraciones.

## Estado del proyecto

### Disponible

Gestion de proyectos, chat, archivos, mediciones, modulos por zona, presupuestos PDF, albaranes, facturas internas con series, finanzas, cobros parciales, gastos, costes fijos, notas diarias, calendario, validacion de PDFs, envio de correos y generacion asistida con IA.

### Siguiente evolucion

- PWA instalable y soporte offline parcial.
- Notificaciones push.
- Firma digital de aceptacion.
- Integracion fiscal y facturas rectificativas.
- Integracion con WhatsApp.
- Permisos por rol mas granulares.
- Auditoria de cambios.
- Ampliar las pruebas automatizadas a los modulos existentes.

## Valor como proyecto de portfolio

Decoralia demuestra la construccion de una aplicacion B2B real desde el problema de negocio hasta el despliegue:

- Modelado relacional con restricciones, indices y RLS.
- Autenticacion privada y control de acceso.
- Arquitectura full-stack con App Router y Server Actions.
- Subida segura de archivos y enlaces firmados.
- Tiempo real con Supabase Realtime.
- Generacion de documentos PDF.
- Metricas financieras y visualizacion de datos.
- Drag and drop, portapapeles y edicion inline.
- Integracion de SMTP y OpenAI manteniendo secretos en servidor.
- Diseno responsive orientado a uso movil.

## Licencia

Proyecto privado de Decoralia Pintores. El codigo se publica con fines de portfolio y demostracion tecnica; consulta al propietario antes de reutilizar datos, marca, credenciales o recursos comerciales.
