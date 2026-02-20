// =============================================
// Core domain types
// =============================================

export interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export interface Farm {
  id: string
  name: string
  owner_id: string
  country: string
  timezone: string
  created_at: string
}

export interface Subscription {
  id: string
  farm_id: string
  plan: 'free' | 'basic' | 'pro' | 'enterprise'
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  animal_limit: number
  animal_count?: number
  stripe_customer_id?: string
  stripe_subscription_id?: string
  current_period_end?: string
  trial_ends_at?: string
}

// =============================================
// Zones
// =============================================

export interface Zone {
  id: string
  farm_id: string
  group_id?: string
  name: string
  geometry: GeoJSON.Polygon
  area_ha: number
  grass_type?: string
  ugm_ha_limit?: number
  is_active: boolean
  animal_count?: number
  ugm_ha?: number
  current_herd?: string
  created_at: string
  updated_at: string
}

export interface ZoneGroup {
  id: string
  farm_id: string
  name: string
  animal_count: number
  zone_count: number
}

export interface KeyPoint {
  id: string
  farm_id: string
  name: string
  icon: 'water' | 'barn' | 'gate' | 'vet' | 'other'
  location: GeoJSON.Point
  is_active: boolean
}

export interface Perimeter {
  id: string
  farm_id: string
  name: string
  geometry: GeoJSON.Polygon
  area_ha: number
}

export interface ZoneUsage {
  id: string
  zone_id: string
  started_at: string
  ended_at?: string
  animal_count: number
  ugm_ha?: number
}

// =============================================
// Animals
// =============================================

export type AnimalSex = 'male' | 'female'
export type AnimalStatus = 'active' | 'sold' | 'dead'

export interface Animal {
  id: string
  farm_id: string
  herd_id?: string
  zone_id?: string
  ear_tag: string
  name?: string
  sex: AnimalSex
  breed?: string
  birth_date?: string
  entry_reason?: string
  status: AnimalStatus
  last_location?: GeoJSON.Point
  last_seen_at?: string
  // Joined
  herd_name?: string
  herd_color?: string
  zone_name?: string
  age_label?: string
  created_at: string
}

export interface Herd {
  id: string
  farm_id: string
  name: string
  color: string
  zone_id?: string
  zone_name?: string
  animal_count: number
}

export interface ReproductiveEvent {
  id: string
  animal_id: string
  event_type: 'mating' | 'pregnancy' | 'birth' | 'abortion' | 'weaning' | 'sale' | 'death'
  event_date: string
  partner_id?: string
  offspring_id?: string
  birth_weight?: number
  wean_weight?: number
  notes?: string
}

export interface WeightRecord {
  id: string
  animal_id: string
  weight_kg: number
  recorded_at: string
  notes?: string
  daily_gain?: number // calculated
}

// =============================================
// GPS & IoT
// =============================================

export interface GPSPoint {
  lat: number
  lng: number
  timestamp: string
  speed_kmh?: number
  battery?: number
}

export interface Device {
  id: string
  farm_id: string
  animal_id?: string
  animal_tag?: string
  device_uid: string
  type: 'collar' | 'ear_tag'
  battery_pct?: number
  last_ping_at?: string
  is_active: boolean
}

export interface Antenna {
  id: string
  farm_id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  is_active: boolean
  created_at: string
}

export interface WSEvent {
  type: 'gps_update' | 'alert' | 'device_status'
  farm_id: string
  animal_id?: string
  payload: GPSPayload | AlertPayload | DeviceStatusPayload
}

export interface GPSPayload {
  animal_id: string
  lat: number
  lng: number
  speed_kmh: number
  battery: number
  timestamp: string
}

export interface AlertPayload {
  type: string
  message: string
}

export interface DeviceStatusPayload {
  device_id: string
  battery_pct: number
  online: boolean
}

// =============================================
// Health
// =============================================

export interface HealthEvent {
  id: string
  farm_id: string
  animal_id?: string
  herd_id?: string
  animal_name?: string
  herd_name?: string
  event_type: 'disease' | 'vaccine' | 'feed' | 'sanitation' | 'other'
  name: string
  description?: string
  cost_cents: number
  currency: string
  dose_mg_kg?: number
  quantity_kg?: number
  animal_count: number
  started_at: string
  ended_at?: string
}

// =============================================
// Stats
// =============================================

export interface FarmOverview {
  total_animals: number
  active_animals: number
  total_zones: number
  occupied_zones: number
  alerts_today: number
  devices_online: number
  devices_offline: number
}

export interface BreedingStats {
  nodrizas: number
  terneros: number
  reproduction_pct: number
  pregnancies: number
  empty_cows: number
  births: number
  abortions: number
  sales: number
  deaths: number
}

// =============================================
// Marketplace
// =============================================

export interface Product {
  id: string
  name: string
  description?: string
  category: 'collar' | 'ear_tag' | 'antenna' | 'accessory'
  price_cents: number
  currency: string
  stock: number
  images: string[]
  specs: Record<string, string>
  is_active: boolean
}

export interface Order {
  id: string
  farm_id: string
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'canceled'
  total_cents: number
  currency: string
  items: OrderItem[]
  created_at: string
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  price_cents: number
}

// =============================================
// API helpers
// =============================================

export interface ApiResponse<T> {
  data: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface Alert {
  id: string
  farm_id: string
  animal_id?: string
  type: 'out_of_zone' | 'low_activity' | 'high_activity' | 'imminent_birth' | 'device_offline'
  severity: 'info' | 'warning' | 'critical'
  message: string
  is_read: boolean
  created_at: string
}
