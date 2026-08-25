import { apiClient, ApiError } from './client'

// Real ASSET catalog entities (kernel/domains/commerce.py::list_product) —
// the same records the order/inventory-reservation system actually reads,
// not a separate display-only copy.
export interface Product {
  id: string
  name: string
  price: number
  quantity: number
  store_id: string
}

export function fetchProducts(): Promise<Product[]> {
  return apiClient.request<{ success: boolean; products: Product[] }>('/products').then((r) => r.products)
}

// Real Store (ORGANIZATION) entities (kernel/domains/commerce.py::onboard_merchant)
// — owner_id is the merchant's actor_id, the rest are free-form attributes
// set at onboarding (is_open/hours/address/trust_score/...).
export interface Merchant {
  store_id: string
  name: string
  owner_id?: string
  is_open?: boolean
  hours?: string
  address?: string
  category?: string
  trust_score?: number
  reputation_rating?: number
  review_count?: number
  delivery_fee?: number
  [key: string]: unknown
}

export function fetchMerchants(): Promise<Merchant[]> {
  return apiClient.request<Merchant[]>('/merchants')
}

// Real Order (kernel/domains/grocery.py order-creation flow), read via
// GET /orders/{id} — the real per-order record, buyer + payment included.
// There is no GET /orders (list) or GET /wallets/{id} endpoint in this
// codebase; see OrdersWalletPanel.tsx's own note on how it discovers real
// order IDs for an actor without one.
export interface OrderItem { product_id: string; qty: number; price: number; product_name?: string }
export interface Order {
  order_id: string; name: string; items: OrderItem[]; subtotal: number; tax: number
  delivery_fee: number; total: number; status: string; created_at: number
  buyer_id: string; paid_wallet_id?: string; paid_amount?: number; payment_status?: string
  [key: string]: unknown
}
export function fetchOrder(orderId: string): Promise<Order> {
  return apiClient.request<Order>(`/orders/${orderId}`)
}

// GET /wallets/{id} — the real, live, authoritative balance (added this
// session: no GET /wallets endpoint existed at all before — the account
// entity itself, not a value reconstructed from past transaction text).
export interface Wallet { wallet_id: string; name: string; account_type?: string; balance: number; owner?: string; [key: string]: unknown }
export async function fetchWallet(walletId: string): Promise<Wallet | null> {
  try { return await apiClient.request<Wallet>(`/wallets/${walletId}`) }
  catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err }
}

// GET /actors/{id}/wallet — owner lookup (added this session, alongside
// fetchWallet above): finds an actor's real wallet even when they have
// no orders to learn its id from (every actor gets one at seed time —
// scripts/seed_world.py::ensure_wallet is unconditional).
export async function fetchActorWallet(actorId: string): Promise<Wallet | null> {
  try { return await apiClient.request<Wallet>(`/actors/${actorId}/wallet`) }
  catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err }
}

// GET /orders/{id}/tracking — real shipment/delivery state
// (kernel/domains/logistics.py::track_order). Answers honestly with a
// real "no shipment yet" (order still just "confirmed", never shipped)
// — that's a real status, not a missing endpoint. Live-verified: the
// backend's own error-to-status mapping (fulfillment.py::_result) sends
// this specific case as 400, not 404 — its substring check only maps to
// 404 when the message contains "no such" or "not found", and this
// message is "no shipment found for order ..." (matches neither), so
// 400 is what a real "not shipped" order actually returns here.
export interface OrderTracking { status?: string; eta?: string; [key: string]: unknown }
export async function fetchOrderTracking(orderId: string): Promise<OrderTracking | null> {
  try { return await apiClient.request<OrderTracking>(`/orders/${orderId}/tracking`) }
  catch (err) { if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null; throw err }
}
