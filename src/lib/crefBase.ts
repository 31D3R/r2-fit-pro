// CREF (registro no Conselho de Educação Física): mesmo formato conferido no banco (_normalizar_cref).
const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO'
const RE = new RegExp(`^(\\d{1,6})-?([GP])/?(${UFS})$`)

/** "CREF 12345-G/SP", "012345 g sp" → "012345-G/SP"; null quando o formato não serve. */
export function normalizarCref(c: string): string | null {
  const t = c.replace(/cref|[\s.]/gi, '').toUpperCase()
  const m = t.match(RE)
  return m ? `${m[1].padStart(6, '0')}-${m[2]}/${m[3]}` : null
}

/** Consulta pública de registrados do CONFEF (o admin confere por lá). */
export const LINK_CONSULTA_CREF = 'https://www.confef.org.br/confef/registrados/'
