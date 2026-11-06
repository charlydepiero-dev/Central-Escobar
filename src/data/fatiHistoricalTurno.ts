import { TurnoCierre, MapaConteos, MapaSistemaStock } from '../types/central';

// Conteos físicos oficiales registrados por el Turno Tarde anterior
export const FATI_HISTORICAL_CONTEOS: MapaConteos = {
  'c-10967': { ubic: { 'Freezer': 162 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Bondiola (162)
  'c-11472': { ubic: { 'Freezer': 95 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Capresse (95)
  'c-10957': { ubic: { 'Freezer': 275 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Carne Cuchillo (275)
  'c-10959': { ubic: { 'Freezer': 145 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Carne Picante (145)
  'c-10956': { ubic: { 'Freezer': 355 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Carne Suave (355)
  'c-10963': { ubic: { 'Freezer': 146 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Cebolla y Queso (146)
  'c-14151': { ubic: { 'Freezer': 246 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Cheeseburger (246)
  'c-10965': { ubic: { 'Freezer': 102 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Humita (102)
  'c-10955': { ubic: { 'Freezer': 653 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Jamón y Queso (653)
  'c-10960': { ubic: { 'Freezer': 286 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Pollo (286)
  'c-10969': { ubic: { 'Freezer': 86 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Roquefort con Jamón (86)
  'c-10964': { ubic: { 'Freezer': 89 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Verdura (89)
  'c-10975': { ubic: { 'Freezer': 36 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Choclo y Calabaza Integral (36)
  'c-10976': { ubic: { 'Freezer': 17 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Puerro y Hongos (17)
  'c-10979': { ubic: { 'Freezer': 26 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Carne a la Criolla Vegana (26)
  'c-10977': { ubic: { 'Freezer': 26 }, empleado: 'Fati', hora: '11:00 p. m.' }, // Pollo al Curry Vegana (26)

  // Pizzas y Medialunas
  'c-11027': { ubic: { 'Cruda': 9 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Faina Entera (9)
  'c-22449': { ubic: { 'Cruda': 8 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Combo Pizza individual (8)
  'c-11017': { ubic: { 'Cruda': 49 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Rollo de Muzzarella 380g (49)
  'c-11018': { ubic: { 'Cruda': 53 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Rollo de Muzzarella 190g (53)
  'c-11025': { ubic: { 'Cruda': 56 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Bollo de Masa de 600g (56)
  'c-11026': { ubic: { 'Cruda': 36 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Bollo de Masa de 400g (36)
  'c-27749': { ubic: { 'Cruda': 1104 }, empleado: 'Fati', hora: '10:52 p. m.' }, // Medialunas (1104)

  // Burritos
  'c-10981': { ubic: { 'Freezer': 11 }, empleado: 'Fati', hora: '10:51 p. m.' }, // Burrito de Ternera (11)
  'c-10982': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:51 p. m.' }, // Burrito de Cerdo (0)
  'c-10983': { ubic: { 'Freezer': 6 }, empleado: 'Fati', hora: '10:51 p. m.' }, // Burrito de Pollo (6)
  'c-10984': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:51 p. m.' }, // Burrito Vegetariano (0)

  // Sandwich y Panchos
  'c-17966': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Bollo 400gr - Porción Bondiola (0)
  'c-17968': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Bollo 400gr - Porción Pollo (0)
  'c-17967': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Bollo 400gr - Porción Ternera (0)
  'c-13944': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Porciones Bondiola (0)
  'c-13943': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Porciones Pollo (0)
  'c-13942': { ubic: { 'Freezer': 0 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Porciones Ternera (0)
  'c-22445': { ubic: { 'Freezer': 10 }, empleado: 'Fati', hora: '10:50 p. m.' }, // Combo Pancho (10)

  // Bebidas
  'c-11475': { ubic: { 'Heladera': 175 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Coca Cola 500/600ml (175)
  'c-94309': { ubic: { 'Heladera': 57 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Coca Cola Zero 500/600ml (57)
  'c-11467': { ubic: { 'Heladera': 29 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Fanta 600ml (29)
  'c-11420': { ubic: { 'Heladera': 77 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Sprite 500/600ml (77)
  'c-13428': { ubic: { 'Heladera': 26 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Sprite Zero 500/600ml (26)
  'c-83764': { ubic: { 'Heladera': 18 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius 500ml Manzana (18)
  'c-83765': { ubic: { 'Heladera': 55 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius 500ml Pera (55)
  'c-28708': { ubic: { 'Heladera': 26 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius Pomelo 500/600ml (26)
  'c-12844': { ubic: { 'Heladera': 61 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Coca Cola 1.5/1.75L (61)
  'c-13427': { ubic: { 'Heladera': 16 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Coca Cola Zero 1.5/1.75L (16)
  'c-11465': { ubic: { 'Heladera': 0 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Fanta 1.5/1.75L (0)
  'c-87757': { ubic: { 'Heladera': 21 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Sprite 1.5/1.75L (21)
  'c-82049': { ubic: { 'Heladera': 13 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Sprite Zero 1.5/1.75L (13)
  'c-90682': { ubic: { 'Heladera': 8 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius Manzana 1.5Lt (8)
  'c-28707': { ubic: { 'Heladera': 0 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius Naranja 1.5 Lts. (0)
  'c-94301': { ubic: { 'Heladera': 8 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius Pera 1.5ml (8)
  'c-22458': { ubic: { 'Heladera': 10 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Aquarius Pomelo 1.5 Lts (10)
  'c-96454': { ubic: { 'Heladera': 30 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Agua Benedictino sin gas 600ml (30)
  'c-96455': { ubic: { 'Heladera': 0 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Agua Benedictino con gas 600ml (0)
  'c-96456': { ubic: { 'Heladera': 8 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Agua Benedictino sin gas 1.5L (8)
  'c-96457': { ubic: { 'Heladera': 0 }, empleado: 'Fati', hora: '10:56 p. m.' }, // Agua Benedictino con gas 1.5L (0)
};



export const FATI_HISTORICAL_SISTEMA: MapaSistemaStock = Object.fromEntries(
  Object.entries(FATI_HISTORICAL_CONTEOS).map(([k, v]) => [
    k,
    { stock: Object.values(v.ubic).reduce((a, b) => a + b, 0), actualizado: '2026-10-15T23:13:00Z' },
  ])
);

// Turno noche oficial 15/10/2026 cerrado por Fati a las 11:13 p. m.
export const FATI_HISTORICAL_TURNO_15: TurnoCierre = {
  fecha: '2026-10-15',
  turno: 'Tarde',
  cerrado: true,
  hora_cierre: '23:13',
  cerrado_por: 'Fati',
  cierreCaja: {
    existe: true,
    fecha: '2026-10-15',
    turno: 'Tarde',
    efectivo_real: 124620,
    efectivo_mostrador_sist: 124620,
    postnet_amarillo: 60450,
    postnet_rosa: 50000,
    postnet_blanco: 40000,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: 'Cierre oficial Turno Tarde Datalive',
    empleado: 'Fati',
    hora: '23:13',
  },
  conteos: FATI_HISTORICAL_CONTEOS,
  sistemaStock: FATI_HISTORICAL_SISTEMA,
};

// Turno noche oficial más reciente con cierre de caja Datalive #741694 y stock físico contado
export const FATI_HISTORICAL_TURNO_14: TurnoCierre = {
  fecha: '2026-10-14',
  turno: 'Tarde',
  cerrado: true,
  hora_cierre: '23:20',
  cerrado_por: 'Fati',
  cierreCaja: {
    existe: true,
    fecha: '2026-10-14',
    turno: 'Tarde',
    efectivo_real: 124620,
    efectivo_mostrador_sist: 124620,
    postnet_amarillo: 60450,
    postnet_rosa: 50000,
    postnet_blanco: 40000,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: 'Cierre oficial Turno Tarde Datalive #741694',
    empleado: 'Fati',
    hora: '23:20',
  },
  conteos: FATI_HISTORICAL_CONTEOS,
  sistemaStock: FATI_HISTORICAL_SISTEMA,
};

export const FATI_HISTORICAL_TURNO: TurnoCierre = {
  fecha: '2026-10-13',
  turno: 'Tarde',
  cerrado: true,
  hora_cierre: '23:20',
  cerrado_por: 'Fati',
  pdfUrl: '/api/reportes/pdf/Acta_General_Cierre_Escobar_2026-10-13_tarde.pdf',
  cierreCaja: {
    existe: true,
    fecha: '2026-10-13',
    turno: 'Tarde',
    efectivo_real: 236250,
    efectivo_mostrador_sist: 235830,
    postnet_amarillo: 60450,
    postnet_rosa: 50000,
    postnet_blanco: 40000,
    online_local_sist: 150450,
    postnets: 150450,
    observaciones: 'Positivo por propina (+ $420). Cierre oficial Turno Tarde Datalive #741392',
    empleado: 'Fati',
    hora: '23:20',
  },
  conteos: FATI_HISTORICAL_CONTEOS,
  sistemaStock: FATI_HISTORICAL_SISTEMA,
};
