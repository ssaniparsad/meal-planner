-- Run this in the Supabase SQL editor to set up the schema

-- Weekly meal plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_slot text NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
  meal_name text NOT NULL,
  notes text,
  is_suggested boolean DEFAULT false,
  approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_plans_week_idx ON meal_plans (week_start);

-- Shopping list
CREATE TABLE IF NOT EXISTS shopping_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  item text NOT NULL,
  quantity text,
  category text CHECK (category IN ('produce', 'meat', 'dairy', 'pantry', 'other')),
  checked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_list_week_idx ON shopping_list (week_start);

-- Meal history (seeded from WhatsApp)
CREATE TABLE IF NOT EXISTS meal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_name text UNIQUE NOT NULL,
  frequency int DEFAULT 1,
  last_cooked date,
  source text DEFAULT 'whatsapp',
  tags text[] DEFAULT '{}'
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER meal_plans_updated_at
  BEFORE UPDATE ON meal_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
