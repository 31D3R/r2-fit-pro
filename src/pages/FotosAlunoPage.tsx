import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fotosDoAluno, type FotoAluno } from '../lib/acompanhamento'
import { useDonoDoPlano } from '../lib/planoDoAluno'
import FaixaPlanoAluno from '../components/acompanhamento/FaixaPlanoAluno'
import { Spinner } from '../components/UI'

const POSES: Record<string, string> = { frente: 'Frente', lado: 'Lado', costas: 'Costas' }
const dataBr = (d: string) => { const [a, m, dia] = d.slice(0, 10).split('-'); return `${dia}/${m}/${a}` }

/** Fotos de evolução do aluno, só para ver (o aluno libera em Personal → "Pode ver minhas fotos"). */
export default function FotosAlunoPage() {
  const { alunoId } = useParams<{ alunoId: string }>()
  const dono = useDonoDoPlano(alunoId)
  const [fotos, setFotos] = useState<(FotoAluno & { url?: string })[] | null>(null)
  const [erro, setErro] = useState('')
  const [pose, setPose] = useState('todas')
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    if (!alunoId) return
    fotosDoAluno(alunoId).then(async lista => {
      if (lista.length) {
        const { data: urls } = await supabase.storage.from('evolucao').createSignedUrls(lista.map(f => f.caminho), 3600)
        const porCaminho = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
        setFotos(lista.map(f => ({ ...f, url: porCaminho.get(f.caminho) ?? undefined })))
      } else setFotos([])
    }).catch(e => { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as fotos.'); setFotos([]) })
  }, [alunoId])

  const visiveis = useMemo(() => (fotos ?? []).filter(f => pose === 'todas' || f.pose === pose), [fotos, pose])
  const foto = fotos?.find(f => f.id === aberta)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to={`/alunos/${alunoId}`} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar"><ChevronLeft className="w-5 h-5" /></Link>
        <h1 className="text-xl font-bold text-zinc-50 flex items-center gap-2"><Camera className="w-5 h-5 text-green-400" />Fotos de evolução</h1>
      </div>
      <FaixaPlanoAluno dono={dono} oque="fotos" />
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {fotos === null ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : fotos.length === 0 ? (
        !erro && <p className="text-sm text-zinc-500 text-center py-8">O aluno ainda não tem fotos de evolução.</p>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {['todas', ...Object.keys(POSES)].map(p => (
              <button key={p} onClick={() => setPose(p)} aria-pressed={pose === p}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border ${pose === p ? 'bg-green-500 text-zinc-950 border-green-500' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>
                {p === 'todas' ? 'Todas' : POSES[p]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {visiveis.map(f => (
              <button key={f.id} onClick={() => setAberta(f.id)} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                {f.url && <img src={f.url} alt={`${POSES[f.pose] ?? f.pose} em ${dataBr(f.data)}`} className="w-full h-full object-cover" loading="lazy" />}
                <span className="absolute bottom-0 inset-x-0 bg-zinc-950/70 text-[10px] text-zinc-200 py-0.5">{dataBr(f.data)} · {POSES[f.pose] ?? f.pose}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {foto?.url && (
        <div role="dialog" aria-label="Foto ampliada" onClick={() => setAberta(null)} className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col items-center justify-center p-4 gap-2">
          <img src={foto.url} alt="" className="max-h-[80vh] max-w-full rounded-xl object-contain" />
          <p className="text-sm text-zinc-300">{dataBr(foto.data)} · {POSES[foto.pose] ?? foto.pose} · toque para fechar</p>
        </div>
      )}
    </div>
  )
}
