-- JuGus Do-It Database Schema
-- Run this once on your Railway PostgreSQL instance

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  xp INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercises table (admin-managed)
CREATE TABLE IF NOT EXISTS exercises (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10) DEFAULT '💪',
  sets INTEGER NOT NULL DEFAULT 1,
  reps INTEGER NOT NULL DEFAULT 10,
  unit VARCHAR(20) DEFAULT 'répétitions',
  xp_reward INTEGER DEFAULT 10,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily checklist entries
CREATE TABLE IF NOT EXISTS checklist_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, exercise_id, entry_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_checklist_user_date ON checklist_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_exercises_active ON exercises(is_active, order_index);

-- Migration: add schedule column (array of day numbers 0=Sun..6=Sat, empty = every day)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS schedule INTEGER[] DEFAULT '{}';

-- Migration: add avatar column
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(10) DEFAULT '💪';

-- Seed default exercises
INSERT INTO exercises (name, emoji, sets, reps, unit, xp_reward, order_index) VALUES
  ('Pompes',  '💪', 1, 20, 'répétitions', 10, 1),
  ('Abdos',   '🔥', 1, 30, 'répétitions', 10, 2),
  ('Squats',  '🦵', 1, 30, 'répétitions', 10, 3)
ON CONFLICT DO NOTHING;
