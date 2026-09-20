/**
 * Demo accounts for exploring the app locally, loaded with the catalog by
 * `npm run seed -w api`, each with a different family. The README lists their
 * logins. Seeding skips whatever already exists, so it can run any number of
 * times. Never load this anywhere real: the passwords are in the repo.
 */

/**
 * @typedef {object} SeedAccount
 * @property {string} name
 * @property {string} email
 * @property {string} password
 * @property {import('../src/families/families.service.js').ProfileInput} [family] saved with the account as its first member
 * @property {SeedToyBox} [toyBox] added to the family's toys once it is saved
 * @property {Record<string, boolean>} [materials] the family's answers, by material key; the rest stay at their defaults
 */
/**
 * @typedef {object} SeedToyBox What the toy box knows beyond the toys' names.
 * @property {Record<string, import('../src/toys/toys.service.js').ToyInput & { kid?: string }>} [details]
 *   by the toy's name, with whose it is as a kid's name
 * @property {string[][]} [links] sets of linked toys, by name
 */

const PASSWORD = 'ludi-local'

/** @type {SeedAccount[]} */
export const accounts = [
  // The brief's example family: a toddler and a pet.
  {
    name: 'Prueba',
    email: 'prueba@ludi.local',
    password: PASSWORD,
    family: {
      name: 'Familia de prueba',
      home: 'departamento',
      parents: [
        { name: 'Alex', calledAs: 'Papá' },
        { name: 'Caro', calledAs: 'Mamá' },
      ],
      kids: [{ name: 'Milán', ageMonths: 26, interests: ['los dinosaurios', 'los caballos'] }],
      pets: [{ name: 'Inca', kind: 'perro' }],
      toys: [
        { name: 'el dinosaurio chiquito' },
        { name: 'el tren grandote' },
        { name: 'el osito marrón' },
        { name: 'el caballo grande' },
        { name: 'el caballo chico' },
      ],
    },
    toyBox: {
      details: {
        'el dinosaurio chiquito': { description: 'T-rex de plástico duro, unos 8 cm, entra en la mano' },
        'el tren grandote': { description: 'Tren de madera con vagones que se enganchan con imanes', favorite: true },
        'el osito marrón': { aliases: ['el tuto'], kid: 'Milán' },
      },
      links: [['el caballo grande', 'el caballo chico']],
    },
    // One material that starts off and is there, and one that starts on and isn't.
    materials: { tizas: true, harina: false },
  },
  // The sparsest family: a baby, no pet, and two toys.
  {
    name: 'Bebé',
    email: 'bebe@ludi.local',
    password: PASSWORD,
    family: {
      name: 'Familia de Olivia',
      kids: [{ name: 'Olivia', ageMonths: 8, interests: ['las canciones', 'el agua'] }],
      pets: [],
      toys: [{ name: 'el sonajero' }, { name: 'la mantita' }],
    },
  },
  // Two kids far apart in age, so a juego has to suit both.
  {
    name: 'Hermanos',
    email: 'hermanos@ludi.local',
    password: PASSWORD,
    family: {
      name: 'Familia de Tomás y Emma',
      // Each with their own interests, and one they share (JUG-144).
      kids: [
        { name: 'Tomás', ageMonths: 98, interests: ['el fútbol', 'los piratas'] },
        { name: 'Emma', ageMonths: 52, interests: ['dibujar', 'los piratas'] },
      ],
      home: 'casa_con_parque',
      pets: [{ name: 'Michi', kind: 'gato' }],
      toys: [
        { name: 'la pelota de fútbol' },
        { name: 'los bloques de madera' },
        { name: 'la bici roja' },
        { name: 'el barco pirata' },
      ],
    },
    toyBox: {
      details: {
        'la bici roja': { kid: 'Tomás' },
        'los bloques de madera': { shared: true },
      },
    },
  },
  // One kid of five, the only family old enough for the juegos from 5, like
  // the birds of ¿Qué suena? (JUG-183); a toy guitar and drum name options in
  // the instruments.
  {
    name: 'Cinco',
    email: 'cinco@ludi.local',
    password: PASSWORD,
    family: {
      name: 'Familia de Lola',
      home: 'departamento',
      kids: [{ name: 'Lola', ageMonths: 64, interests: ['los pájaros', 'la música'] }],
      pets: [],
      toys: [{ name: 'la guitarrita' }, { name: 'el tambor rojo' }, { name: 'la lupa' }],
    },
  },
]
