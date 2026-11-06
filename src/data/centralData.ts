import { CategoriaCatalogo, MapaSistemaStock, Empleado, CierreCajaData, TurnoCierre, MapaConteos, MapaReclamos } from '../types/central';

export const INITIAL_CATALOGO: CategoriaCatalogo[] = [
  {
    id: 'empanadas',
    nombre: 'Empanadas',
    ubicaciones: ['Freezer', 'Heladera', 'Cocidas heladera'],
    grupos: [
      {
        nombre: 'Empanadas Clásicas',
        productos: [
          { codigo: '10967', nombre: 'Bondiola' },
          { codigo: '11472', nombre: 'Capresse' },
          { codigo: '10957', nombre: 'Carne Cuchillo' },
          { codigo: '10959', nombre: 'Carne Picante' },
          { codigo: '10956', nombre: 'Carne Suave' },
          { codigo: '10963', nombre: 'Cebolla y Queso' },
          { codigo: '14151', nombre: 'Cheeseburger' },
          { codigo: '10965', nombre: 'Humita' },
          { codigo: '10955', nombre: 'Jamón y Queso' },
          { codigo: '10960', nombre: 'Pollo' },
          { codigo: '10969', nombre: 'Roquefort con Jamón' },
          { codigo: '10964', nombre: 'Verdura' },
        ],
      },
      {
        nombre: 'Empanadas Integrales',
        productos: [
          { codigo: '10975', nombre: 'Choclo y Calabaza Integral' },
          { codigo: '10976', nombre: 'Puerro y Hongos' },
        ],
      },
      {
        nombre: 'Empanadas Veganas',
        productos: [
          { codigo: '10979', nombre: 'Carne a la Criolla Vegana' },
          { codigo: '10977', nombre: 'Pollo al Curry Vegana' },
        ],
      },
    ],
  },
  {
    id: 'panificados',
    nombre: 'Pizzas y Medialunas',
    ubicaciones: ['Cruda', 'Cocida'],
    grupos: [
      {
        nombre: null,
        productos: [
          { codigo: '11027', nombre: 'Faina Entera' },
          { codigo: '22449', nombre: 'Combo Pizza individual' },
          { codigo: '11017', nombre: 'Rollo de Muzzarella 380g' },
          { codigo: '11018', nombre: 'Rollo de Muzzarella 190g' },
          { codigo: '11025', nombre: 'Bollo de Masa de 600g' },
          { codigo: '11026', nombre: 'Bollo de Masa de 400g' },
          { codigo: '27749', nombre: 'Medialunas' },
        ],
      },
    ],
  },
  {
    id: 'burritos',
    nombre: 'Burritos',
    ubicaciones: ['Freezer', 'Heladera'],
    grupos: [
      {
        nombre: null,
        productos: [
          { codigo: '10981', nombre: 'Burrito de Ternera' },
          { codigo: '10982', nombre: 'Burrito de Cerdo' },
          { codigo: '10983', nombre: 'Burrito de Pollo' },
          { codigo: '10984', nombre: 'Burrito Vegetariano' },
        ],
      },
    ],
  },
  {
    id: 'sandwich_panchos',
    nombre: 'Sandwich y Panchos',
    ubicaciones: ['Freezer', 'Heladera'],
    grupos: [
      {
        nombre: 'Sandwiches',
        productos: [
          { codigo: '17966', nombre: 'Bollo 400gr - Porción Bondiola' },
          { codigo: '17968', nombre: 'Bollo 400gr - Porción Pollo' },
          { codigo: '17967', nombre: 'Bollo 400gr - Porción Ternera' },
        ],
      },
      {
        nombre: 'Porciones',
        productos: [
          { codigo: '13944', nombre: 'Porciones Bondiola' },
          { codigo: '13943', nombre: 'Porciones Pollo' },
          { codigo: '13942', nombre: 'Porciones Ternera' },
        ],
      },
      {
        nombre: 'Panchos',
        productos: [
          { codigo: '22445', nombre: 'Combo Pancho' },
        ],
      },
    ],
  },
  {
    id: 'bebidas',
    nombre: 'Bebidas',
    ubicaciones: ['Heladera', 'Depósito'],
    grupos: [
      {
        nombre: 'Gaseosas 500/600',
        productos: [
          { codigo: '11475', nombre: 'Coca Cola 500/600ml' },
          { codigo: '94309', nombre: 'Coca Cola Zero 500/600ml' },
          { codigo: '11467', nombre: 'Fanta 600ml' },
          { codigo: '11420', nombre: 'Sprite 500/600ml' },
          { codigo: '13428', nombre: 'Sprite Zero 500/600ml' },
        ],
      },
      {
        nombre: 'Aguas Saborizadas 500/600',
        productos: [
          { codigo: '83764', nombre: 'Aquarius 500ml Manzana' },
          { codigo: '83765', nombre: 'Aquarius 500ml Pera' },
          { codigo: '28708', nombre: 'Aquarius Pomelo 500/600ml' },
        ],
      },
      {
        nombre: 'Gaseosas 1.5/1.75',
        productos: [
          { codigo: '12844', nombre: 'Coca Cola 1.5/1.75L' },
          { codigo: '13427', nombre: 'Coca Cola Zero 1.5/1.75L' },
          { codigo: '11465', nombre: 'Fanta 1.5/1.75L' },
          { codigo: '87757', nombre: 'Sprite 1.5/1.75L' },
          { codigo: '82049', nombre: 'Sprite Zero 1.5/1.75L' },
        ],
      },
      {
        nombre: 'Aguas Saborizadas Grandes',
        productos: [
          { codigo: '90682', nombre: 'Aquarius Manzana 1.5Lt' },
          { codigo: '28707', nombre: 'Aquarius Naranja 1.5 Lts.' },
          { codigo: '94301', nombre: 'Aquarius Pera 1.5ml' },
          { codigo: '22458', nombre: 'Aquarius Pomelo 1.5 Lts' },
        ],
      },
      {
        nombre: 'Agua',
        productos: [
          { codigo: '96454', nombre: 'Agua Benedictino sin gas 600ml' },
          { codigo: '96455', nombre: 'Agua Benedictino con gas 600ml' },
          { codigo: '96456', nombre: 'Agua Benedictino sin gas 1.5L' },
          { codigo: '96457', nombre: 'Agua Benedictino con gas 1.5L' },
        ],
      },
    ],
  },
];

export const INITIAL_SISTEMA_STOCK: MapaSistemaStock = {
  // Empanadas
  'c-10967': { stock: 195, actualizado: '2026-10-12T06:00:00Z' }, // Bondiola
  'c-11472': { stock: 146, actualizado: '2026-10-12T06:00:00Z' }, // Capresse
  'c-10957': { stock: 432, actualizado: '2026-10-12T06:00:00Z' }, // Carne Cuchillo
  'c-10959': { stock: 138, actualizado: '2026-10-12T06:00:00Z' }, // Carne Picante
  'c-10956': { stock: 206, actualizado: '2026-10-12T06:00:00Z' }, // Carne Suave
  'c-10963': { stock: 124, actualizado: '2026-10-12T06:00:00Z' }, // Cebolla y Queso
  'c-14151': { stock: 367, actualizado: '2026-10-12T06:00:00Z' }, // Cheeseburger
  'c-10965': { stock: 124, actualizado: '2026-10-12T06:00:00Z' }, // Humita
  'c-10955': { stock: 1040, actualizado: '2026-10-12T06:00:00Z' }, // Jamón y Queso
  'c-10960': { stock: 564, actualizado: '2026-10-12T06:00:00Z' }, // Pollo
  'c-10969': { stock: 103, actualizado: '2026-10-12T06:00:00Z' }, // Roquefort con Jamón
  'c-10964': { stock: 103, actualizado: '2026-10-12T06:00:00Z' }, // Verdura
  'c-10975': { stock: 48, actualizado: '2026-10-12T06:00:00Z' }, // Choclo y Calabaza Integral
  'c-10976': { stock: 24, actualizado: '2026-10-12T06:00:00Z' }, // Puerro y Hongos
  'c-10979': { stock: 35, actualizado: '2026-10-12T06:00:00Z' }, // Carne a la Criolla Vegana
  'c-10977': { stock: 33, actualizado: '2026-10-12T06:00:00Z' }, // Pollo al Curry Vegana

  // Pizzas y Medialunas
  'c-11027': { stock: 5, actualizado: '2026-10-12T06:00:00Z' }, // Faina Entera
  'c-22449': { stock: 12, actualizado: '2026-10-12T06:00:00Z' }, // Combo Pizza individual
  'c-11017': { stock: 5, actualizado: '2026-10-12T06:00:00Z' }, // Rollo de Muzzarella 380g
  'c-11018': { stock: 10, actualizado: '2026-10-12T06:00:00Z' }, // Rollo de Muzzarella 190g
  'c-11025': { stock: 10, actualizado: '2026-10-12T06:00:00Z' }, // Bollo de Masa de 600g
  'c-11026': { stock: 7, actualizado: '2026-10-12T06:00:00Z' }, // Bollo de Masa de 400g
  'c-27749': { stock: 1730, actualizado: '2026-10-12T06:00:00Z' }, // Medialunas

  // Burritos
  'c-10981': { stock: 5, actualizado: '2026-10-12T06:00:00Z' }, // Burrito de Ternera
  'c-10982': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Burrito de Cerdo
  'c-10983': { stock: 10, actualizado: '2026-10-12T06:00:00Z' }, // Burrito de Pollo
  'c-10984': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Burrito Vegetariano

  // Sandwich y Panchos
  'c-17966': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Bollo 400gr - Porción Bondiola
  'c-17968': { stock: 3, actualizado: '2026-10-12T06:00:00Z' }, // Bollo 400gr - Porción Pollo
  'c-17967': { stock: 3, actualizado: '2026-10-12T06:00:00Z' }, // Bollo 400gr - Porción Ternera
  'c-13944': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Porciones Bondiola
  'c-13943': { stock: 1, actualizado: '2026-10-12T06:00:00Z' }, // Porciones Pollo
  'c-13942': { stock: 4, actualizado: '2026-10-12T06:00:00Z' }, // Porciones Ternera
  'c-22445': { stock: 14, actualizado: '2026-10-12T06:00:00Z' }, // Combo Pancho

  // Bebidas: Gaseosas 500/600
  'c-11475': { stock: 137, actualizado: '2026-10-12T06:00:00Z' }, // Coca Cola 500/600ml
  'c-94309': { stock: 52, actualizado: '2026-10-12T06:00:00Z' }, // Coca Cola Zero 500/600ml
  'c-11467': { stock: 24, actualizado: '2026-10-12T06:00:00Z' }, // Fanta 600ml
  'c-11420': { stock: 66, actualizado: '2026-10-12T06:00:00Z' }, // Sprite 500/600ml
  'c-13428': { stock: 14, actualizado: '2026-10-12T06:00:00Z' }, // Sprite Zero 500/600ml

  // Bebidas: Aguas Saborizadas 500ml
  'c-83764': { stock: 9, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius 500ml Manzana
  'c-83765': { stock: 41, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius 500ml Pera
  'c-28708': { stock: 20, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius Pomelo 500/600ml

  // Bebidas: Gaseosas 1.5/1.75
  'c-12844': { stock: 47, actualizado: '2026-10-12T06:00:00Z' }, // Coca Cola 1.5/1.75L
  'c-13427': { stock: 11, actualizado: '2026-10-12T06:00:00Z' }, // Coca Cola Zero 1.5/1.75L
  'c-11465': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Fanta 1.5/1.75L
  'c-87757': { stock: 24, actualizado: '2026-10-12T06:00:00Z' }, // Sprite 1.5/1.75L
  'c-82049': { stock: 8, actualizado: '2026-10-12T06:00:00Z' }, // Sprite Zero 1.5/1.75L

  // Bebidas: Aguas Saborizadas Grandes
  'c-90682': { stock: 9, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius Manzana 1.5Lt
  'c-28707': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius Naranja 1.5 Lts.
  'c-94301': { stock: 13, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius Pera 1.5ml
  'c-22458': { stock: 11, actualizado: '2026-10-12T06:00:00Z' }, // Aquarius Pomelo 1.5 Lts

  // Bebidas: Agua
  'c-96454': { stock: 25, actualizado: '2026-10-12T06:00:00Z' }, // Agua Benedictino sin gas 600ml
  'c-96455': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Agua Benedictino con gas 600ml
  'c-96456': { stock: 9, actualizado: '2026-10-12T06:00:00Z' }, // Agua Benedictino sin gas 1.5L
  'c-96457': { stock: 0, actualizado: '2026-10-12T06:00:00Z' }, // Agua Benedictino con gas 1.5L
};

export const INITIAL_EMPLEADOS: Empleado[] = [
  { nombre: 'Tiara', pin: '1111', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Mai', pin: '2222', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Fati', pin: '3333', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Axel', pin: '4444', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Vero', pin: '5555', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Yamil', pin: '6666', activo: true, rol: 'empleado', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Charly', pin: '1234', activo: true, rol: 'admin', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Luis', pin: '4321', activo: true, rol: 'admin', creado: '2026-01-01T00:00:00Z' },
  { nombre: 'Admin', pin: '170226', activo: true, rol: 'admin', oculto: true, creado: '2026-01-01T00:00:00Z' },
];

export const INITIAL_CONTEO: MapaConteos = {};

export const INITIAL_CIERRE_CAJA: CierreCajaData = {
  existe: false,
  fecha: '',
  turno: 'Mañana',
  postnet_amarillo: 0,
  postnet_rosa: 0,
  postnet_blanco: 0,
  online_local_sist: 0,
  efectivo_real: 0,
  efectivo_mostrador_sist: 0,
  observaciones: '',
  empleado: '',
  hora: '',
};

export const INITIAL_RECLAMOS: MapaReclamos = {};

import { FATI_HISTORICAL_TURNO, FATI_HISTORICAL_TURNO_14, FATI_HISTORICAL_TURNO_15 } from './fatiHistoricalTurno';

export const INITIAL_PAST_TURNOS: TurnoCierre[] = [
  FATI_HISTORICAL_TURNO_15,
  FATI_HISTORICAL_TURNO_14,
  FATI_HISTORICAL_TURNO,
  {
    fecha: '2026-10-05',
    turno: 'Tarde',
    cerrado: true,
    hora_cierre: '23:45',
    cerrado_por: 'Carlos',
    pdfUrl: 'https://drive.google.com/sample_report_central_esco_2026-10-05-Tarde.pdf',
    cierreCaja: {
      existe: true,
      fecha: '2026-10-05',
      turno: 'Tarde',
      postnet_amarillo: 92000,
      postnet_rosa: 54000,
      postnet_blanco: 38000,
      online_local_sist: 184000,
      efectivo_real: 112000,
      efectivo_mostrador_sist: 112000,
      observaciones: 'Cierre nocturno sin novedades.',
      empleado: 'Carlos',
      hora: '23:40',
    },
  },
  {
    fecha: '2026-10-05',
    turno: 'Mañana',
    cerrado: true,
    hora_cierre: '15:30',
    cerrado_por: 'Ana',
    pdfUrl: 'https://drive.google.com/sample_report_central_esco_2026-10-05-Manana.pdf',
    cierreCaja: {
      existe: true,
      fecha: '2026-10-05',
      turno: 'Mañana',
      postnet_amarillo: 68000,
      postnet_rosa: 39000,
      postnet_blanco: 29000,
      online_local_sist: 136000,
      efectivo_real: 74200,
      efectivo_mostrador_sist: 74000,
      observaciones: 'Sobrante mínimo de $200 por redondeo.',
      empleado: 'Ana',
      hora: '15:25',
    },
  },
  {
    fecha: '2026-10-04',
    turno: 'Tarde',
    cerrado: true,
    hora_cierre: '23:55',
    cerrado_por: 'Maxi',
    pdfUrl: 'https://drive.google.com/sample_report_central_esco_2026-10-04-Tarde.pdf',
  },
];
