(function () {
    'use strict';

    // ---- Proxy Configuration ----
    var PROXY_URL = 'https://script.google.com/macros/s/AKfycbxRjR4_zgkTBnLIJiuMoT9eegt1P6rRhPwsnk4VSZszUHda7kTIJGgsZs3q9fONIQAFWg/exec';
    var APP_SECRET = 'sitoc_2026_blindaje';

    // ---- Proxy ----
    async function sendToProxy(action, data) {
        if (!PROXY_URL) {
            throw new Error('PROXY_URL no configurado. Pegue la URL del Google Apps Script en app.js.');
        }
        var payload = {
            secret: APP_SECRET,
            action: action,
            data: data
        };
        await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
    }

    // ---- DOM refs ----
    var form = document.getElementById('reportForm');
    var estado = document.getElementById('estado');
    var ausenciaGroup = document.getElementById('ausencia-group');
    var motivoGroup = document.getElementById('motivo-group');
    var fechaInput = document.getElementById('fecha');
    var btnSubmit = document.getElementById('btnSubmit');
    var btnDownloadHistory = document.getElementById('btnDownloadHistory');
    var btnClearHistory = document.getElementById('btnClearHistory');
    var historyCount = document.getElementById('historyCount');
    var fotoInput = document.getElementById('foto');
    var photoPreview = document.getElementById('photoPreview');
    var photoPreviewImg = document.getElementById('photoPreviewImg');
    var photoPlaceholder = document.getElementById('photoPlaceholder');
    var btnRemovePhoto = document.getElementById('btnRemovePhoto');

    var gpsStatus = document.getElementById('gpsStatus');
    var gpsText = document.getElementById('gpsText');

    var selectedPhotoFile = null;
    var currentCoords = null;

    var STORAGE_HISTORY_KEY = 'sitoc_history';

    // ---- History (localStorage) ----

    function loadHistory() {
        try {
            var raw = localStorage.getItem(STORAGE_HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveHistory(history) {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    }

    function addToHistory(report) {
        var h = loadHistory();
        h.push(report);
        saveHistory(h);
        updateHistoryUI();
    }

    function clearHistory() {
        if (confirm('¿Eliminar todos los reportes del historial local?')) {
            localStorage.removeItem(STORAGE_HISTORY_KEY);
            updateHistoryUI();
        }
    }

    function updateHistoryUI() {
        var h = loadHistory();
        var count = h.length;
        historyCount.textContent = count + ' reporte' + (count !== 1 ? 's' : '') + ' registrado' + (count !== 1 ? 's' : '');
    }

    // ---- Offline Queue ----

    var STORAGE_PENDING_KEY = 'sitoc_pending';
    var _processingQueue = false;

    function loadPending() {
        try {
            var raw = localStorage.getItem(STORAGE_PENDING_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function savePending(queue) {
        localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(queue));
    }

    function addToPending(entry) {
        var q = loadPending();
        q.push(entry);
        try {
            savePending(q);
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                alert('Almacenamiento local lleno. No se puede guardar el reporte pendiente. Sincronice los pendientes actuales primero.');
                return;
            }
            throw e;
        }
        actualizarUIPendientes();
    }

    function removeFromPending(index) {
        var q = loadPending();
        q.splice(index, 1);
        savePending(q);
        actualizarUIPendientes();
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function (e) {
                resolve(e.target.result.split(',')[1]);
            };
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBlob(b64, type) {
        var byteChars = atob(b64);
        var byteNums = new Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
        }
        var byteArr = new Uint8Array(byteNums);
        return new Blob([byteArr], { type: type || 'image/jpeg' });
    }

    function xlsxToBase64(xlsxArr) {
        var chars = '';
        for (var i = 0; i < xlsxArr.length; i++) {
            chars += String.fromCharCode(xlsxArr[i]);
        }
        return btoa(chars);
    }

    function base64ToXlsx(b64) {
        var binary = atob(b64);
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function mostrarToast(mensaje, tipo) {
        tipo = tipo || 'info';
        var existing = document.getElementById('toast');
        if (!existing) return;
        existing.textContent = mensaje;
        existing.className = 'toast ' + tipo;
        existing.classList.remove('hidden');
        setTimeout(function () {
            existing.classList.add('hidden');
        }, 4000);
    }

    async function procesarColaPendiente() {
        if (_processingQueue) return;
        _processingQueue = true;

        var btnRetry = document.getElementById('btnRetryPending');
        if (btnRetry) btnRetry.disabled = true;

        var q = loadPending();
        var anySuccess = false;

        for (var i = q.length - 1; i >= 0; i--) {
            if (!navigator.onLine) break;

            var entry = q[i];
            var proxyData = Object.assign({}, entry.data, {
                photoBase64: entry.photoBase64,
                xlsxBase64: entry.xlsxBase64
            });

            try {
                await sendToProxy('sendAll', proxyData);
                entry.sentOk = true;
            } catch (e) {
                console.warn('Retry proxy falló:', e.message);
            }

            if (entry.sentOk) {
                q.splice(i, 1);
                anySuccess = true;
            } else {
                entry.retries = (entry.retries || 0) + 1;
            }

            if (q.length > 1) {
                await new Promise(function (resolve) { setTimeout(resolve, 1000); });
            }
        }

        savePending(q);
        actualizarUIPendientes();

        if (btnRetry) btnRetry.disabled = false;
        _processingQueue = false;

        if (anySuccess) {
            mostrarToast('✅ Reporte(s) sincronizado(s) correctamente', 'success');
        } else if (q.length > 0 && navigator.onLine) {
            mostrarToast('⚠️ No se pudieron sincronizar algunos reportes. Reintentará más tarde.', 'warning');
        }
    }

    function renderPendingList() {
        var container = document.getElementById('pendingList');
        if (!container) return;
        var q = loadPending();
        if (q.length === 0 || container.classList.contains('hidden')) {
            container.innerHTML = '';
            return;
        }
        var html = '';
        for (var i = 0; i < q.length; i++) {
            var entry = q[i];
            var d = entry.data || {};
            var failText = entry.sentOk ? '' : '❌ Pendiente de envío';
            var dateStr = (d.fechaReporte || '').replace('T', ' ') || (entry.timestamp || '').slice(0, 16).replace('T', ' ');
            html += '<div class="pending-item">' +
                '<div class="pending-item-info">' +
                '<div class="pending-item-name">' + (d.nombreTecnico || '—') + '</div>' +
                '<div class="pending-item-detail">' + dateStr + ' · ' + (d.estacion || '') + '</div>' +
                (failText ? '<div class="pending-item-fail">' + failText + '</div>' : '') +
                '</div>' +
                '<button type="button" class="btn-pending-delete" data-index="' + i + '">Eliminar</button>' +
                '</div>';
        }
        html += '<button type="button" class="btn-pending-clear-all" id="btnClearAllPending">Eliminar todos</button>';
        container.innerHTML = html;
    }

    function togglePendingList() {
        var container = document.getElementById('pendingList');
        if (!container) return;
        container.classList.toggle('hidden');
        if (!container.classList.contains('hidden')) {
            renderPendingList();
        }
    }

    function actualizarUIPendientes() {
        var q = loadPending();
        var count = q.length;
        var bar = document.getElementById('pendingBar');
        var countEl = document.getElementById('pendingCount');
        var btnRetry = document.getElementById('btnRetryPending');
        if (bar) bar.classList.toggle('hidden', count === 0);
        if (countEl) countEl.textContent = count + ' envío' + (count !== 1 ? 's' : '') + ' pendiente' + (count !== 1 ? 's' : '');
        if (btnRetry) btnRetry.textContent = 'Reintentar ahora' + (count > 0 ? ' (' + count + ')' : '');
        // Ocultar lista si ya no hay pendientes
        var container = document.getElementById('pendingList');
        if (container && count === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    }

    // ---- End Offline Queue ----

    function generateMasterExcel() {
        var h = loadHistory();
        var headers = ['Nombre del Técnico', 'Cédula', 'Cargo', 'Fecha del Reporte', 'Estado', 'Proyecto', 'Estación / Lugar', 'Latitud', 'Longitud', 'Fin de Ausencia', 'Motivo Stand By'];
        var wsData = [headers];

        for (var i = 0; i < h.length; i++) {
            var r = h[i];
            wsData.push([
                r.nombreTecnico || '',
                r.cedula || '',
                r.cargo || '',
                r.fechaReporte || '',
                r.estado || '',
                r.proyecto || '',
                r.estacion || '',
                r.lat || '',
                r.lng || '',
                r.finAusencia || '',
                r.motivoStandBy || ''
            ]);
        }

        var ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 30 }
        ];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Historial');
        var xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(blob, 'historial_sitoc_completo.xlsx');
    }

    // ---- GPS ----

    function getPosition() {
        return new Promise(function (resolve) {
            if (!navigator.geolocation) {
                gpsStatus.className = 'gps-status error';
                gpsText.textContent = 'GPS no disponible en este navegador';
                resolve(null);
                return;
            }
            gpsStatus.className = 'gps-status';
            gpsText.textContent = 'Obteniendo ubicación...';
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    currentCoords = {
                        lat: pos.coords.latitude.toFixed(6),
                        lng: pos.coords.longitude.toFixed(6)
                    };
                    gpsStatus.className = 'gps-status success';
                    gpsText.textContent = currentCoords.lat + ', ' + currentCoords.lng;
                    resolve(currentCoords);
                },
                function (err) {
                    console.warn('GPS error:', err.message);
                    gpsStatus.className = 'gps-status error';
                    gpsText.textContent = 'Error: ' + err.message;
                    resolve(null);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    // ---- Helpers ----
    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function formatDateTimeLocal(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
            pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function setDefaultDateTime() {
        fechaInput.value = formatDateTimeLocal(new Date());
    }

    function toggleConditionalFields() {
        var val = estado.value;
        var showAusencia = ['Vacaciones', 'Incapacitado', 'De permiso'].includes(val);
        var showMotivo = val === 'Stand By' || val === 'Sin permisos de ingreso';

        ausenciaGroup.classList.toggle('hidden', !showAusencia);
        motivoGroup.classList.toggle('hidden', !showMotivo);

        if (!showAusencia) document.getElementById('finAusencia').value = '';
        if (!showMotivo) document.getElementById('motivo').value = '';
    }

    function sanitizeName(name) {
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '_');
    }

    function buildReportData() {
        var data = {
            nombreTecnico: document.getElementById('nombre').value.trim(),
            cedula: document.getElementById('cedula').value.trim(),
            cargo: document.getElementById('cargo').value.trim(),
            fechaReporte: fechaInput.value,
            estado: estado.value,
            proyecto: document.getElementById('proyecto').value.trim(),
            estacion: document.getElementById('estacion').value.trim(),
            lat: currentCoords ? currentCoords.lat : '',
            lng: currentCoords ? currentCoords.lng : ''
        };

        if (['Vacaciones', 'Incapacitado', 'De permiso'].includes(data.estado)) {
            data.finAusencia = document.getElementById('finAusencia').value;
        }

        if (data.estado === 'Stand By' || data.estado === 'Sin permisos de ingreso') {
            data.motivoStandBy = document.getElementById('motivo').value.trim();
        }

        return data;
    }

    function validate(data) {
        if (!data.nombreTecnico) { alert('Ingrese el nombre del técnico.'); return false; }
        if (!data.cedula) { alert('Ingrese el número de cédula.'); return false; }
        if (!data.cargo) { alert('Seleccione el cargo.'); return false; }
        if (!data.fechaReporte) { alert('Error con la fecha del reporte.'); return false; }
        if (!data.estado) { alert('Seleccione un estado.'); return false; }
        if (!data.proyecto) { alert('Ingrese el nombre del proyecto.'); return false; }
        if (!data.estacion) { alert('Ingrese la estación o lugar.'); return false; }

        if (['Vacaciones', 'Incapacitado', 'De permiso'].includes(data.estado) && !data.finAusencia) {
            alert('Indique la fecha de fin de ausencia.');
            return false;
        }

        if ((data.estado === 'Stand By' || data.estado === 'Sin permisos de ingreso') && !data.motivoStandBy) {
            alert('Indique el motivo.');
            return false;
        }

        return true;
    }

    function buildTextMessage(data) {
        var lines = [
            '📋 *REPORTE SITOC*',
            '',
            '👤 *Técnico:* ' + data.nombreTecnico,
            '🆔 *Cédula:* ' + data.cedula,
            '💼 *Cargo:* ' + data.cargo,
            '📅 *Fecha:* ' + data.fechaReporte.replace('T', ' '),
            '📍 *Estado:* ' + data.estado,
            '📁 *Proyecto:* ' + data.proyecto,
            '🏢 *Sitio:* ' + data.estacion
        ];
        if (data.lat && data.lng) {
            lines.push('🌐 *Ubicación:* ' + data.lat + ', ' + data.lng);
            lines.push('🔗 https://www.google.com/maps?q=' + data.lat + ',' + data.lng);
        }
        if (data.finAusencia) {
            lines.push('📆 *Fin Ausencia:* ' + data.finAusencia);
        }
        if (data.motivoStandBy) {
            lines.push('❓ *Motivo:* ' + data.motivoStandBy);
        }
        lines.push('');
        lines.push('_Generado por SITOC Clock In_');
        return lines.join('\n');
    }

    function drawWatermark(img, nombre, fecha, sitio, coords) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        var MAX_W = 1200;
        var scale = Math.min(MAX_W / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        var fontSize = Math.max(14, canvas.width * 0.035);
        ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';

        var textLines = [
            'Técnico: ' + nombre,
            'Fecha: ' + fecha,
            'Sitio: ' + sitio
        ];
        if (coords) {
            textLines.push('GPS: ' + coords.lat + ', ' + coords.lng);
        }

        var lineHeight = fontSize * 1.5;
        var padding = fontSize * 0.6;
        var margin = fontSize * 0.5;

        var maxTextWidth = 0;
        for (var i = 0; i < textLines.length; i++) {
            var w = ctx.measureText(textLines[i]).width;
            if (w > maxTextWidth) maxTextWidth = w;
        }

        var boxX = margin;
        var boxY = canvas.height - margin - (textLines.length * lineHeight) - padding * 2;
        var boxW = maxTextWidth + padding * 2;
        var boxH = (textLines.length * lineHeight) + padding * 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        for (var j = 0; j < textLines.length; j++) {
            ctx.fillText(textLines[j], boxX + padding, boxY + padding + (j * lineHeight) + fontSize / 2);
        }

        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                resolve(blob);
            }, 'image/jpeg', 0.92);
        });
    }

    function generateExcelArray(data) {
        var wsData = [
            ['Nombre del Técnico', 'Cédula', 'Cargo', 'Fecha del Reporte', 'Estado', 'Proyecto', 'Estación / Lugar', 'Latitud', 'Longitud', 'Fin de Ausencia', 'Motivo Stand By'],
            [
                data.nombreTecnico,
                data.cedula,
                data.cargo,
                data.fechaReporte,
                data.estado,
                data.proyecto,
                data.estacion,
                data.lat || '',
                data.lng || '',
                data.finAusencia || '',
                data.motivoStandBy || ''
            ]
        ];
        var ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 30 }
        ];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
        return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    }

    // ---- ZIP generation (local download) ----
    async function generateZip(data, photoBlob) {
        var safeName = sanitizeName(data.nombreTecnico);
        var datePart = data.fechaReporte.split('T')[0];
        var baseFilename = safeName + '_' + datePart;

        var zip = new JSZip();
        zip.file(baseFilename + '.json', JSON.stringify(data, null, 2));

        var xlsxData = generateExcelArray(data);
        zip.file(baseFilename + '.xlsx', xlsxData);

        if (photoBlob) {
            zip.file(baseFilename + '_foto.jpg', photoBlob);
        }

        var blob = await zip.generateAsync({ type: 'blob' });
        return { blob: blob, filename: baseFilename + '.zip', base: baseFilename };
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    // ---- Telegram API ----

    function resetForm() {
        form.reset();
        setDefaultDateTime();
        ausenciaGroup.classList.add('hidden');
        motivoGroup.classList.add('hidden');
        selectedPhotoFile = null;
        photoPreview.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
        currentCoords = null;
        gpsStatus.className = 'gps-status';
        gpsText.textContent = 'Obteniendo ubicación...';
        getPosition();
    }

    // ---- Event listeners ----

    // Photo input
    fotoInput.addEventListener('change', function () {
        var file = fotoInput.files[0];
        if (!file) {
            selectedPhotoFile = null;
            photoPreview.classList.add('hidden');
            photoPlaceholder.classList.remove('hidden');
            return;
        }
        selectedPhotoFile = file;
        var reader = new FileReader();
        reader.onload = function (e) {
            photoPreviewImg.src = e.target.result;
            photoPreview.classList.remove('hidden');
            photoPlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });

    btnRemovePhoto.addEventListener('click', function () {
        fotoInput.value = '';
        selectedPhotoFile = null;
        photoPreview.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
    });

    estado.addEventListener('change', toggleConditionalFields);

    // History buttons
    btnDownloadHistory.addEventListener('click', function () {
        if (typeof XLSX === 'undefined') {
            alert('Error: Librería XLSX no cargada.');
            return;
        }
        generateMasterExcel();
    });

    btnClearHistory.addEventListener('click', clearHistory);

    // Retry pending
    document.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'btnRetryPending') {
            if (loadPending().length === 0) {
                alert('No hay envíos pendientes.');
                return;
            }
            procesarColaPendiente();
        }
    });

    // View pending list
    document.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'btnViewPending') {
            togglePendingList();
        }
    });

    // Delete individual pending
    document.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('btn-pending-delete')) {
            var idx = parseInt(e.target.getAttribute('data-index'), 10);
            if (!isNaN(idx)) {
                removeFromPending(idx);
                renderPendingList();
            }
        }
    });

    // Clear all pending
    document.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'btnClearAllPending') {
            if (confirm('¿Eliminar todos los envíos pendientes?')) {
                savePending([]);
                actualizarUIPendientes();
            }
        }
    });

    // Form submit
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (typeof JSZip === 'undefined' || typeof XLSX === 'undefined') {
            alert('Error: No se pudieron cargar las librerías necesarias. Verifique su conexión a internet.');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Obteniendo ubicación...';

        await getPosition();

        var data = buildReportData();
        if (!validate(data)) { btnSubmit.disabled = false; btnSubmit.textContent = 'Generar Reporte'; return; }

        btnSubmit.textContent = 'Generando...';

        try {
            var photoBlob = null;
            if (selectedPhotoFile) {
                var img = new Image();
                await new Promise(function (resolve, reject) {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = URL.createObjectURL(selectedPhotoFile);
                });
                var fechaFormateada = data.fechaReporte.replace('T', ' ');
                photoBlob = await drawWatermark(img, data.nombreTecnico, fechaFormateada, data.estacion, currentCoords);
                URL.revokeObjectURL(img.src);
            }

            var xlsxData = generateExcelArray(data);
            var result = await generateZip(data, photoBlob);
            downloadBlob(result.blob, result.filename);

            addToHistory(data);

            var photoBase64 = photoBlob ? await blobToBase64(photoBlob) : null;
            var xlsxBase64 = xlsxToBase64(xlsxData);

            var proxyData = Object.assign({}, data, {
                photoBase64: photoBase64,
                xlsxBase64: xlsxBase64
            });

            var proxyOk = false;
            try {
                await sendToProxy('sendAll', proxyData);
                proxyOk = true;
            } catch (e) {
                console.warn('Proxy error:', e.message);
            }

            if (!proxyOk) {
                addToPending({
                    data: data,
                    photoBase64: photoBase64,
                    xlsxBase64: xlsxBase64,
                    timestamp: new Date().toISOString(),
                    sentOk: false,
                    retries: 0
                });
            }

            resetForm();
            var pending = loadPending().length;
            var msg = 'Reporte generado: ' + result.filename + '\n📊 Historial: ' + loadHistory().length + ' reportes';
            msg += proxyOk ? '\n✅ Enviado correctamente (Telegram + Sheet)' : '\n⚠️ Envío fallido. Se reintentará automáticamente.';
            if (pending > 0) {
                msg += '\n📤 Pendiente de envío: ' + pending + ' reporte(s)';
            }
            alert(msg);
        } catch (err) {
            console.error(err);
            resetForm();
            alert('Error al generar el reporte: ' + err.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Generar Reporte';
        }
    });

    // Init
    updateHistoryUI();
    actualizarUIPendientes();
    setDefaultDateTime();
    toggleConditionalFields();
    getPosition();
    setInterval(setDefaultDateTime, 60000);

    // Online / offline queue processing
    window.addEventListener('online', function () {
        mostrarToast('📶 Conexión restaurada. Reenviando reportes pendientes...', 'info');
        procesarColaPendiente();
    });

    // Procesar cola al cargar la página si hay pendientes
    if (loadPending().length > 0) {
        setTimeout(function () {
            if (navigator.onLine) {
                mostrarToast('📶 Reanudando envíos pendientes...', 'info');
                procesarColaPendiente();
            }
        }, 2000);
    }
})();
