import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, LOCATIONS } from '../src/db/seedData.js';
import { BusinessRuleError, ForbiddenError } from '../src/domain/errors.js';
import { CASE_TIMELINE, CHECKLISTS, caseStateOf, checklistFor, impactLevel } from '../src/domain/pipeline.js';
import { SOURCES } from '../src/domain/sources.js';
import { getAsset, getPipelineMap, isolateAsset, releaseAsset } from '../src/services/assetService.js';
import { recordHistory } from '../src/services/historyService.js';
import { verifyLedger } from '../src/services/ledgerService.js';
import { advanceIncident, createIncident, decideIncident } from '../src/services/incidentService.js';
import { closeRound, recordCheck, startRound } from '../src/services/roundService.js';
import { baseIncident, closeStageActions, setup } from './helpers.js';
import { EMAILS, startServer } from './httpHelpers.js';

const assetId = async (db, codigo) => (await db.one('SELECT id FROM activos WHERE codigo = $1', [codigo])).id;
const isolatedCodes = async (db) => (await db.many('SELECT codigo FROM activos WHERE aislado ORDER BY codigo')).map((r) => r.codigo);
const allPoints = (element) => checklistFor(element).map((_, i) => i);
const OK_TI = { resultado: 'ok', confirmados: allPoints({ tipo: 'sistema', red: 'TI' }) };
const OK_TRAMO = { resultado: 'ok', confirmados: allPoints({ tipo: 'tramo' }) };

/** Incidente registrado y llevado hasta D1 = Sí (red OT detenida). */
async function incidentWithOtStopped(db, users) {
  let detail = await createIncident(db, await baseIncident(db), users.coordinador);
  await closeStageActions(db, detail, users.coordinador);
  detail = await advanceIncident(db, detail.id, {}, users.coordinador);
  await closeStageActions(db, detail, users.coordinador);
  return decideIncident(db, detail.id, { respuesta: true, justificacion: 'Riesgo de propagación a SCADA' }, users.coordinador);
}

describe('Red del oleoducto con fuentes', () => {
  test('cada instalación, tramo, sistema, punto de verificación y día del caso cita fuentes existentes', () => {
    const cited = [
      ...LOCATIONS.map((l) => [l.codigo, l.fuentes]),
      ...ASSETS.map((a) => [a.codigo, a.fuentes]),
      ...Object.values(CHECKLISTS).flat().map((c) => [c.texto, c.fuentes]),
      ...CASE_TIMELINE.map((d) => [d.fecha, d.fuentes]),
    ];
    for (const [what, fuentes] of cited) {
      assert.ok(fuentes?.length > 0, `${what} no tiene fuente`);
      for (const key of fuentes) assert.ok(SOURCES[key], `${what} cita una fuente desconocida: ${key}`);
    }
    for (const source of Object.values(SOURCES)) assert.match(source.url, /^https:\/\//);
  });

  test('los tramos unen instalaciones existentes y solo llevan datos publicados', () => {
    const codes = new Set(LOCATIONS.map((l) => l.codigo));
    for (const t of ASSETS.filter((a) => a.tipo === 'tramo')) {
      for (const code of [t.desde, t.hasta, ...t.paradas]) assert.ok(codes.has(code), `${t.codigo}: ${code} no existe`);
      if (t.linea === 'LAT') assert.equal(t.capacidad, null, `${t.codigo}: la capacidad de los ramales no es pública`);
    }
    const capacity = Object.fromEntries(ASSETS.filter((a) => a.linea && a.linea !== 'LAT').map((a) => [a.linea, a.capacidad]));
    assert.deepEqual(capacity, { L1: 1_500_000, L2: 1_200_000, L3: 885_000, L4: 700_000 });
  });

  test('la base tiene la red completa: de Houston a Linden, con coordenadas válidas', async () => {
    const { db } = await setup();
    const { total } = await db.one('SELECT count(*) AS total FROM activos');
    assert.equal(total, ASSETS.length);
    const ends = await db.many(`SELECT codigo, tipo FROM ubicaciones WHERE tipo IN ('origen', 'terminal') ORDER BY longitud`);
    assert.deepEqual(ends.map((e) => e.codigo), ['HOU', 'LIN']);
    await assert.rejects(
      db.query(`UPDATE ubicaciones SET fuentes = '{}' WHERE codigo = 'HOU'`),
      /ck_ubicaciones_fuentes/,
      'una instalación sin fuente se rechaza'
    );
  });
});

describe('Impacto y escala de calor', () => {
  test('el calor sale de la capacidad publicada; sin dato no se inventa', () => {
    const stopped = (capacidad_bpd, extra = {}) => impactLevel({ tipo: 'tramo', capacidad_bpd, servicio_estado: 'afectado', ...extra });
    assert.deepEqual([1_500_000, 1_200_000, 885_000, 700_000].map((c) => stopped(c)), [5, 4, 3, 3]);
    assert.equal(stopped(null), null);
    assert.equal(stopped(1_500_000, { servicio_estado: 'operativo' }), 0);
    assert.equal(stopped(1_500_000, { servicio_estado: 'operativo', aislado: true }), 5);
    assert.equal(stopped(1_500_000, { servicio_estado: 'en_recuperacion' }), 1);
    assert.equal(impactLevel({ tipo: 'sistema', servicio_estado: 'afectado' }), null);
  });

  test('la reproducción del caso sigue lo publicado día por día', () => {
    const lateral = { tipo: 'tramo', codigo: 'LAT-NAS', linea: 'LAT' };
    const line4 = { tipo: 'tramo', codigo: 'L4-T3', linea: 'L4' };
    const line1 = { tipo: 'tramo', codigo: 'L1-T1', linea: 'L1' };
    const day = (fecha) => CASE_TIMELINE.find((d) => d.fecha === fecha);
    assert.equal(caseStateOf(day('2021-05-07'), lateral), 'detenido');
    assert.equal(caseStateOf(day('2021-05-09'), lateral), 'parcial');
    assert.equal(caseStateOf(day('2021-05-09'), line1), 'detenido');
    assert.equal(caseStateOf(day('2021-05-10'), line4), 'manual');
    assert.equal(caseStateOf(day('2021-05-10'), line1), 'detenido');
    assert.equal(caseStateOf(day('2021-05-13'), line1), 'operativo');
  });
});

describe('Aislamiento automático', () => {
  test('al registrar el incidente se aíslan los sistemas de los servicios afectados', async () => {
    const { db, users } = await setup();
    const detail = await createIncident(db, await baseIncident(db), users.coordinador);
    assert.deepEqual(await isolatedCodes(db), ['FACT-SIS', 'VPN-LEGADA']);
    const vpn = await getAsset(db, await assetId(db, 'VPN-LEGADA'));
    assert.match(vpn.aislado_motivo, /^Aislamiento automático: desconectado de la red al quedar afectado TI-VPN/);
    assert.equal(vpn.estado, 'aislado');
    const events = await db.many(`SELECT evento FROM historial_recuperacion WHERE incidente_id = $1 AND evento = 'activo_aislado'`, [detail.id]);
    assert.equal(events.length, 2);
  });

  test('D1 = Sí detiene toda la red, como el 7 de mayo: tramos, ramales y SCADA aislados', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const isolated = await isolatedCodes(db);
    assert.equal(isolated.length, ASSETS.length, 'todos los elementos quedan aislados');
    const map = await getPipelineMap(db);
    assert.equal(map.resumen.lineasDetenidas, 4);
    const l1 = map.tramos.find((t) => t.codigo === 'L1-T1');
    assert.match(l1.aislado_motivo, /válvulas cerradas/);
    assert.equal(l1.nivelCalor, 5);
    assert.equal(l1.bpdDetenidos, 1_500_000);
    assert.equal(map.tramos.find((t) => t.codigo === 'LAT-NAS').nivelCalor, null);
  });
});

describe('Aislamiento manual y reconexión', () => {
  test('cada rol solo aísla elementos de su red', async () => {
    const { db, users } = await setup();
    const line3 = await assetId(db, 'L3-T3');
    const motivo = 'Caída de presión no explicada en el tramo';
    await assert.rejects(isolateAsset(db, line3, { motivo }, users.legal), ForbiddenError);
    await assert.rejects(isolateAsset(db, line3, { motivo }, users.analistaTi), ForbiddenError);
    const result = await isolateAsset(db, line3, { motivo }, users.operadorOt);
    assert.equal(result.aislado, true);
    assert.equal(result.aislado_por_nombre, 'Lucía Paredes');
    assert.equal(result.nivelCalor, 3);
    await assert.rejects(isolateAsset(db, line3, { motivo: 'Segundo intento de aislamiento' }, users.operadorOt), BusinessRuleError);
  });

  test('no se reconecta sin una verificación OK, con todos los puntos, posterior al aislamiento', async () => {
    const { db, users } = await setup();
    await createIncident(db, await baseIncident(db), users.coordinador);
    const vpn = await assetId(db, 'VPN-LEGADA');
    await assert.rejects(releaseAsset(db, vpn, {}, users.analistaTi), /ronda de verificación/);

    let round = await startRound(db, { alcance: 'aislados' }, users.analistaTi);
    assert.equal(round.items.length, 2);
    assert.equal(round.items[0].checklist.length, 4);
    round = await recordCheck(db, round.id, vpn, { resultado: 'falla', nota: 'El perfil heredado sigue habilitado' }, users.analistaTi);
    await assert.rejects(releaseAsset(db, vpn, {}, users.analistaTi), /ronda de verificación/);

    await assert.rejects(recordCheck(db, round.id, vpn, { resultado: 'ok', confirmados: [0, 1] }, users.analistaTi), /Falta: Parches críticos/);
    await assert.rejects(recordCheck(db, round.id, vpn, { resultado: 'ok', confirmados: [0, 1, 2, 3, 7] }, users.analistaTi), /tiene 4 puntos/);
    await recordCheck(db, round.id, vpn, OK_TI, users.analistaTi);
    const released = await releaseAsset(db, vpn, { nota: 'Perfil eliminado; acceso solo con MFA' }, users.analistaTi);
    assert.equal(released.aislado, false);
    assert.equal(released.historial[0].evento, 'activo_liberado');
  });
});

describe('Rondas de verificación', () => {
  test('una ronda por línea no se cierra con elementos pendientes y registra el resumen', async () => {
    const { db, users } = await setup();
    const round = await startRound(db, { alcance: 'linea', valor: 'L1' }, users.operadorOt);
    assert.deepEqual(round.items.map((i) => i.codigo), ['L1-T1', 'L1-T2']);
    assert.match(round.items[0].checklist[0].texto, /Derecho de vía/);
    await assert.rejects(closeRound(db, round.id, users.operadorOt), /Faltan 2 elemento/);

    await recordCheck(db, round.id, round.items[0].activo_id, OK_TRAMO, users.operadorOt);
    await recordCheck(db, round.id, round.items[1].activo_id, { resultado: 'observado', confirmados: [0, 1], nota: 'Falta probar la operación manual' }, users.operadorOt);
    await assert.rejects(closeRound(db, round.id, users.analistaTi), /Solo quien inició la ronda/);
    const closed = await closeRound(db, round.id, users.operadorOt);
    assert.ok(closed.cerrada_en);
    assert.equal(closed.ok, 1);
    assert.equal(closed.observados, 1);
    assert.deepEqual(closed.items[1].confirmados, [0, 1]);
    await assert.rejects(recordCheck(db, round.id, round.items[0].activo_id, OK_TRAMO, users.operadorOt), /ya está cerrada/);
  });

  test('cada elemento lo verifica el rol de su red y lo observado exige nota', async () => {
    const { db, users } = await setup();
    const round = await startRound(db, { alcance: 'servicio', valor: 'OT-SCADA' }, users.coordinador);
    const scada = round.items.find((i) => i.codigo === 'SCADA-CTL');
    assert.match(scada.checklist[0].texto, /Segmentación TI\/OT/);
    await assert.rejects(recordCheck(db, round.id, scada.activo_id, OK_TRAMO, users.analistaTi), ForbiddenError);
    await assert.rejects(recordCheck(db, round.id, scada.activo_id, { resultado: 'observado' }, users.operadorOt), /Explica/);
    await assert.rejects(startRound(db, { alcance: 'aislados' }, users.legal), ForbiddenError);
    await assert.rejects(startRound(db, { alcance: 'aislados' }, users.coordinador), /No hay elementos aislados/);
  });
});

describe('Mapa de calor de la red', () => {
  test('entrega instalaciones, tramos, sistemas, el caso real y las fuentes', async () => {
    const { db, users } = await setup();
    let map = await getPipelineMap(db);
    assert.equal(map.instalaciones.length, LOCATIONS.length);
    assert.equal(map.tramos.length, 15);
    assert.deepEqual(map.sistemas.map((s) => s.codigo).sort(), ['FACT-SIS', 'SCADA-CTL', 'VPN-LEGADA']);
    assert.ok(map.tramos.every((t) => t.estado === 'operativo' && t.nivelCalor === 0));
    assert.equal(map.caso.dias.length, 5);
    assert.equal(map.caso.dias[2].tramos['L4-T3'], 'manual');
    assert.ok(map.fuentes.blount.url.includes('senate.gov'));

    await incidentWithOtStopped(db, users);
    map = await getPipelineMap(db);
    assert.ok(map.tramos.every((t) => t.estado === 'aislado'));
    assert.equal(map.resumen.aislados, ASSETS.length);
    assert.equal(map.resumen.sinVerificar, ASSETS.length);
  });
});

describe('Bitácora encadenada con SHA-256', () => {
  test('la cadena es íntegra después de un incidente completo de eventos', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const result = await verifyLedger(db);
    assert.equal(result.integra, true);
    assert.ok(result.total > 10);
    assert.match(result.ultimoHash, /^[0-9a-f]{64}$/);
  });

  test('detecta un evento modificado o borrado directamente en la base', async () => {
    const { db, users } = await setup();
    await incidentWithOtStopped(db, users);
    const target = await db.one('SELECT secuencia FROM historial_recuperacion ORDER BY secuencia OFFSET 3 LIMIT 1');

    await db.query('ALTER TABLE historial_recuperacion DISABLE TRIGGER trg_historial_inmutable');
    try {
      await db.query(`UPDATE historial_recuperacion SET detalle = 'alterado' WHERE secuencia = $1`, [target.secuencia]);
      let result = await verifyLedger(db);
      assert.equal(result.integra, false);
      assert.equal(result.primerError.secuencia, target.secuencia);
      assert.match(result.primerError.motivo, /modificado/);

      await db.query('DELETE FROM historial_recuperacion WHERE secuencia = $1', [target.secuencia]);
      result = await verifyLedger(db);
      assert.equal(result.integra, false);
      assert.match(result.primerError.motivo, /Falta el evento/);
    } finally {
      await db.query('ALTER TABLE historial_recuperacion ENABLE TRIGGER trg_historial_inmutable');
    }
  });

  test('las inserciones concurrentes quedan en una sola cadena sin huecos', async () => {
    const { db, users } = await setup();
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      db.tx((tx) => recordHistory(tx, { evento: 'prueba_concurrencia', detalle: `Evento ${i}`, usuarioId: users.coordinador.id }))));
    const result = await verifyLedger(db);
    assert.equal(result.integra, true);
    assert.equal(result.total, 12);
  });
});

describe('API de mapa, rondas y bitácora', () => {
  let ctx;
  before(async () => {
    const { db } = await setup();
    ctx = await startServer(db);
  });
  after(() => ctx.close());

  test('exige sesión', async () => {
    const anon = ctx.client();
    assert.equal((await anon.call('/mapas/oleoducto')).status, 401);
    assert.equal((await anon.call('/bitacora/verificar')).status, 401);
  });

  test('aislar, verificar en ronda y reconectar por HTTP', async () => {
    const ot = ctx.client();
    await ot.login(EMAILS.operadorOt);
    const map = await ot.call('/mapas/oleoducto');
    assert.equal(map.status, 200);
    assert.equal(map.body.instalaciones[0].codigo, 'HOU');
    const line4 = map.body.tramos.find((t) => t.codigo === 'L4-T3');

    assert.equal((await ot.call(`/activos/${line4.id}/aislar`, { method: 'POST', body: { motivo: 'corto' } })).status, 400);
    const iso = await ot.call(`/activos/${line4.id}/aislar`, { method: 'POST', body: { motivo: 'Alarma de presión en Dorsey Junction' } });
    assert.equal(iso.status, 200);
    assert.equal((await ot.call(`/activos/${line4.id}/liberar`, { method: 'POST', body: {} })).status, 409);

    const round = await ot.call('/rondas', { method: 'POST', body: { alcance: 'aislados' } });
    assert.equal(round.status, 201);
    assert.equal((await ot.call('/rondas', { method: 'POST', body: { alcance: 'linea', valor: 'L9' } })).status, 400);
    const item = `/rondas/${round.body.id}/activos/${line4.id}`;
    assert.equal((await ot.call(item, { method: 'PATCH', body: { resultado: 'falla' } })).status, 400);
    assert.equal((await ot.call(item, { method: 'PATCH', body: { resultado: 'ok', confirmados: [0] } })).status, 409);
    assert.equal((await ot.call(item, { method: 'PATCH', body: OK_TRAMO })).status, 200);
    assert.equal((await ot.call(`/rondas/${round.body.id}/cerrar`, { method: 'POST' })).status, 200);
    const released = await ot.call(`/activos/${line4.id}/liberar`, { method: 'POST', body: { nota: 'Presión normal tras patrullaje' } });
    assert.equal(released.status, 200);
    assert.equal(released.body.aislado, false);

    const ledger = await ot.call('/bitacora/verificar');
    assert.equal(ledger.body.integra, true);
    const recent = await ot.call('/bitacora?limite=3');
    assert.equal(recent.body.length, 3);
    assert.equal(recent.body[0].evento, 'activo_liberado');
  });
});
