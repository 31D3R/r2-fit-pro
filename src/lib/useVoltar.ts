// Voltar de uma tela: volta no histórico quando há para onde; aberta direto (link, notificação, app recém-aberto)
// vai para uma tela do app, em vez de sair do app ou não fazer nada.
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export function useVoltar(padrao = '/menu') {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(padrao, { replace: true })
  }, [navigate, padrao])
}
