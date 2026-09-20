import { Link } from '@tanstack/react-router'

/** The admin's three pages. The router marks the one open with `aria-current`. */
export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin">
      <Link to="/admin" activeOptions={{ exact: true }} className="admin-nav__link">
        Juegos
      </Link>
      <Link to="/admin/usuarios" className="admin-nav__link">
        Usuarios
      </Link>
      <Link to="/admin/uso" className="admin-nav__link">
        Uso
      </Link>
    </nav>
  )
}
