/** Datos maestros: actores del plan, servicios y red del oleoducto (con sus fuentes). */

/**
 * Contraseña inicial de las cuentas de demostración. Cada usuario debe cambiarla en
 * "Mi cuenta"; en producción, MOSTRAR_CUENTAS_DEMO=false oculta las cuentas en el acceso.
 */
export const DEMO_PASSWORD = 'Colonial2021!';
export const USERS = Object.freeze([
  { nombre: 'María Torres', email: 'mtorres@colonial.local', rol: 'coordinador' },
  { nombre: 'Javier Ríos', email: 'jrios@colonial.local', rol: 'analista_ti' },
  { nombre: 'Lucía Paredes', email: 'lparedes@colonial.local', rol: 'operador_ot' },
  { nombre: 'Andrés Salinas', email: 'asalinas@colonial.local', rol: 'legal' },
  { nombre: 'Carla Méndez', email: 'cmendez@colonial.local', rol: 'comunicaciones' },
]);

export const SERVICES = Object.freeze([
  { codigo: 'OT-T1', nombre: 'Tramo 1: Houston – Atlanta', tipo: 'OT', criticidad: 5, descripcion: 'Línea principal de gasolina y diésel desde la costa del Golfo.' },
  { codigo: 'OT-T2', nombre: 'Tramo 2: Atlanta – Greensboro', tipo: 'OT', criticidad: 5, descripcion: 'Distribución hacia el sureste.' },
  { codigo: 'OT-T3', nombre: 'Tramo 3: Greensboro – Linden', tipo: 'OT', criticidad: 5, descripcion: 'Entrega hacia la costa este y Nueva Jersey.' },
  { codigo: 'OT-SCADA', nombre: 'SCADA / control de bombeo', tipo: 'OT', criticidad: 5, descripcion: 'Supervisión y control de estaciones de bombeo.' },
  { codigo: 'TI-FACT', nombre: 'Facturación a clientes', tipo: 'TI', criticidad: 4, descripcion: 'Sistema de facturación por volumen entregado.' },
  { codigo: 'TI-ERP', nombre: 'ERP corporativo', tipo: 'TI', criticidad: 4, descripcion: 'Finanzas, compras y logística.' },
  { codigo: 'TI-VPN', nombre: 'VPN de acceso remoto', tipo: 'TI', criticidad: 3, descripcion: 'Acceso remoto de empleados (vector de entrada del ataque).' },
  { codigo: 'TI-AD', nombre: 'Directorio activo / identidades', tipo: 'TI', criticidad: 4, descripcion: 'Autenticación y gestión de cuentas.' },
  { codigo: 'TI-MAIL', nombre: 'Correo corporativo', tipo: 'TI', criticidad: 2, descripcion: 'Comunicación interna y externa.' },
  { codigo: 'TI-BKP', nombre: 'Plataforma de respaldos', tipo: 'TI', criticidad: 5, descripcion: 'Copias de seguridad de sistemas TI.' },
]);

/**
 * Instalaciones de la red de Colonial Pipeline. Los nombres salen del mapa oficial de reinicio
 * (13 may 2021) y de las fuentes de cada fila; las coordenadas son las del centro de cada
 * ciudad y solo ubican el punto en el mapa. "Oxford" figura en el mapa oficial sin estado:
 * se omitió para no adivinar su ubicación.
 */
const place = (codigo, nombre, tipo, ciudad, estado, latitud, longitud, servicio, descripcion, fuentes) => ({
  codigo, nombre, tipo, ciudad, estado, latitud, longitud, servicio, descripcion, fuentes,
});

export const LOCATIONS = Object.freeze([
  place('HOU', 'Houston', 'origen', 'Houston', 'TX', 29.7604, -95.3698, 'OT-T1', 'Origen del sistema: las líneas 1 y 2 salen de aquí con producto de las refinerías del golfo.', ['mckinsey', 'wikipedia', 'colmap0513']),
  place('OPE', 'Opelousas', 'punto_entrega', 'Opelousas', 'LA', 30.5335, -92.0815, 'OT-T1', 'Mercado de entrega en Luisiana.', ['colmap0513']),
  place('MER', 'Meridian', 'punto_entrega', 'Meridian', 'MS', 32.3643, -88.7037, 'OT-T1', 'Mercado de entrega en Misisipi.', ['colmap0513']),
  place('BOL', 'Boligee', 'punto_entrega', 'Boligee', 'AL', 32.7579, -88.0281, 'OT-T1', 'Mercado de entrega en Alabama.', ['colmap0513']),
  place('BHM', 'Birmingham', 'punto_entrega', 'Birmingham', 'AL', 33.5186, -86.8104, 'OT-T1', 'Mercado de entrega en Alabama.', ['colmap0513']),
  place('ATL', 'Atlanta', 'punto_entrega', 'Atlanta', 'GA', 33.7490, -84.3880, 'OT-T1', 'Mercado de entrega; de aquí salen los ramales a Tennessee y al sur de Georgia.', ['colmap0513', 'mckinsey']),
  place('NAS', 'Nashville', 'punto_entrega', 'Nashville', 'TN', 36.1627, -86.7816, 'OT-T1', 'Mercado del ramal Atlanta–Tennessee.', ['colmap0513', 'mckinsey']),
  place('KNX', 'Knoxville', 'punto_entrega', 'Knoxville', 'TN', 35.9606, -83.9207, 'OT-T1', 'Mercado del ramal Atlanta–Tennessee.', ['colmap0513', 'mckinsey']),
  place('MAC', 'Macon', 'punto_entrega', 'Macon', 'GA', 32.8407, -83.6324, 'OT-T1', 'Mercado del ramal Atlanta–sur de Georgia.', ['colmap0513', 'mckinsey']),
  place('BAI', 'Bainbridge', 'punto_entrega', 'Bainbridge', 'GA', 30.9038, -84.5755, 'OT-T1', 'Mercado del ramal Atlanta–sur de Georgia.', ['colmap0513', 'mckinsey']),
  place('BEL', 'Belton', 'punto_entrega', 'Belton', 'SC', 34.5229, -82.4943, 'OT-T2', 'Mercado de entrega en Carolina del Sur.', ['colmap0513']),
  place('AUG', 'Augusta', 'punto_entrega', 'Augusta', 'GA', 33.4735, -82.0105, 'OT-T2', 'Mercado de entrega; su conexión se dibuja al nodo de línea principal más cercano.', ['colmap0513']),
  place('SPA', 'Spartanburg', 'punto_entrega', 'Spartanburg', 'SC', 34.9496, -81.9320, 'OT-T2', 'Mercado de entrega en Carolina del Sur.', ['colmap0513']),
  place('CLT', 'Charlotte', 'punto_entrega', 'Charlotte', 'NC', 35.2271, -80.8431, 'OT-T2', 'Mercado de entrega en Carolina del Norte.', ['colmap0513']),
  place('GSO', 'Greensboro', 'patio_tanques', 'Greensboro', 'NC', 36.0726, -79.7920, 'OT-T3', 'Patio de tanques más grande: terminan las líneas 1 y 2 y nacen las líneas 3 y 4.', ['wikipedia', 'mckinsey']),
  place('SEL', 'Selma', 'punto_entrega', 'Selma', 'NC', 35.5354, -78.2836, 'OT-T3', 'Mercado del ramal Greensboro–Raleigh/Durham.', ['colmap0513', 'mckinsey']),
  place('MIT', 'Mitchell', 'derivacion', 'Mitchell', 'VA', 38.3700, -78.0000, 'OT-T3', 'Punto del centro de Virginia del que salen los ramales a Richmond y Norfolk (ubicación aproximada: la fuente solo dice “centro de Virginia”).', ['mckinsey', 'colmap0513']),
  place('RIC', 'Richmond', 'punto_entrega', 'Richmond', 'VA', 37.5407, -77.4360, 'OT-T3', 'Mercado del ramal Mitchell–Richmond/Norfolk.', ['colmap0513', 'mckinsey']),
  place('NOR', 'Norfolk', 'punto_entrega', 'Norfolk', 'VA', 36.8508, -76.2859, 'OT-T3', 'Mercado del ramal Mitchell–Richmond/Norfolk.', ['colmap0513', 'mckinsey']),
  place('DOR', 'Dorsey Junction', 'estacion', 'Woodbine', 'MD', 39.3620, -77.0650, 'OT-T3', 'Estación de bombeo Dorsey Junction; destino de la Línea 4 (Greensboro–Woodbine).', ['wikipedia', 'fox0510', 'colmap0513']),
  place('BAL', 'Baltimore', 'punto_entrega', 'Baltimore', 'MD', 39.2904, -76.6122, 'OT-T3', 'Mercado de entrega de la Línea 4.', ['colmap0513', 'mckinsey']),
  place('LIN', 'Linden', 'terminal', 'Linden', 'NJ', 40.6220, -74.2446, 'OT-T3', 'Fin del sistema: patio de tanques Linden Junction, hacia el puerto de Nueva York.', ['colmap0513', 'wikipedia', 'mckinsey']),
]);

/**
 * Elementos de la red que se aíslan, verifican y reconectan. Los tramos usan solo datos
 * publicados (diámetro, producto, capacidad nominal); lo que no se publica queda en null.
 * Los sistemas son los que el caso documenta, con el hallazgo y su fuente.
 */
const segment = (codigo, nombre, linea, servicio, desde, hasta, paradas, extra = {}) => ({
  codigo, nombre, tipo: 'tramo', red: 'OT', linea, servicio, desde, hasta, paradas,
  diametro: null, capacidad: null, producto: null, descripcion: null, hallazgo: null, ...extra,
});
const system = (codigo, nombre, red, servicio, descripcion, hallazgo, fuentes) => ({
  codigo, nombre, tipo: 'sistema', red, linea: null, servicio, desde: null, hasta: null, paradas: [],
  diametro: null, capacidad: null, producto: null, descripcion, hallazgo, fuentes,
});

const L1 = { diametro: 40, capacidad: 1_500_000, producto: 'Gasolina', fuentes: ['mckinsey', 'colmap0513'] };
const L2 = { diametro: 36, capacidad: 1_200_000, producto: 'Destilados: diésel, combustible de aviación y de calefacción', fuentes: ['mckinsey', 'colmap0513'] };
const LATERAL = (descripcion, fuentes = ['mckinsey', 'colmap0513']) => ({ descripcion, fuentes });

export const ASSETS = Object.freeze([
  segment('L1-T1', 'Línea 1 · Houston – Atlanta', 'L1', 'OT-T1', 'HOU', 'ATL', ['OPE', 'MER', 'BOL', 'BHM'], { ...L1, descripcion: 'Primer segmento de la línea de gasolina.' }),
  segment('L2-T1', 'Línea 2 · Houston – Atlanta', 'L2', 'OT-T1', 'HOU', 'ATL', ['OPE', 'MER', 'BOL', 'BHM'], { ...L2, descripcion: 'Primer segmento de la línea de destilados.' }),
  segment('L1-T2', 'Línea 1 · Atlanta – Greensboro', 'L1', 'OT-T2', 'ATL', 'GSO', ['BEL', 'SPA', 'CLT'], { ...L1, descripcion: 'Segundo segmento de la línea de gasolina, hasta el patio de Greensboro.' }),
  segment('L2-T2', 'Línea 2 · Atlanta – Greensboro', 'L2', 'OT-T2', 'ATL', 'GSO', ['BEL', 'SPA', 'CLT'], { ...L2, descripcion: 'Segundo segmento de la línea de destilados, hasta el patio de Greensboro.' }),
  segment('L3-T3', 'Línea 3 · Greensboro – Linden', 'L3', 'OT-T3', 'GSO', 'LIN', ['MIT'], {
    capacidad: 885_000, producto: 'Todos los productos', descripcion: 'Lleva todos los productos de Greensboro al patio de Linden, NJ.', fuentes: ['mckinsey', 'colmap0513'],
  }),
  segment('L4-T3', 'Línea 4 · Greensboro – Woodbine', 'L4', 'OT-T3', 'GSO', 'DOR', [], {
    diametro: 32, capacidad: 700_000, producto: 'Productos refinados', descripcion: 'De Greensboro a Dorsey Junction (Woodbine, MD), hacia Baltimore.', fuentes: ['mckinsey', 'fox0510', 'colmap0513'],
  }),
  segment('LAT-NAS', 'Ramal Atlanta – Nashville', 'LAT', 'OT-T1', 'ATL', 'NAS', [], LATERAL('Parte del ramal Atlanta–Tennessee.')),
  segment('LAT-KNX', 'Ramal Atlanta – Knoxville', 'LAT', 'OT-T1', 'ATL', 'KNX', [], LATERAL('Parte del ramal Atlanta–Tennessee.')),
  segment('LAT-MAC', 'Ramal Atlanta – Macon', 'LAT', 'OT-T1', 'ATL', 'MAC', [], LATERAL('Parte del ramal Atlanta–sur de Georgia.')),
  segment('LAT-BAI', 'Ramal Macon – Bainbridge', 'LAT', 'OT-T1', 'MAC', 'BAI', [], LATERAL('Parte del ramal Atlanta–sur de Georgia.')),
  segment('LAT-AUG', 'Conexión a Augusta', 'LAT', 'OT-T2', 'BEL', 'AUG', [], LATERAL('Conexión esquemática al nodo de línea principal más cercano: la ruta real no se publica.', ['colmap0513'])),
  segment('LAT-SEL', 'Ramal Greensboro – Selma', 'LAT', 'OT-T3', 'GSO', 'SEL', [], LATERAL('Ramal Greensboro–Raleigh/Durham.')),
  segment('LAT-RIC', 'Ramal Mitchell – Richmond', 'LAT', 'OT-T3', 'MIT', 'RIC', [], LATERAL('Parte del ramal Mitchell–Richmond/Norfolk.')),
  segment('LAT-NOR', 'Ramal Richmond – Norfolk', 'LAT', 'OT-T3', 'RIC', 'NOR', [], LATERAL('Parte del ramal Mitchell–Richmond/Norfolk.')),
  segment('LAT-BAL', 'Conexión Dorsey – Baltimore', 'LAT', 'OT-T3', 'DOR', 'BAL', [], LATERAL('Entrega de la Línea 4 en el área de Baltimore.')),
  system('VPN-LEGADA', 'Perfil VPN heredado', 'TI', 'TI-VPN',
    'Acceso remoto a la red corporativa.',
    'Perfil que no debía estar en uso y solo pedía una contraseña, sin MFA: por ahí entró el atacante.',
    ['blount', 'insjournal']),
  system('FACT-SIS', 'Facturación y contabilidad', 'TI', 'TI-FACT',
    'Factura a cada cliente el volumen entregado.',
    'Fue de los sistemas TI afectados; sin facturación no se podía cobrar lo entregado.',
    ['techtarget', 'spg0508']),
  system('SCADA-CTL', 'Centro de control y SCADA', 'OT', 'OT-SCADA',
    'Supervisa y opera el bombeo de toda la red.',
    'No fue comprometido directamente; su supervisor emitió la orden de paro para que el malware no llegara a OT.',
    ['blount', 'techtarget']),
]);
