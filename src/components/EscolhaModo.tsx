import { Briefcase, Dumbbell } from 'lucide-react'
import { definirModo } from '../lib/modoApp'

/** Início, na primeira vez: como a pessoa vai usar o app (dá para trocar depois pelo Menu ou pela faixa do painel). */
export default function EscolhaModo({ userId }: { userId: string }) {
  return (
    <section aria-label="Como você vai usar o app" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up">
      <h2 className="font-bold text-zinc-50">Como você vai usar o R2 Fit Pro?</h2>
      <p className="text-sm text-zinc-400 mt-1">Dá para trocar depois pelo Menu.</p>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button type="button" onClick={() => definirModo('aluno', userId)} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-100 active:scale-[0.98]">
          <Dumbbell className="w-6 h-6 text-green-400" /><span className="text-sm font-semibold">Para o meu treino e dieta</span>
        </button>
        <button type="button" onClick={() => definirModo('personal', userId)} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/30 text-zinc-100 active:scale-[0.98]">
          <Briefcase className="w-6 h-6 text-violet-300" /><span className="text-sm font-semibold">Sou personal trainer</span>
        </button>
      </div>
    </section>
  )
}
