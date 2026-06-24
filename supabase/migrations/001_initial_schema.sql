-- NULE: 運送会社向け業務管理システム DBスキーマ

-- ユーザー管理テーブル
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'dispatcher')) DEFAULT 'dispatcher',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 荷主マスタ
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  address TEXT,
  contact TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ルートマスタ
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departure TEXT NOT NULL,
  destination TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 単価マスタ
-- price_type: 'per_ton' (t単価型), 'fixed' (固定単価型), 'spot' (スポット型)
CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL CHECK (price_type IN ('per_ton', 'fixed', 'spot')),
  per_ton_rate NUMERIC(12,2),
  fixed_amount NUMERIC(12,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ドライバーマスタ
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payment_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 配車データ
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_date DATE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  price_id UUID REFERENCES prices(id) ON DELETE SET NULL,
  loading_place TEXT,
  unloading_place TEXT,
  weight NUMERIC(10,2),
  price_type TEXT NOT NULL CHECK (price_type IN ('per_ton', 'fixed', 'spot')),
  spot_amount NUMERIC(12,2),
  calculated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 日報データ
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  pdf_url TEXT,
  ocr_text TEXT,
  ocr_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'confirmed')),
  dispatch_id UUID REFERENCES dispatches(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatches_driver ON dispatches(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_client ON dispatches(client_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_driver ON daily_reports(driver_id);
CREATE INDEX IF NOT EXISTS idx_prices_client_route ON prices(client_id, route_id);
