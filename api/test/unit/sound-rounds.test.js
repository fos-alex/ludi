import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { seededRandom } from '../../src/catalog/slots.js'
import { deal, familyWords, optionsFor, ROUNDS } from '../../src/games/rounds.js'
import { checkGame, creditOf, mentions, needsCredit, SOUND_SETS, SOUNDS_DIR, soundSet } from '../../src/games/sounds.js'

const granja = /** @type {import('../../src/games/sounds.js').SoundSet} */ (soundSet('granja'))
/** @param {string} key */
const item = (key) => /** @type {import('../../src/games/sounds.js').SoundItem} */ (granja.items.find((each) => each.key === key))
/** The item an option names, by its name in the set. @param {string} name */
const byName = (name) => /** @type {import('../../src/games/sounds.js').SoundItem} */ (granja.items.find((each) => each.name === name))

test('a game is five different sounds from its set, each with its answer among the options', () => {
  const game = deal(granja, { ageMonths: 40, random: seededRandom('five') })
  assert.equal(game.type, 'sounds')
  assert.equal(game.set, 'granja')
  assert.equal(game.rounds.length, ROUNDS)
  assert.equal(new Set(game.rounds.map((round) => round.sound)).size, ROUNDS)
  for (const round of game.rounds) {
    assert.equal(round.options[round.answer], item(round.sound).name)
    assert.equal(new Set(round.options).size, round.options.length)
  }
})

test('the youngest get three options, none of them close to the answer', () => {
  assert.deepEqual(optionsFor(20), { count: 3, close: 0 })
  for (const seed of ['a', 'b', 'c', 'd']) {
    for (const round of deal(granja, { ageMonths: 20, random: seededRandom(seed) }).rounds) {
      assert.equal(round.options.length, 3)
      for (const wrong of round.options.filter((_, index) => index !== round.answer)) {
        assert.notEqual(byName(wrong).group, item(round.sound).group)
      }
    }
  }
})

test('from 3 there are three options, and from 5 four, closer to the answer', () => {
  assert.deepEqual(optionsFor(40), { count: 3, close: 1 })
  assert.deepEqual(optionsFor(66), { count: 4, close: 3 })
  // A family that gave no ages is dealt as for a 3-year-old, like its stories.
  assert.deepEqual(optionsFor(null), optionsFor(36))

  const rounds = deal(granja, { ageMonths: 66, random: seededRandom('older') }).rounds
  for (const round of rounds) assert.equal(round.options.length, 4)
  // A horse is dealt beside the donkey and the cow, the two that sound most like it.
  const horse = Array.from({ length: 40 }, (_, seed) => deal(granja, { ageMonths: 66, random: seededRandom(`${seed}`) }))
    .flatMap((game) => game.rounds)
    .find((round) => round.sound === 'caballo')
  assert.ok(horse, 'some seed deals the horse')
  assert.ok(horse.options.includes('una vaca') && horse.options.includes('un burro'))
})

test('an option is the family pet by name, and a toy by the family name for it', () => {
  const words = familyWords(granja, {
    pets: [{ name: 'Inca', kind: 'perro' }],
    toys: [
      { name: 'Percherón', aliases: [], description: 'un caballo de plástico' },
      { name: 'el chanchito rosa', aliases: [], description: null },
      // A farm with every animal names none of them.
      { name: 'la granja', aliases: [], description: 'una granja con una vaca, un burro y ovejas' },
      { name: 'el dinosaurio chiquito', aliases: [], description: null },
    ],
  })
  assert.deepEqual(Object.fromEntries(words), { perro: 'Inca', caballo: 'Percherón', chancho: 'el chanchito rosa' })

  const game = deal(granja, { ageMonths: 66, words, random: seededRandom('words') })
  for (const round of game.rounds) {
    if (round.sound === 'perro') assert.equal(round.options[round.answer], 'Inca')
    assert.ok(!round.options.includes('un perro'))
  }
})

test('a toy lends its name to one item at most, and the first toy for an item wins', () => {
  const words = familyWords(granja, {
    pets: [],
    toys: [
      { name: 'el caballo percherón', aliases: [], description: null },
      { name: 'el caballito de madera', aliases: [], description: null },
    ],
  })
  assert.deepEqual(Object.fromEntries(words), { caballo: 'el caballo percherón' })
})

test('stems read the family words without accents or case, and whole words where they say so', () => {
  assert.ok(mentions('El Camión de Bomberos', ['camion']))
  assert.ok(mentions('los gallos', ['gallo$', 'gallos$']))
  assert.ok(!mentions('la gallina', ['gallo$', 'gallos$']))
  assert.ok(!mentions('la patineta', ['pato$', 'patos$', 'patit']))
})

test('only a sound set on the list can be a game', () => {
  assert.doesNotThrow(() => checkGame(null))
  assert.doesNotThrow(() => checkGame({ type: 'sounds', set: 'granja' }))
  assert.throws(() => checkGame({ type: 'sounds', set: 'dinosaurios' }), { code: 'UNKNOWN_GAME' })
  assert.throws(() => checkGame(/** @type {any} */ ({ type: 'palabras', set: 'granja' })), { code: 'UNKNOWN_GAME' })
})

test('a credit is shown only when the license asks for one', () => {
  assert.equal(needsCredit('CC0'), false)
  assert.equal(needsCredit('Public Domain'), false)
  assert.equal(needsCredit('CC-BY 4.0'), true)
  assert.equal(needsCredit('CC-BY-NC 3.0'), true)
})

test('every set has enough sounds for a game of four options, and unique keys', () => {
  assert.equal(new Set(SOUND_SETS.map((set) => set.key)).size, SOUND_SETS.length)
  for (const set of SOUND_SETS) {
    assert.ok(set.items.length >= ROUNDS + 3, set.key)
    assert.equal(new Set(set.items.map((each) => each.key)).size, set.items.length, set.key)
    assert.ok(new Set(set.items.map((each) => each.group)).size > 1, set.key)
  }
})

test('in every set, each sound has two that sound nothing like it, for the youngest', () => {
  for (const set of SOUND_SETS) {
    for (const each of set.items) {
      const unlike = set.items.filter((other) => other.group !== each.group)
      assert.ok(unlike.length >= optionsFor(20).count - 1, `${set.key}/${each.key}`)
    }
  }
})

test('every sound has its recording and says where it came from (JUG-178)', () => {
  for (const set of SOUND_SETS) {
    for (const each of set.items) {
      const file = `${set.key}/${each.key}.mp3`
      assert.ok(existsSync(new URL(file, SOUNDS_DIR)), `${file} is missing`)
      const credit = creditOf(set.key, each.key)
      assert.ok(credit, `${file} has no credit`)
      for (const field of /** @type {const} */ (['author', 'source', 'url', 'license', 'licenseUrl'])) {
        assert.ok(credit[field], `${file} has no ${field}`)
      }
      assert.doesNotMatch(credit.license, /\bND\b/i, `${file}: a NoDerivatives license can't be trimmed`)
    }
  }
})
