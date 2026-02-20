import Link from 'next/link'
import { MapPin, Wifi, BarChart2, ShoppingBag, CheckCircle, ArrowRight } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐄</span>
            <span className="font-bold text-gray-900 text-lg">PastoTech</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Entrar
            </Link>
            <Link
              href="/register"
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-green-100">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Monitoramento em tempo real
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
          Gestão inteligente<br />
          <span className="text-green-600">do seu rebanho</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          GPS em tempo real, alertas sanitários, controle reprodutivo e muito mais.
          Tudo no seu celular, do piquete ao escritório.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
          >
            Criar conta grátis
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
          >
            Já tenho conta
          </Link>
        </div>
        <p className="text-xs text-gray-400 mt-4">Gratuito até 5 animais • Sem cartão de crédito</p>
      </section>

      {/* Feature grid */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Tudo que você precisa, em um lugar só
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: MapPin,
                title: 'GPS em tempo real',
                desc: 'Acompanhe cada animal no mapa satellite. Alertas automáticos de saída de zona.',
                color: 'bg-blue-50 text-blue-600',
              },
              {
                icon: BarChart2,
                title: 'Estatísticas zootécnicas',
                desc: 'Taxa de prenhez, GMD por lote, custo sanitário e rentabilidade em gráficos claros.',
                color: 'bg-green-50 text-green-600',
              },
              {
                icon: Wifi,
                title: 'IoT integrado',
                desc: 'Colares e brincos GPS conectados via WebSocket. Dados chegam em segundos.',
                color: 'bg-purple-50 text-purple-600',
              },
              {
                icon: ShoppingBag,
                title: 'Marketplace',
                desc: 'Compre sensores GPS, colares e antenas direto na plataforma. Sem intermediários.',
                color: 'bg-amber-50 text-amber-600',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-sm transition-shadow">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Preços simples e justos</h2>
          <p className="text-center text-gray-500 mb-12">
            Comece grátis. Escale quando precisar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                name: 'Free',
                price: 'R$0',
                period: 'para sempre',
                limit: '5 animais',
                features: ['Mapa GPS', 'Saúde', 'Agenda', 'Estatísticas básicas'],
                cta: 'Começar grátis',
                href: '/register',
                highlight: false,
              },
              {
                name: 'Basic',
                price: 'R$99',
                period: '/mês',
                limit: '50 animais',
                features: ['Tudo do Free', 'Histórico 30 dias', 'Alertas de zona', 'Estatísticas avançadas'],
                cta: 'Assinar Basic',
                href: '/register',
                highlight: true,
              },
              {
                name: 'Pro',
                price: 'R$299',
                period: '/mês',
                limit: '500 animais',
                features: ['Tudo do Basic', 'Histórico 1 ano', 'API pública', 'Suporte prioritário'],
                cta: 'Assinar Pro',
                href: '/register',
                highlight: false,
              },
            ].map(({ name, price, period, limit, features, cta, href, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  highlight
                    ? 'border-green-500 bg-green-50 shadow-lg'
                    : 'border-gray-100 bg-white'
                }`}
              >
                {highlight && (
                  <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full mb-3 self-start">
                    Mais popular
                  </span>
                )}
                <p className="font-bold text-gray-900 text-lg">{name}</p>
                <p className="text-xs text-gray-500 mb-3">{limit}</p>
                <p className="text-3xl font-extrabold text-gray-900">
                  {price}
                  <span className="text-sm font-normal text-gray-400">{period}</span>
                </p>

                <ul className="space-y-2 my-6 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={href}
                  className={`text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    highlight
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'border border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-3xl font-bold text-white mb-4">
            Pronto para modernizar sua fazenda?
          </p>
          <p className="text-green-100 mb-8">
            Junte-se a produtores que já usam tecnologia GPS para melhorar seus resultados.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-green-700 font-bold px-8 py-3.5 rounded-xl hover:bg-green-50 transition-colors"
          >
            Criar conta grátis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐄</span>
            <span className="font-bold text-gray-700">PastoTech</span>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} PastoTech. Todos os direitos reservados.
          </p>
          <div className="flex gap-4 text-xs text-gray-400">
            <Link href="#" className="hover:text-gray-600">Privacidade</Link>
            <Link href="#" className="hover:text-gray-600">Termos</Link>
            <Link href="#" className="hover:text-gray-600">Contato</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
