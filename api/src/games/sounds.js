/**
 * The sound sets of ¿Qué suena? (JUG-177, and JUG-178 to JUG-185 for the
 * sets), a list in code like the materials and the themes. A set is played
 * as a juego: its catalog template names it in `game`, and each game deals
 * five of its sounds.
 *
 * Each sound is `api/sounds/<set>/<key>.mp3`, and `api/sounds/credits.json`
 * says where every recording came from and under what license. An item has
 * the name the options read, with its article; the group of items it sounds
 * close to, which is where an older kid's options come from; and the stems a
 * toy's words are matched against, read like the themes' (catalog/themes.js).
 * `pet` is the pet kind (families/kinds.js) whose name the item takes when
 * the family has one.
 *
 * Never change a set's or an item's key once templates carry it.
 */
import { readFileSync } from 'node:fs'
import { plain } from '../catalog/themes.js'
import { ValidationError } from '../errors.js'

/**
 * @typedef {object} SoundItem
 * @property {string} key the file's name, too
 * @property {string} name as the options read it, with its article
 * @property {string} group items that sound close share one
 * @property {string[]} stems what a toy's words are matched against; `$` ends a whole word
 * @property {string} [pet] the pet kind that lends the item its name
 */
/** @typedef {{ key: string, name: string, items: SoundItem[] }} SoundSet */
/** @typedef {{ type: 'sounds', set: string }} GameKind what a template plays: the game, and its set */
/**
 * @typedef {object} Credit where a recording came from
 * @property {string} file `<set>/<key>.mp3`
 * @property {string} title
 * @property {string} author
 * @property {string} source
 * @property {string} url
 * @property {string} license
 * @property {string} licenseUrl
 */

/** @type {SoundSet[]} */
export const SOUND_SETS = [
  {
    key: 'granja',
    name: 'Animales de la granja',
    items: [
      { key: 'vaca', name: 'una vaca', group: 'grandes', stems: ['vaca', 'vaqui', 'toro', 'terner'] },
      { key: 'caballo', name: 'un caballo', group: 'grandes', stems: ['caball', 'yegua', 'potr', 'poni', 'pony', 'percher'] },
      { key: 'burro', name: 'un burro', group: 'grandes', stems: ['burr', 'asno'] },
      { key: 'oveja', name: 'una oveja', group: 'balan', stems: ['ovej', 'corder'] },
      { key: 'cabra', name: 'una cabra', group: 'balan', stems: ['cabra', 'cabrit', 'chiv'] },
      { key: 'chancho', name: 'un chancho', group: 'chancho', stems: ['chanch', 'cerd', 'puerc'] },
      { key: 'gallo', name: 'un gallo', group: 'aves', stems: ['gallo$', 'gallos$'] },
      { key: 'gallina', name: 'una gallina', group: 'aves', stems: ['gallin'] },
      { key: 'pollito', name: 'un pollito', group: 'aves', stems: ['pollit', 'pollo$', 'pollos$'] },
      { key: 'pato', name: 'un pato', group: 'aves', stems: ['pato$', 'patos$', 'patit'] },
      { key: 'pavo', name: 'un pavo', group: 'aves', stems: ['pavo$', 'pavos$'] },
      { key: 'perro', name: 'un perro', group: 'casa', stems: ['perr', 'cachorr'], pet: 'perro' },
      { key: 'gato', name: 'un gato', group: 'casa', stems: ['gato$', 'gatos$', 'gatit', 'michi'], pet: 'gato' },
    ],
  },
  {
    key: 'vehiculos',
    name: 'Vehículos',
    items: [
      { key: 'auto', name: 'un auto', group: 'motores', stems: ['auto$', 'autos$', 'autit', 'coche', 'carrit'] },
      { key: 'moto', name: 'una moto', group: 'motores', stems: ['moto$', 'motos$', 'motit', 'motocicl'] },
      { key: 'colectivo', name: 'un colectivo', group: 'grandes', stems: ['colectiv', 'bondi', 'omnibus'] },
      { key: 'camion', name: 'un camión', group: 'grandes', stems: ['camion'] },
      { key: 'tractor', name: 'un tractor', group: 'grandes', stems: ['tractor'] },
      { key: 'tren', name: 'un tren', group: 'rieles', stems: ['tren$', 'trenes', 'trencit', 'locomot'] },
      { key: 'subte', name: 'el subte', group: 'rieles', stems: ['subte', 'metro$'] },
      { key: 'avion', name: 'un avión', group: 'aire', stems: ['avion', 'avioncit'] },
      { key: 'helicoptero', name: 'un helicóptero', group: 'aire', stems: ['helicop'] },
      { key: 'barco', name: 'un barco', group: 'agua', stems: ['barc', 'bote$', 'lancha', 'velero'] },
      { key: 'bicicleta', name: 'una bici', group: 'bici', stems: ['bici'] },
      { key: 'ambulancia', name: 'una ambulancia', group: 'sirenas', stems: ['ambulanc'] },
      { key: 'bomberos', name: 'los bomberos', group: 'sirenas', stems: ['bomber', 'autobomba'] },
    ],
  },
  {
    key: 'casa',
    name: 'Sonidos de la casa',
    items: [
      { key: 'timbre', name: 'el timbre', group: 'suenan', stems: ['timbre'] },
      { key: 'telefono', name: 'el teléfono', group: 'suenan', stems: ['telefon', 'celular', 'celu$'] },
      { key: 'despertador', name: 'el despertador', group: 'suenan', stems: ['despertad'] },
      { key: 'microondas', name: 'el microondas', group: 'suenan', stems: ['microond'] },
      { key: 'pava', name: 'la pava', group: 'cocina', stems: ['pava$', 'pavita'] },
      { key: 'canilla', name: 'la canilla', group: 'agua', stems: ['canilla'] },
      { key: 'inodoro', name: 'el inodoro', group: 'agua', stems: ['inodoro'] },
      { key: 'licuadora', name: 'la licuadora', group: 'motores', stems: ['licuad'] },
      { key: 'aspiradora', name: 'la aspiradora', group: 'motores', stems: ['aspirad'] },
      { key: 'secador', name: 'el secador de pelo', group: 'motores', stems: ['secador'] },
      { key: 'puerta', name: 'la puerta', group: 'manos', stems: [] },
      { key: 'llaves', name: 'las llaves', group: 'manos', stems: ['llave'] },
      { key: 'cierre', name: 'un cierre', group: 'manos', stems: [] },
    ],
  },
  {
    key: 'instrumentos',
    name: 'Instrumentos',
    items: [
      { key: 'piano', name: 'un piano', group: 'teclas', stems: ['pian', 'teclado'] },
      { key: 'xilofono', name: 'un xilófono', group: 'teclas', stems: ['xilof', 'metalof'] },
      { key: 'guitarra', name: 'una guitarra', group: 'cuerdas', stems: ['guitarr'] },
      { key: 'charango', name: 'un charango', group: 'cuerdas', stems: ['charang'] },
      { key: 'violin', name: 'un violín', group: 'cuerdas', stems: ['violin'] },
      { key: 'trompeta', name: 'una trompeta', group: 'viento', stems: ['trompeta', 'trompetit', 'cornet'] },
      { key: 'flauta', name: 'una flauta', group: 'viento', stems: ['flaut'] },
      { key: 'armonica', name: 'una armónica', group: 'viento', stems: ['armonic'] },
      { key: 'bandoneon', name: 'un bandoneón', group: 'viento', stems: ['bandone', 'acordeon'] },
      { key: 'tambor', name: 'un tambor', group: 'parches', stems: ['tambor'] },
      { key: 'bombo', name: 'un bombo', group: 'parches', stems: ['bombo$', 'bombos$'] },
      { key: 'maracas', name: 'unas maracas', group: 'sacudir', stems: ['maraca'] },
      { key: 'pandereta', name: 'una pandereta', group: 'sacudir', stems: ['pandere', 'pandero'] },
    ],
  },
  {
    key: 'cuerpo',
    name: 'Sonidos del cuerpo',
    items: [
      { key: 'aplauso', name: 'un aplauso', group: 'manos', stems: [] },
      { key: 'estornudo', name: 'un estornudo', group: 'golpes', stems: [] },
      { key: 'tos', name: 'la tos', group: 'golpes', stems: [] },
      { key: 'hipo', name: 'el hipo', group: 'golpes', stems: [] },
      { key: 'bostezo', name: 'un bostezo', group: 'sueño', stems: [] },
      { key: 'ronquido', name: 'un ronquido', group: 'sueño', stems: [] },
      { key: 'silbido', name: 'un silbido', group: 'labios', stems: [] },
      { key: 'beso', name: 'un beso', group: 'labios', stems: [] },
      { key: 'risa', name: 'una risa', group: 'risa', stems: [] },
    ],
  },
  {
    key: 'salvajes',
    name: 'Animales salvajes',
    items: [
      { key: 'leon', name: 'un león', group: 'rugen', stems: ['leon$', 'leones$', 'leona$', 'leonas$', 'leoncit'] },
      { key: 'oso', name: 'un oso', group: 'rugen', stems: ['oso$', 'osos$', 'osit', 'osezn'] },
      { key: 'lobo-marino', name: 'un lobo marino', group: 'rugen', stems: ['marino$', 'marinos$', 'foca', 'foquit'] },
      { key: 'elefante', name: 'un elefante', group: 'trompa', stems: ['elefant'] },
      { key: 'lobo', name: 'un lobo', group: 'aullan', stems: ['lobo$', 'lobos$', 'lobit'] },
      { key: 'buho', name: 'un búho', group: 'aullan', stems: ['buho', 'lechuz'] },
      { key: 'mono', name: 'un mono', group: 'gritan', stems: ['mono$', 'monos$', 'monit', 'chimpanc'] },
      { key: 'pinguino', name: 'un pingüino', group: 'gritan', stems: ['pinguin'] },
      { key: 'rana', name: 'una rana', group: 'chicos', stems: ['rana', 'ranit', 'sapo', 'sapit'] },
      { key: 'serpiente', name: 'una serpiente', group: 'chicos', stems: ['serpient', 'vibora', 'culebr'] },
    ],
  },
  {
    key: 'barrio',
    name: 'El barrio',
    items: [
      { key: 'colectivo', name: 'el colectivo', group: 'transito', stems: ['colectiv', 'bondi', 'omnibus'] },
      { key: 'subte', name: 'el subte', group: 'transito', stems: ['subte', 'metro$'] },
      { key: 'bocinazo', name: 'un bocinazo', group: 'transito', stems: ['bocin'] },
      { key: 'campana', name: 'las campanas', group: 'campanas', stems: ['campana$', 'campanas$'] },
      { key: 'barrera', name: 'la barrera del tren', group: 'campanas', stems: ['barrera'] },
      { key: 'afilador', name: 'el afilador', group: 'agudos', stems: [] },
      { key: 'cotorras', name: 'las cotorras', group: 'agudos', stems: ['cotorr', 'loro$', 'loros$', 'lorit'] },
      { key: 'obra', name: 'una obra', group: 'obra', stems: [] },
    ],
  },
  {
    key: 'pajaros',
    name: 'Pájaros del barrio',
    items: [
      { key: 'tero', name: 'un tero', group: 'gritan', stems: ['tero$', 'teros$'] },
      { key: 'hornero', name: 'un hornero', group: 'gritan', stems: ['horner'] },
      { key: 'benteveo', name: 'un benteveo', group: 'gritan', stems: ['bentev', 'bichofeo'] },
      { key: 'cotorra', name: 'una cotorra', group: 'gritan', stems: ['cotorr', 'loro$', 'loros$', 'lorit'] },
      { key: 'zorzal', name: 'un zorzal', group: 'cantan', stems: ['zorzal'] },
      { key: 'calandria', name: 'una calandria', group: 'cantan', stems: ['calandri'] },
      { key: 'gorrion', name: 'un gorrión', group: 'cantan', stems: ['gorrion'] },
      { key: 'paloma', name: 'una paloma', group: 'paloma', stems: ['palom'] },
    ],
  },
  {
    key: 'tiempo',
    name: 'Lluvia, viento y truenos',
    items: [
      { key: 'lluvia', name: 'la lluvia', group: 'cae', stems: [] },
      { key: 'llovizna', name: 'la llovizna', group: 'cae', stems: [] },
      { key: 'granizo', name: 'el granizo', group: 'cae', stems: [] },
      { key: 'gotera', name: 'una gotera', group: 'cae', stems: [] },
      { key: 'trueno', name: 'un trueno', group: 'trueno', stems: [] },
      { key: 'viento', name: 'el viento', group: 'viento', stems: [] },
      { key: 'charcos', name: 'los charcos', group: 'pasos', stems: [] },
      { key: 'nieve', name: 'la nieve', group: 'pasos', stems: [] },
    ],
  },
  {
    key: 'naturaleza',
    name: 'La naturaleza',
    items: [
      { key: 'olas', name: 'las olas', group: 'agua', stems: [] },
      { key: 'arroyo', name: 'un arroyo', group: 'agua', stems: [] },
      { key: 'cascada', name: 'una cascada', group: 'agua', stems: [] },
      { key: 'grillos', name: 'los grillos', group: 'bichos', stems: ['grillo', 'grillit'] },
      { key: 'chicharras', name: 'las chicharras', group: 'bichos', stems: ['chicharr', 'cigarra'] },
      { key: 'abejas', name: 'las abejas', group: 'bichos', stems: ['abeja', 'abejit', 'abejorr'] },
      { key: 'fuego', name: 'el fuego', group: 'crujen', stems: [] },
      { key: 'hojas', name: 'las hojas secas', group: 'crujen', stems: [] },
    ],
  },
]

export const SOUND_SET_KEYS = SOUND_SETS.map((set) => set.key)

/** @param {string} key @returns {SoundSet | undefined} */
export const soundSet = (key) => SOUND_SETS.find((set) => set.key === key)

/**
 * Refuses a game the catalog can't hold: only ¿Qué suena?, with a set on the
 * list. Null is an ordinary juego.
 * @param {GameKind | null | undefined} game
 */
export function checkGame(game) {
  if (game == null) return
  if (game.type !== 'sounds' || !soundSet(game.set)) {
    throw new ValidationError(`Unknown game: ${game.type}/${game.set}`, 'UNKNOWN_GAME')
  }
}

/** Where the recordings are. */
export const SOUNDS_DIR = new URL('../../sounds/', import.meta.url)

/** @type {Credit[]} */
const CREDITS = JSON.parse(readFileSync(new URL('credits.json', SOUNDS_DIR), 'utf8'))

/** Where a sound came from, or undefined for one not in the list. @param {string} set @param {string} key */
export const creditOf = (set, key) => CREDITS.find((credit) => credit.file === `${set}/${key}.mp3`)

/**
 * Whether a license asks for the author to be credited: all but CC0 and the
 * public domain do.
 * @param {string} license
 */
export const needsCredit = (license) => !/^(cc0|public domain|dominio p)/i.test(license.trim())

/** @param {string} word @param {string} stem */
const matches = (word, stem) => (stem.endsWith('$') ? word === plain(stem.slice(0, -1)) : word.startsWith(plain(stem)))

/**
 * Whether some words name an item: a word of them starts with one of its
 * stems, accents and case ignored.
 * @param {string} text the family's words
 * @param {string[]} stems
 */
export function mentions(text, stems) {
  const words = plain(text).split(/[^\p{L}]+/u)
  return words.some((word) => word && stems.some((stem) => matches(word, stem)))
}
