import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reusing } from '../../src/activities/reuse.js'

/** @param {string} slug @param {string[]} materials */
const candidate = (slug, materials) => ({
  template: /** @type {import('../../src/catalog/catalog.service.js').FillableActivityTemplate} */ (
    /** @type {unknown} */ ({ slug, materials })
  ),
  fill: {},
})

const slugs = (/** @type {{ template: { slug: string } }[]} */ list) => list.map((each) => each.template.slug)

const CANDIDATES = [
  candidate('nada', []),
  candidate('la-carpa', ['mantas', 'almohadones']),
  candidate('el-tunel', ['mantas']),
  candidate('el-puente', ['mantas', 'almohadones', 'cinta']),
  candidate('la-pista', ['mantas', 'cinta', 'cajas']),
  candidate('el-dibujo', ['papel', 'crayones']),
]

test('a juego continues another when it adds one material at most and shares one', () => {
  // The carpa is on the floor: sheets and cushions.
  assert.deepEqual(slugs(reusing(CANDIDATES, ['mantas', 'almohadones'])), ['la-carpa', 'el-tunel', 'el-puente'])
})

test('a juego that needs nothing is never the next one', () => {
  assert.equal(slugs(reusing(CANDIDATES, ['mantas'])).includes('nada'), false)
})

test('a juego with nothing in common is left out', () => {
  assert.equal(slugs(reusing(CANDIDATES, ['mantas', 'almohadones'])).includes('el-dibujo'), false)
  // Sharing one is enough: the paper is out, so the crayons are all to fetch.
  assert.deepEqual(slugs(reusing(CANDIDATES, ['papel'])), ['el-dibujo'])
})

test('two new materials are one too many', () => {
  // La pista shares the sheets but asks for tape and boxes.
  assert.equal(slugs(reusing(CANDIDATES, ['mantas'])).includes('la-pista'), false)
  assert.equal(slugs(reusing(CANDIDATES, ['mantas', 'cinta'])).includes('la-pista'), true)
})

test('a juego that needed nothing starts no chain', () => {
  assert.deepEqual(reusing(CANDIDATES, []), [])
})
