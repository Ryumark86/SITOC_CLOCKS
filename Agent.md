# SITOC Clock In - Agent Context

## Rol
Desarrollador de programas y director operativo de proyectos de telecomunicacion y facturacion con manejo de personal.

## Proposito
SPA para registro de personal operativo: captura ubicacion GPS, estado del trabajador, foto con marca de agua, y envia a Telegram + Google Sheets via proxy seguro. Funciona offline con cola de reintentos.

## Stack
- HTML5 + CSS3 + Vanilla JS (IIFE, sin frameworks)
- JSZip (CDN + fallback local) para generar .zip
- SheetJS / XLSX (CDN + fallback local) para generar .xlsx
- localStorage para historial acumulativo y cola offline
- Google Apps Script como proxy seguro (Telegram + Sheet)
- Telegram Bot API (credenciales ocultas en servidor)
- Google Apps Script (Sheet maestro)

## Arquitectura de Seguridad
```
app.js (navegador) → Google Apps Script (proxy servidor)
                        ├── Google Sheet (escritura)
                        └── Telegram API (credenciales ocultas)
```
- Credenciales de Telegram y Google Sheets almacenas en Script Properties del Apps Script
- El frontend solo conoce la URL del proxy y un APP_SECRET
- Las credenciales nunca se exponen en el navegador

## Archivos
```
SITOC_CLOCKS/
├── index.html              # Formulario responsive (mobile-first)
├── styles.css              # Estilos CSS
├── app.js                  # Logica JS del frontend (proxy + UI)
├── google-apps-script.gs   # Codigo del proxy (pegar en Google Apps Script)
├── logo-sitoc.png          # Logo SITOC en header
├── jszip.min.js            # Fallback local JSZip
├── xlsx.full.min.js        # Fallback local SheetJS
├── Agent.md                # Este archivo
└── .github/workflows/      # Deploy a GitHub Pages
```

## Formulario (index.html)

### Campos
| Campo | Tipo | Notas |
|-------|------|-------|
| Nombre del Tecnico | text | requerido |
| Numero de Cedula | text | inputmode numeric |
| Cargo | select | Supervisor, Team Leader, Tecnico, Comisionador |
| Fecha y Hora | datetime-local | readonly, se actualiza cada 60s |
| Estado | select | Opciones en orden alfabetico |
| **Proyecto** | **text** | **requerido (nuevo)** |
| Estacion / Lugar | text | requerido |
| GPS | status bar | automatico, muestra lat/lng o error |
| Fin de Ausencia | date | condicional (Vacaciones, Incapacitado, De permiso) |
| Motivo | textarea | condicional (Stand By, Sin permisos de ingreso) |
| Foto | file input | image/*, preview, marca de agua |

### Estados y campos condicionales
| Estado | Fin Ausencia | Motivo |
|--------|-------------|--------|
| De permiso | requerido | - |
| En Ruta | - | - |
| Enfermo | - | - |
| Incapacitado | requerido | - |
| Laborando | - | - |
| Sin asignacion | - | - |
| Sin permisos de ingreso | - | requerido |
| Stand By | - | requerido |
| Vacaciones | requerido | - |

## Logica del Frontend (app.js)

### Flujo principal (submit)
1. Obtener GPS (getPosition)
2. Construir datos (buildReportData)
3. Validar (validate) - incluye Proyecto
4. Si hay foto: dibujar marca de agua (drawWatermark) en canvas
5. Generar Excel array (generateExcelArray)
6. Generar ZIP (generateZip) con .json + .xlsx + foto.jpg
7. Descargar ZIP local (downloadBlob)
8. Agregar al historial localStorage (addToHistory)
9. Convertir foto y xlsx a base64
10. Enviar todo al proxy via sendToProxy('sendAll', data)
11. Si falla: guardar en cola de pendientes (addToPending)
12. Resetear formulario

### Proxy (sendToProxy)
- Envia JSON al Google Apps Script con: secret, action, data
- action: 'sendAll' (Telegram + Sheet), 'sendToSheet', o 'sendToTelegram'
- El proxy maneja Telegram API y Google Sheets internamente
- Credenciales nunca salen del servidor

### Marca de agua (drawWatermark)
- Canvas sobre la foto original
- Fondo semitransparente negro con esquinas redondeadas (roundRect)
- Texto: Tecnico, Fecha, Sitio, GPS (si disponible)
- Output: JPEG calidad 0.92

### GPS (getPosition)
- navigator.geolocation.getCurrentPosition con high accuracy
- Timeout 10s
- 6 decimales de precision
- Muestra estado en UI (obteniendo / success / error)

### Offline Queue
- localStorage key: `sitoc_pending`
- Cada entrada: { data, photoBase64, xlsxBase64, timestamp, sentOk, retries }
- Se reintenta al reconectar (evento online) y al cargar pagina si hay pendientes
- Reenvia todo al proxy (no flags individuales por servicio)
- 1s de delay entre reintentos para evitar rate limiting
- Limite de almacenamiento: alerta si QuotaExceededError

### Historial (localStorage)
- key: `sitoc_history`
- Array de objetos data (sin fotos ni xlsx)
- Actualiza contador en UI
- Descarga Excel maestro con todos los reportes (generateMasterExcel)
- Boton para limpiar historial

## Google Apps Script (google-apps-script.gs)

### Variables de Script (Script Properties)
| Variable | Valor |
|----------|-------|
| TELEGRAM_BOT_TOKEN | Token del bot de Telegram |
| TELEGRAM_CHAT_ID | ID del grupo de Telegram |
| APP_SECRET | Token secreto de la app |
| SPREADSHEET_ID | ID del Google Sheet |

### Endpoints
- `doPost(e)` - Recibe JSON con { secret, action, data }
- Valida APP_SECRET antes de procesar
- Retorna JSON con { ok, result }

### Funciones
| Funcion | Proposito |
|---------|-----------|
| doPost | Punto de entrada, valida secret, enruta accion |
| writeSheet | Escribe fila en Google Sheet |
| sendTelegramAll | Envia mensaje + JSON + XLSX a Telegram |
| buildTelegramText | Formatea mensaje Markdown |
| tgApi | Helper para llamadas a Telegram Bot API |

### Acciones soportadas
| action | Descripcion |
|--------|-------------|
| sendAll | Escribe en Sheet + envia a Telegram |
| sendToSheet | Solo escribe en Sheet |
| sendToTelegram | Solo envia a Telegram |

## Credenciales
- Telegram Bot Token: en Script Properties (NO en frontend)
- Telegram Chat ID: en Script Properties (NO en frontend)
- Google Sheets ID: en Script Properties
- APP_SECRET: en Script Properties y en app.js (mismo valor)

## Convenciones de codigo
- Sin comentarios en el codigo
- Nombres de variables en camelCase
- Var en lugar de let/const (ES5 compatible)
- Promesas con async/await
- Event listeners con addEventListener
- Fetch API para HTTP
- Canvas 2D para marca de agua
- localStorage para persistencia
- IIFE para aislamiento

---

## HISTORIAL DE SESIONES

### Sesion 1 (11 julio 2026): Blindaje de seguridad + ReconexGoogle Sheet

**Objetivo:** Hacer segura la app eliminando credenciales del frontend y reconectando a un Google Sheet nuevo.

**Cambios realizados:**
1. Creado `google-apps-script.gs` - proxy completo (Telegram + Sheet)
2. Modificado `index.html` - campo Proyecto agregado despues de Estado
3. Modificado `app.js`:
   - Eliminadas credenciales (BOT_TOKEN, CHAT_ID, TELEGRAM_BASE, GOOGLE_SHEET_URL, GOOGLE_SHEET_TOKEN)
   - Agregadas variables PROXY_URL y APP_SECRET
   - Creada funcion sendToProxy()
   - Reemplazadas funciones de Telegram (sendTelegramMessage, sendTelegramJson, sendTelegramXlsx) por una sola llamada al proxy
   - Simplificada cola offline (de 4 flags a 1 solo sentOk)
   - Agregado campo Proyecto en: buildReportData, validate, buildTextMessage, generateExcelArray, generateMasterExcel
4. Actualizado `Agent.md` con nueva arquitectura
5. Creado `DOCUMENTACION_SITOC.md` con documentacion completa
6. Creado `.gitignore`
7. Subido todo a GitHub: https://github.com/Ryumark86/SITOC_CLOCKS

**Google Sheet nuevo:**
- URL: https://docs.google.com/spreadsheets/d/1gdxPF7h7DZx8SXuv-wLLOHFfrTrCXhSPd1bXzRF0pbQ/edit
- Spreadsheet ID: 1gdxPF7h7DZx8SXuv-wLLOHFfrTrCXhSPd1bXzRF0pbQ
- Encabezados: Nombre del Tecnico | Cedula | Cargo | Fecha del Reporte | Estado | Proyecto | Estacion / Lugar | Latitud | Longitud | Fin de Ausencia | Motivo Stand By

**Google Apps Script:**
- Proyecto: SITOC-Proxy
- Deploy URL: https://script.google.com/macros/s/AKfycbxRjR4_zgkTBnLIJiuMoT9eegt1P6rRhPwsnk4VSZszUHda7kTIJGgsZs3q9fONIQAFWg/exec
- Credenciales en Script Properties (no en codigo)

**Telegram:**
- Bot: mismo bot anterior (8840403500:AAEq...)
- Chat ID: -5327203234

**GitHub:**
- Repo: https://github.com/Ryumark86/SITOC_CLOCKS
- Pages: https://ryumark86.github.io/SITOC_CLOCKS/
- Deploy automatico via GitHub Actions

**Estado actual:** Todo funcionando. Probado y verificado (Sheet + Telegram OK).

### Pendiente para proxima sesion:

**Conexion de API externa para datos de proyecto:**
- El usuario quiere conectar una API de otro programa para traer tipo y nombre de proyecto
- Aun no ha especificado que API es
- La conexion debe hacerse a traves del proxy (Google Apps Script) para mantener la seguridad
- Plan: el frontend envia un ID de proyecto al proxy, el proxy consulta la API externa y retorna solo tipo y nombre

**Preguntas pendientes para el usuario:**
1. Que API externa es? (nombre, URL)
2. Como se autentica? (API key, token, OAuth)
3. Que datos exactos retorna?
4. Como se selecciona el proyecto en la interfaz? (manual, lista, busqueda)

**Credenciales del usuario:**
- Archivo CREDENCIALES_SEGURAS.txt creado (en .gitignore, NO subido a GitHub)
- El usuario debe copiar los datos a un lugar seguro y borrar el archivo

---
