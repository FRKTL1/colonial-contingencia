/**
 * Simulación visual del cliente: se prueba el motor contra la definición real del flujo
 * (describeFlow) para que la animación nunca contradiga las reglas del servidor.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ERADICATION_ATTEMPTS, describeFlow } from '../src/domain/flow.js';
import { SERVICES, USERS } from '../src/db/seedData.js';
import {
  EVENT_TYPES,
  INITIAL_AFFECTED,
  actionsByOwner,
  answersWithChoice,
  buildSimulation,
  hoursByStage,
} from '../../client/src/simulation/engine.js';

const users = USERS.map((u, i) => ({ ...u, id: i + 1 }));
const run = (answers = []) => buildSimulation({ flow: describeFlow(), users, services: SERVICES, answers });
const stagesVisited = (sim) => sim.events.filter((e) => e.tipo === EVENT_TYPES.STAGE).map((e) => e.etapaInfo.clave);
const decisionsOf = (sim) => sim.summary.decisiones.map((d) => `${d.codigo}:${d.respuesta ? 'Sí' : 'No'}`);

describe('Simulación visual del plan', () => {
  test('describeFlow publica responsables y efectos que necesita la simulación', () => {
    const flow = describeFlow();
    const deteccion = flow.etapas.find((e) => e.clave === 'deteccion');
    assert.equal(flow.etapaInicial, 'deteccion');
    assert.equal(deteccion.rolResponsable, 'analista_ti');
    assert.equal(deteccion.accionAlEntrar.rol, 'analista_ti');
    const d1 = flow.decisiones.find((d) => d.codigo === 'D1');
    assert.equal(d1.si.efecto, 'detener_ot');
    assert.equal(d1.si.rol, 'operador_ot');
    assert.equal(flow.decisiones.find((d) => d.codigo === 'D3').no.cuentaComoIntentoFallido, true);
  });

  test('el guion por defecto reproduce el caso de Colonial de la afectación al cierre', () => {
    const sim = run();
    assert.deepEqual(decisionsOf(sim), ['D1:Sí', 'D2:No', 'D3:Sí', 'D4:Sí']);
    assert.deepEqual(stagesVisited(sim), [
      'deteccion', 'evaluacion', 'contencion', 'erradicacion', 'recuperacion', 'ruta_alternativa', 'servicio_restablecido', 'cierre',
    ]);
    assert.equal(sim.events[0].tipo, EVENT_TYPES.START);
    assert.equal(sim.events.at(-1).tipo, EVENT_TYPES.END);
    assert.equal(sim.events.at(-1).kpis.disponibilidad, 100);
    // 4 sistemas de TI cifrados + 4 servicios OT detenidos = 2 de 10 operativos.
    assert.equal(sim.summary.disponibilidadMinima, 20);
    assert.equal(sim.summary.diferentesAColonial, 0);
  });

  test('la afectación inicial y la detención preventiva coinciden con el servidor', () => {
    const sim = run();
    const afterStart = sim.events.find((e) => e.tipo === EVENT_TYPES.SERVICE);
    assert.deepEqual(afterStart.cambios.map((c) => c.codigo).sort(), [...INITIAL_AFFECTED].sort());
    const d1 = sim.events.findIndex((e) => e.tipo === EVENT_TYPES.DECISION && e.decision.codigo === 'D1');
    const stop = sim.events[d1 + 1];
    assert.equal(stop.tipo, EVENT_TYPES.SERVICE);
    assert.ok(SERVICES.filter((s) => s.tipo === 'OT').every((s) => stop.servicios[s.codigo] === 'afectado'));
    assert.equal(stop.kpis.flujoOleoducto, 0);
  });

  test('D1 = No mantiene el oleoducto operando durante toda la simulación', () => {
    const sim = run([false]);
    assert.equal(sim.summary.horasSinOleoducto, 0);
    assert.ok(sim.events.every((e) => e.kpis.flujoOleoducto === 100));
  });

  test('D4 = No omite la ruta alternativa', () => {
    const sim = run([true, false, true, false]);
    assert.ok(!stagesVisited(sim).includes('ruta_alternativa'));
    assert.equal(sim.summary.diferentesAColonial, 1);
  });

  test('cada D3 = No hace fallar la erradicación, pasa por análisis forense y al tope escala', () => {
    const sim = run([true, false, false, false, false, false]);
    const stages = stagesVisited(sim);
    assert.equal(stages.filter((s) => s === 'analisis_forense').length, MAX_ERADICATION_ATTEMPTS);
    assert.equal(sim.summary.accionesFallidas, MAX_ERADICATION_ATTEMPTS);
    assert.equal(sim.summary.intentosFallidos, MAX_ERADICATION_ATTEMPTS);
    assert.equal(sim.summary.escalado, true);
    assert.equal(sim.events.filter((e) => e.tipo === EVENT_TYPES.ESCALATION).length, 1);
    // Tras el tope, la siguiente validación se fuerza a Sí para que el flujo termine.
    const lastD3 = sim.summary.decisiones.filter((d) => d.codigo === 'D3').at(-1);
    assert.equal(lastD3.respuesta, true);
    assert.equal(lastD3.porUsuario, false);
    assert.equal(sim.events.at(-1).etapa, 'finalizado');
  });

  test('cada acción la asigna y la cierra la persona del rol responsable', () => {
    const sim = run([true, false, false, true, true]);
    const nameByRole = Object.fromEntries(users.map((u) => [u.rol, u.nombre]));
    const actionEvents = sim.events.filter((e) => e.accion);
    assert.ok(actionEvents.length > 0);
    for (const event of actionEvents) {
      assert.equal(event.actor.nombre, nameByRole[event.accion.responsable.rol]);
    }
    const assigned = actionEvents.filter((e) => e.tipo === EVENT_TYPES.ACTION_ASSIGNED).length;
    const closed = actionEvents.filter((e) => e.tipo !== EVENT_TYPES.ACTION_ASSIGNED).length;
    assert.equal(assigned, closed, 'ninguna acción queda abierta al cierre');
    const owners = actionsByOwner(sim.events, sim.events.length - 1);
    assert.ok(owners.some((o) => o.rol === 'legal'), 'D2 = No asigna la evaluación del rescate a Asesoría legal');
  });

  test('el tiempo simulado nunca retrocede y las horas por etapa suman el total', () => {
    const sim = run([true, true, false, true, true]);
    sim.events.forEach((e, i) => {
      if (i > 0) assert.ok(e.t >= sim.events[i - 1].t, `evento ${i} retrocede en el tiempo`);
    });
    const total = hoursByStage(sim.events, sim.events.length - 1).reduce((acc, row) => acc + row.horas, 0);
    assert.ok(Math.abs(total - sim.summary.horasTotales) < 0.05);
  });

  test('cambiar una decisión no altera lo ocurrido antes de ella', () => {
    const base = run();
    const d2 = base.events.find((e) => e.tipo === EVENT_TYPES.DECISION && e.decision.codigo === 'D2');
    const answers = answersWithChoice(base.events, d2.decision.ordinal, true);
    assert.deepEqual(answers, [true, true]);
    const changed = run(answers);
    const strip = (events) => events.map(({ id, t, tipo, texto }) => ({ id, t, tipo, texto }));
    assert.deepEqual(strip(changed.events.slice(0, d2.id)), strip(base.events.slice(0, d2.id)));
    assert.equal(changed.events[d2.id].decision.respuesta, true);
  });

  test('rechaza un flujo vacío o sin servicios', () => {
    assert.throws(() => buildSimulation({ flow: { etapas: [], decisiones: [] }, services: SERVICES }), /flujo/);
    assert.throws(() => buildSimulation({ flow: describeFlow(), services: [] }), /servicios/);
  });
});
