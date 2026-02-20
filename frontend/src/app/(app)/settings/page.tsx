'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CheckCircle, Zap, Building2, Sprout } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import type { Subscription } from '@/types'

interface Plan {
  id: string
  name: string
  animal_limit: number
  price_cents: number
  currency: string
}

interface SubscriptionResponse {
  subscription: Subscription
  plans: Plan[]
}

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Sprout,
  basic: Zap,
  pro: CheckCircle,
  enterprise: Building2,
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    'Até 5 animais monitorados',
    'Mapa GPS em tempo real',
    'Registros de saúde',
    'Agenda básica',
  ],
  basic: [
    'Até 50 animais monitorados',
    'Tudo do Free',
    'Estatísticas avançadas',
    'Histórico GPS (30 dias)',
    'Alertas de zona',
  ],
  pro: [
    'Até 500 animais monitorados',
    'Tudo do Basic',
    'Histórico GPS (1 ano)',
    'API pública',
    'Suporte prioritário',
  ],
  enterprise: [
    'Animais ilimitados',
    'Tudo do Pro',
    'SLA dedicado',
    'Integração personalizada',
    'Gerente de conta',
  ],
}

export default function SettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await api.get<{ data: SubscriptionResponse }>('/subscription')
      return res.data.data
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ data: { url: string } }>('/subscription/checkout', {
        plan_id: planId,
        success_url: window.location.origin + '/settings?success=1',
        cancel_url: window.location.origin + '/settings',
      }),
    onSuccess: (res) => {
      window.location.href = res.data.data.url
    },
  })

  const portalMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: { url: string } }>('/subscription/portal', {
        return_url: window.location.href,
      }),
    onSuccess: (res) => {
      window.location.href = res.data.data.url
    },
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const sub = data?.subscription
  const plans = data?.plans ?? []

  const usagePct = sub
    ? Math.min(100, Math.round((sub.animal_count ?? 0) / sub.animal_limit * 100))
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Assinatura</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gerencie seu plano e uso</p>
      </div>

      {/* Current usage */}
      {sub && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">Plano atual</p>
              <p className="text-xl font-bold text-gray-900 capitalize">{sub.plan}</p>
            </div>
            {sub.plan !== 'free' && sub.stripe_subscription_id && (
              <button
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                {portalMutation.isPending ? 'Abrindo...' : 'Gerenciar cobrança →'}
              </button>
            )}
          </div>

          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600">Animais monitorados</span>
            <span className={cn(
              'font-semibold',
              usagePct >= 90 ? 'text-red-500' : usagePct >= 70 ? 'text-amber-500' : 'text-green-600'
            )}>
              {sub.animal_count ?? 0} / {sub.animal_limit}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                usagePct >= 90 ? 'bg-red-400' : usagePct >= 70 ? 'bg-amber-400' : 'bg-green-500'
              )}
              style={{ width: `${usagePct}%` }}
            />
          </div>

          {sub.current_period_end && (
            <p className="text-xs text-gray-400 mt-3">
              Próxima renovação: {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const isCurrentPlan = sub?.plan === plan.id
          const Icon = PLAN_ICONS[plan.id] ?? Zap
          const features = PLAN_FEATURES[plan.id] ?? []
          const isFree = plan.price_cents === 0

          return (
            <div
              key={plan.id}
              className={cn(
                'rounded-xl border p-5 flex flex-col',
                isCurrentPlan
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-100 bg-white'
              )}
            >
              <div className="mb-4">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center mb-3',
                  isCurrentPlan ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="font-bold text-gray-900">{plan.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Até {plan.animal_limit >= 99999 ? 'ilimitados' : plan.animal_limit} animais
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-3">
                  {isFree ? 'Grátis' : formatCurrency(plan.price_cents, plan.currency)}
                  {!isFree && <span className="text-sm font-normal text-gray-400">/mês</span>}
                </p>
              </div>

              <ul className="space-y-2 flex-1 mb-5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <div className="text-center text-xs font-semibold text-green-600 py-2">
                  Plano atual
                </div>
              ) : isFree ? null : (
                <button
                  onClick={() => checkoutMutation.mutate(plan.id)}
                  disabled={checkoutMutation.isPending}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {checkoutMutation.isPending ? 'Aguarde...' : 'Assinar'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* FAQ note */}
      <div className="mt-8 bg-gray-50 rounded-xl p-5 text-sm text-gray-500 space-y-2">
        <p><strong className="text-gray-700">Sobre o modelo freemium:</strong> Monitore até 5 animais gratuitamente. Para rebanhos maiores, escolha um plano pago.</p>
        <p>O pagamento é feito pelo Stripe e você pode cancelar a qualquer momento.</p>
        <p>Sensores GPS podem ser adquiridos no <strong className="text-gray-700">Marketplace</strong> independentemente do plano.</p>
      </div>
    </div>
  )
}
