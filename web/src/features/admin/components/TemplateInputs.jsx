import { useId } from 'react'

/**
 * A labelled text box, worded like Field: errors under it replace the help.
 * @param {{
 *   label: string,
 *   help?: string,
 *   error?: string,
 *   rows?: number,
 *   maxLength?: number,
 *   value: string,
 *   onChange: (value: string) => void,
 * }} props
 */
export function TextArea({ label, help, error, rows = 3, maxLength, value, onChange }) {
  const id = useId()
  const note = error || help
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control admin-area">
        <textarea
          id={id}
          className="field__input"
          rows={rows}
          maxLength={maxLength}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {note && (
        <p id={`${id}-note`} className={error ? 'field__error' : 'field__help'}>
          {note}
        </p>
      )}
    </div>
  )
}

/** @param {{ label: string, value: string, options: [string, string][], onChange: (value: string) => void }} props */
export function Select({ label, value, options, onChange }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <select id={id} className="field__input" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map(([option, name]) => (
            <option key={option} value={option}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} props */
export function Check({ label, checked, onChange }) {
  return (
    <label className="admin-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
