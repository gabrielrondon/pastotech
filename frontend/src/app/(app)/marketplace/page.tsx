'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingCart, Package, Minus, Plus, X, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product, Order } from '@/types'

type Tab = 'products' | 'orders'

// ─── Cart item type ───────────────────────────────────────────────────────────
interface CartItem {
  product: Product
  quantity: number
}

// ─── Category labels ──────────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  collar:    'Colares GPS',
  ear_tag:   'Brincos GPS',
  antenna:   'Antenas',
  accessory: 'Acessórios',
}

// ─── Status labels ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendente',   color: 'text-amber-600 bg-amber-50' },
  paid:      { label: 'Pago',       color: 'text-blue-600 bg-blue-50' },
  shipped:   { label: 'Enviado',    color: 'text-purple-600 bg-purple-50' },
  delivered: { label: 'Entregue',   color: 'text-green-600 bg-green-50' },
  canceled:  { label: 'Cancelado',  color: 'text-gray-500 bg-gray-100' },
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const [tab, setTab] = useState<Tab>('products')
  const [cart, setCart] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price_cents * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-gray-500 text-sm mt-0.5">Sensores GPS, colares e acessórios</p>
        </div>
        {cartCount > 0 && (
          <button
            onClick={() => setCheckoutOpen(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            {cartCount} {cartCount === 1 ? 'item' : 'itens'} · {formatCurrency(cartTotal, 'BRL')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { v: 'products', l: 'Produtos' },
          { v: 'orders', l: 'Meus pedidos' },
        ] as { v: Tab; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === v
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <ProductsTab cart={cart} onAdd={addToCart} />
      )}
      {tab === 'orders' && <OrdersTab />}

      {/* Cart drawer */}
      {checkoutOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onRemove={removeFromCart}
          onUpdateQty={updateQty}
          onOrderPlaced={() => {
            setCart([])
            setCheckoutOpen(false)
            setTab('orders')
          }}
        />
      )}
    </div>
  )
}

// ─── PRODUCTS TAB ─────────────────────────────────────────────────────────────
function ProductsTab({
  cart,
  onAdd,
}: {
  cart: CartItem[]
  onAdd: (p: Product) => void
}) {
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['products', categoryFilter],
    queryFn: async () => {
      const params = categoryFilter ? `?category=${categoryFilter}` : ''
      const res = await api.get<{ data: Product[] }>(`/marketplace/products${params}`)
      return res.data.data
    },
  })

  const products = data ?? []
  const cartIds = new Set(cart.map((i) => i.product.id))

  return (
    <>
      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ v: '', l: 'Todos' }, ...Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ v, l }))].map(
          ({ v, l }) => (
            <button
              key={v}
              onClick={() => setCategoryFilter(v)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                categoryFilter === v
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}
            >
              {l}
            </button>
          )
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Nenhum produto disponível
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              inCart={cartIds.has(p.id)}
              onAdd={() => onAdd(p)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function ProductCard({
  product: p,
  inCart,
  onAdd,
}: {
  product: Product
  inCart: boolean
  onAdd: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow">
      {/* Image placeholder */}
      <div className="h-36 bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <Package className="w-12 h-12 text-green-300" />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-semibold text-gray-900 text-sm leading-snug">{p.name}</p>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
            {CATEGORY_LABEL[p.category] ?? p.category}
          </span>
        </div>

        {p.description && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
        )}

        <div className="flex items-center justify-between mt-3">
          <div>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(p.price_cents, p.currency)}
            </p>
            <p className={cn(
              'text-xs',
              p.stock > 5 ? 'text-green-500' : p.stock > 0 ? 'text-amber-500' : 'text-red-400'
            )}>
              {p.stock > 0 ? `${p.stock} em estoque` : 'Esgotado'}
            </p>
          </div>

          <button
            onClick={onAdd}
            disabled={p.stock === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              inCart
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-40'
            )}
          >
            {inCart ? (
              <><CheckCircle className="w-3.5 h-3.5" /> No carrinho</>
            ) : (
              <><Plus className="w-3.5 h-3.5" /> Adicionar</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ORDERS TAB ───────────────────────────────────────────────────────────────
function OrdersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await api.get<{ data: Order[] }>('/marketplace/orders')
      return res.data.data
    },
  })

  const orders = data ?? []

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 text-sm">
        Nenhum pedido realizado ainda
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Pedido</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Data</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="text-right px-4 py-3 font-medium text-green-600">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {orders.map((o) => {
            const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending
            return (
              <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                  {o.id.slice(0, 8).toUpperCase()}
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">
                  {new Date(o.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3.5">
                  <span className={cn('text-xs font-medium px-2 py-1 rounded-full', st.color)}>
                    {st.label}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                  {formatCurrency(o.total_cents, o.currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── CART DRAWER ──────────────────────────────────────────────────────────────
function CartDrawer({
  cart,
  onClose,
  onRemove,
  onUpdateQty,
  onOrderPlaced,
}: {
  cart: CartItem[]
  onClose: () => void
  onRemove: (id: string) => void
  onUpdateQty: (id: string, delta: number) => void
  onOrderPlaced: () => void
}) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const total = cart.reduce((sum, i) => sum + i.product.price_cents * i.quantity, 0)

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post('/marketplace/orders', {
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        shipping_addr: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setSuccess(true)
      setTimeout(onOrderPlaced, 1500)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Carrinho</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-gray-900">Pedido realizado!</p>
            <p className="text-sm text-gray-500">Acompanhe em Meus pedidos.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(item.product.price_cents, item.product.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQty(item.product.id, -1)}
                      className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.product.id, 1)}
                      className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onRemove(item.product.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400 ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-5 border-t border-gray-100 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-gray-900 text-base">{formatCurrency(total, 'BRL')}</span>
              </div>
              <button
                onClick={() => { setLoading(true); placeOrder.mutate() }}
                disabled={loading || cart.length === 0}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Confirmar pedido'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Pagamento por Pix ou cartão — em breve
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
