// Endereço interno do app (vindo de link, notificação ou do app Android): só caminhos do próprio site.
// Recusa "//site.com", "/\site.com" e outros truques que fariam o navegador sair do R2 Fit Pro.
export function caminhoInterno(u: unknown): string | null {
  if (typeof u !== 'string' || u.length > 300) return null
  if (!/^\/(?![/\\])[A-Za-z0-9/_\-?=&.%#+:~]*$/.test(u) || u.includes('\\') || u.includes('//')) return null
  return u
}
