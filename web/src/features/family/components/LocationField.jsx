import { Field } from '../../../shared/ui'

/**
 * Where the family lives, in the family form (JUG-25). It is read for one
 * thing: what the weather is like there, so a juego outside comes up on a
 * good afternoon and one inside when it rains. A city or a zone is all it
 * needs, so nothing here asks for a street, and the app never asks the phone
 * where it is.
 *
 * Unlike the family's own names, this is a public place, so the keyboard is
 * left to correct and capitalise it.
 *
 * Ludi looks the words up when they are saved. When it found nothing the
 * field says so plainly, since the weather is invisible and the parent has no
 * other way of knowing it isn't being read for them. The line goes as soon as
 * they write something else.
 * @param {{
 *   location: string | null,
 *   saved: import('../types').Location | null,
 *   onChange: (location: string) => void,
 * }} props `saved` is where the family last saved, and whether it was found
 */
export function LocationField({ location, saved, onChange }) {
  const missed = saved && !saved.located && (location ?? '').trim() === saved.name
  return (
    <Field
      // Voice pass pending.
      label="Dónde vivimos"
      help="La ciudad o la zona. La uso para saber qué tiempo hace cuando juegan."
      error={missed ? 'No encontré ese lugar. Probá con la ciudad.' : null}
      data-field="location"
      autoCapitalize="words"
      autoComplete="address-level2"
      maxLength={120}
      value={location ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
