export type UserRole = 'admin' | 'office' | 'dispatcher'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  company_name: string
  formal_name: string | null
  address: string | null
  contact: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Route {
  id: string
  departure: string
  destination: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PriceType = 'per_ton' | 'fixed' | 'spot'

export interface Price {
  id: string
  client_id: string
  route_id: string
  price_type: PriceType
  per_ton_rate: number | null
  fixed_amount: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  client?: Client
  route?: Route
}

export interface Driver {
  id: string
  name: string
  payment_percentage: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DispatchStatus = 'pending' | 'confirmed' | 'completed'

export interface Dispatch {
  id: string
  dispatch_date: string
  driver_id: string | null
  client_id: string | null
  route_id: string | null
  price_id: string | null
  loading_place: string | null
  unloading_place: string | null
  weight: number | null
  price_type: PriceType
  spot_amount: number | null
  calculated_amount: number
  status: DispatchStatus
  created_by: string | null
  created_at: string
  updated_at: string
  driver?: Driver
  client?: Client
  route?: Route
  price?: Price
}

export type DailyReportStatus = 'pending' | 'reviewed' | 'confirmed'

export interface DailyReport {
  id: string
  report_date: string
  driver_id: string | null
  pdf_url: string | null
  ocr_text: string | null
  ocr_data: Record<string, unknown> | null
  status: DailyReportStatus
  dispatch_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  driver?: Driver
  dispatch?: Dispatch
}
