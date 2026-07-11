function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();

    if (body.secret !== props.getProperty('APP_SECRET')) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    var data = body.data || {};
    var action = body.action || '';
    var result = {};

    if (action === 'sendAll') {
      result.sheet = writeSheet(data, props);
      result.telegram = sendTelegramAll(data, props);
    } else if (action === 'sendToSheet') {
      result.sheet = writeSheet(data, props);
    } else if (action === 'sendToTelegram') {
      result.telegram = sendTelegramAll(data, props);
    } else {
      return jsonResponse({ ok: false, error: 'Acción no válida: ' + action });
    }

    return jsonResponse({ ok: true, result: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function writeSheet(data, props) {
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var sheet = ss.getActiveSheet();
  sheet.appendRow([
    data.nombreTecnico || '',
    data.cedula || '',
    data.cargo || '',
    data.fechaReporte || '',
    data.estado || '',
    data.proyecto || '',
    data.estacion || '',
    data.lat || '',
    data.lng || '',
    data.finAusencia || '',
    data.motivoStandBy || ''
  ]);
  return { ok: true };
}

function sendTelegramAll(data, props) {
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  var results = { message: false, json: false, xlsx: false };

  var text = buildTelegramText(data);

  if (data.photoBase64) {
    var photoBlob = Utilities.newBlob(
      Utilities.base64Decode(data.photoBase64),
      'image/jpeg',
      'foto.jpg'
    );
    var r = tgApi(token, 'sendPhoto', {
      chat_id: chatId,
      caption: text,
      parse_mode: 'Markdown',
      photo: photoBlob
    });
    results.message = r.ok;
  } else {
    var r = tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
    results.message = r.ok;
  }

  var jsonBlob = Utilities.newBlob(
    JSON.stringify(data, null, 2),
    'application/json',
    'reporte.json'
  );
  var rJson = tgApi(token, 'sendDocument', {
    chat_id: chatId,
    document: jsonBlob
  });
  results.json = rJson.ok;

  if (data.xlsxBase64) {
    var xlsxBlob = Utilities.newBlob(
      Utilities.base64Decode(data.xlsxBase64),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'reporte.xlsx'
    );
    var rXlsx = tgApi(token, 'sendDocument', {
      chat_id: chatId,
      document: xlsxBlob
    });
    results.xlsx = rXlsx.ok;
  }

  return results;
}

function buildTelegramText(data) {
  var lines = [
    '*REPORTE SITOC*',
    '',
    '*Tecnico:* ' + (data.nombreTecnico || ''),
    '*Cedula:* ' + (data.cedula || ''),
    '*Cargo:* ' + (data.cargo || ''),
    '*Fecha:* ' + (data.fechaReporte || '').replace('T', ' '),
    '*Estado:* ' + (data.estado || ''),
    '*Proyecto:* ' + (data.proyecto || ''),
    '*Sitio:* ' + (data.estacion || '')
  ];
  if (data.lat && data.lng) {
    lines.push('*Ubicacion:* ' + data.lat + ', ' + data.lng);
    lines.push('https://www.google.com/maps?q=' + data.lat + ',' + data.lng);
  }
  if (data.finAusencia) {
    lines.push('*Fin Ausencia:* ' + data.finAusencia);
  }
  if (data.motivoStandBy) {
    lines.push('*Motivo:* ' + data.motivoStandBy);
  }
  lines.push('');
  lines.push('_Generado por SITOC Clock In_');
  return lines.join('\n');
}

function tgApi(token, method, payload) {
  var url = 'https://api.telegram.org/bot' + token + '/' + method;
  var options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
