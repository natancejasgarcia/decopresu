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
- Pizarra de briefing compartida, notas diarias, calendario de obras y validador de presupuestos.
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
  notes/                     Pizarra compartida e historial de notas
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
5. Ejecuta tambien las migraciones de `supabase/migrations/` en orden cronologico, tanto en bases nuevas como existentes.
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

### Activar la pizarra compartida

Ejecuta `supabase/migrations/20261008_briefing_board.sql` una vez en el SQL Editor del proyecto Supabase existente. Es una migracion aditiva e idempotente: no borra ni modifica notas, proyectos, presupuestos o costes. Despues, recarga `/notes`.

- `/notes`: lienzo permanente con dibujo, flechas, textos, fotos y tarjetas de presupuestos enlazadas a la obra y su PDF. Los importes de las tarjetas son una instantanea al anadirlas; editar un texto de la pizarra no cambia el presupuesto real.
- `/notes?view=history` y los enlaces antiguos `/notes?date=...`: apuntes diarios originales, con fotos, edicion y archivo, sin perdida de historial.
- Guardado automatico autenticado, lectura de cambios cada 12 segundos y control de versiones en PostgreSQL. Las ediciones concurrentes se reconcilian con Excalidraw; los elementos borrados se conservan como tombstones para evitar resurrecciones accidentales.
- Las fotos se comprimen antes de guardar en la escena privada (limite de 3,5 MB por escena). Se puede exportar una copia `.excalidraw` o una imagen. Los borradores no guardados intentan recuperarse en el mismo navegador y usuario; no sustituyen a una copia de seguridad.
- Sin migracion, la interfaz avisa expresamente que el guardado compartido no esta activo; permite probar y descargar la pizarra, sin fingir un guardado en servidor.
- `predev` y `prebuild` preparan las fuentes de Excalidraw dentro de `public/excalidraw-assets`; no se depende de un CDN de fuentes.

El motor de dibujo es Excalidraw (MIT), cargado solo en el navegador. La auditoria de dependencias sigue mostrando avisos en el framework existente y algunas dependencias transitivas; actualizar Next.js y validar esa migracion requiere una revision separada. No se ha aplicado `npm audit fix --force` ni cambiado el sistema de autenticacion para esta funcionalidad.

Pruebas: `node --test tests/briefing.test.cjs` y `node tests/briefing-db.cjs` (esta ultima requiere PGlite en el entorno de verificacion, como `tests/sales-db.cjs`).

### Publicar

1. Importa el repositorio desde GitHub.
2. Configura las variables en Production, Preview y Development.
3. Verifica que `NEXT_PUBLIC_SUPABASE_URL` apunta al proyecto activo e incluye `https://`.
4. Despliega la rama `main`.
5. En Supabase, configura el dominio de produccion en Authentication > URL Configuration.
6. Comprueba login, dashboard, subida de archivos y descarga de PDF.

Un error `ENOTFOUND ...supabase.co` en Vercel indica que la URL configurada no resuelve en DNS o apunta a un proyecto que ya no existe; no es un fallo de compilacion de Next.js.

## Seguridad y decisiones tecnicas

### Revision privada y finanzas con IA

1. Ejecuta `supabase/migrations/20261018_access_and_finance_ai.sql` en el SQL Editor del Supabase existente, despues del esquema base y las migraciones anteriores. La migracion es transaccional e idempotente; no elimina proyectos, gastos, cobros ni costes fijos. Incluye las columnas de justificantes que faltaban en instalaciones antiguas.
2. La cuenta `decoralia1977@gmail.com` queda como revisora. El propietario se identifica por el unico perfil llamado **Jose Antonio** (con o sin tildes). Si no encuentra exactamente uno, la migracion se detiene sin aplicar cambios: comprueba primero los perfiles. Las asignaciones quedan en `workspace_access`, protegidas contra edicion desde la aplicacion. Para otra cuenta de Coralia, configura su UUID como `reviewer` desde SQL y revisa el correo de respaldo en `lib/access.ts`.
3. Configura `OPENAI_API_KEY` solo en el servidor y, opcionalmente, `OPENAI_FINANCE_MODEL` (por defecto `gpt-4o`, compatible con imagenes, Responses y salida estructurada). Usa `.env.local` para desarrollo y las variables del proyecto para produccion. No incluyas claves en Git. Despliega de nuevo tras configurarlas.

Aplica tambien `supabase/migrations/20261019_reviewer_invoice_uploads.sql`. Decoralia entra en `/dashboard` con solo dos accesos: **Revisar presupuestos** y **Subir facturas**. El inicio no consulta ni envia cifras de obras, notas o contabilidad a esa cuenta. Puede subir fotos y consultar sus propios borradores; no puede escanear con IA, contabilizar, editar ni borrar documentos financieros. Jose Antonio revisa y contabiliza las subidas desde Finanzas. No se permite acceder a obras, contabilidad, asistente financiero ni notas, tampoco mediante enlaces directos o consultas a Supabase. Los OK se consultan en la pestana **Validados**, exclusiva del propietario. Los documentos permanecen ocultos hasta activar los permisos. Los PDF se sirven mediante una ruta autenticada que comprueba el estado en cada peticion; enlaces firmados antiguos pueden seguir funcionando hasta su caducidad y un archivo ya descargado no se puede revocar.

Desde Finanzas, **Escanear facturas** abre `/finance/scan`. Admite hasta diez PDF o fotos JPG/PNG/WebP por tanda (10 MB cada archivo), incluida la camara del movil. Los PDF se envian como `input_file` a Responses; las fotos conservan su lectura con vision. OpenAI propone datos editables; no contabiliza nada sin confirmacion. Cada borrador guarda su original privado. Se detecta el mismo archivo por SHA-256 y, al contabilizar, se impide repetir NIF + numero + tipo cuando ambos datos estan presentes. La confirmacion es atomica e idempotente.

Para permitir tambien PDF a la cuenta restringida de Decoralia, aplica `supabase/migrations/20261020_finance_pdf_uploads.sql` despues de `20261019_reviewer_invoice_uploads.sql`. Solo amplia los formatos de su propio espacio de subidas; no permite ver otros documentos, contabilizar, editar ni borrar, y no modifica movimientos economicos. El propietario puede subir PDF sin esta ampliacion.

El historial **Contabilizadas** se filtra por mes de emision de factura, con acceso a meses y anos anteriores. Emision, vencimiento y pago son fechas distintas, editables y sin reemplazo automatico por la fecha de subida. Los gastos usan la fecha de factura; los cobros reales usan la fecha de pago. Si la IA no identifica una fecha completa, pide revision en lugar de inventarla. Una factura de septiembre cobrada en octubre aparece en el historial de septiembre y en los cobros de octubre. Un PDF con varias facturas distintas requiere separar los documentos antes de contabilizar.

Un gasto confirmado registra el importe completo y si esta totalmente pagado. Un ingreso solo crea un cobro por el importe que se confirme como cobrado: una factura sin pagar no incrementa caja. La factura escaneada conserva una instantanea de los importes al contabilizar; las ediciones o cobros manuales posteriores no actualizan esa instantanea. Para caja actual, el asistente consulta los cobros/gastos actuales y no suma otra vez las facturas escaneadas. No se hacen conversiones de moneda ni se emiten facturas fiscales nuevas a partir de las fotos; los documentos rectificativos o casos ambiguos requieren revision manual. El borrador no comprueba si esa misma factura ya se registro antes manualmente: revisa las coincidencias antes de confirmar.

**Consultar con IA** usa herramientas de solo lectura sobre la sesion del usuario, sin SQL libre ni acceso administrativo. Puede consultar obras/clientes, partidas, gastos, cobros, costes fijos, documentos de venta, facturas escaneadas, notas, validaciones, medidas, mensajes y metadatos de archivos/correos. No lee el contenido de todos los adjuntos ni modifica registros. Los totales se calculan en servidor con paginacion; mas de 5000 registros exige acotar la consulta. Diferencia cobros, facturacion, presupuestos sin IVA y costes fijos previstos. Las respuestas son orientativas, no asesoramiento fiscal. Solo envia a OpenAI los datos consultados necesarios para responder; `store:false` desactiva el almacenamiento de la respuesta en Responses, sin prometer retencion cero del proveedor.

El escaner y el asistente financiero usan `OPENAI_FINANCE_MODEL` (por defecto `gpt-6-astra`). Para GPT-6 se configura razonamiento `low`, un limite de salida de 8192 tokens que incluye razonamiento y la continuacion cifrada de las llamadas a herramientas con `store:false`. `OPENAI_FINANCE_FALLBACK_MODEL` conserva `gpt-4o` como respaldo solo cuando OpenAI deniega el acceso al modelo principal; no se reintentan automaticamente errores de cuota, credenciales, formato o tiempo. El aviso de respaldo y el modelo utilizado se muestran al usuario. Los dos intentos comparten el tiempo limite de la peticion. El generador de presupuestos sigue usando su configuracion `OPENAI_MODEL`, sin cambios. Astra tiene un coste por token superior: verifica el acceso de tu cuenta y compara calidad, tiempo y consumo con documentos reales revisados antes de asumir una mejora de precision. Referencia: [modelo GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).

Verificacion sin datos reales: `node --test tests/finance-ai.test.cjs` y `node tests/access-finance-db.cjs` (PGlite en el entorno de verificacion, como los otros tests de base de datos). No sustituye una prueba de acceso con ambas cuentas en el Supabase desplegado.

### Justificantes de gastos

Los formularios de Finanzas y de cada obra suben fotos/PDF directamente al bucket privado `project-files` mediante una autorizacion temporal. La Server Action recibe solo los datos del gasto y la referencia del adjunto, evitando el limite de cuerpo de peticion para fotos de hasta 10 MB. Se comprueba el archivo en Storage antes de insertar importe y justificante juntos; el identificador estable del intento evita duplicados al reintentar.

Si falta `receipt_file_name`, `receipt_file_url` o `receipt_file_type` en `project_expenses`, ejecuta `supabase/migrations/20260601_expense_receipts.sql` en el SQL Editor de Supabase. La preparacion de la subida detecta ese caso antes de registrar gastos o subir archivos, y muestra un error recuperable en el formulario. No se necesita una migracion nueva para esta correccion.

Pruebas de regresion: `node --test tests/expense-receipts.test.cjs` (sin escribir datos reales).

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
