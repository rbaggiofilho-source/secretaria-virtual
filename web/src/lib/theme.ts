/** Tema claro/escuro do painel. Persistido por dispositivo (localStorage). */

export type Tema = 'light' | 'dark'
const KEY = 'rosana.theme'

export function getTema(): Tema {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'dark' || t === 'light') return t
  } catch {
    /* storage bloqueado */
  }
  return 'light'
}

export function aplicarTema(t: Tema) {
  try {
    document.documentElement.setAttribute('data-theme', t)
  } catch {
    /* sem DOM */
  }
}

export function setTema(t: Tema) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage bloqueado */
  }
  aplicarTema(t)
}
