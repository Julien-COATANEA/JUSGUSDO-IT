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

-- Migration: unique constraint on exercise name to prevent seed duplicates
DO $$
BEGIN
  -- Remove duplicate exercises, keeping the one with the lowest id
  DELETE FROM exercises a
  USING exercises b
  WHERE a.id > b.id AND a.name = b.name;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_name_unique'
  ) THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_name_unique UNIQUE (name);
  END IF;
END$$;

-- Seed default exercises
INSERT INTO exercises (name, emoji, sets, reps, unit, xp_reward, order_index) VALUES
  ('Pompes',  '💪', 1, 20, 'répétitions', 10, 1),
  ('Abdos',   '🔥', 1, 30, 'répétitions', 10, 2),
  ('Squats',  '🦵', 1, 30, 'répétitions', 10, 3)
ON CONFLICT (name) DO NOTHING;

-- Migration: is_running flag for running sessions (gives 15 XP instead of 10)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_running BOOLEAN DEFAULT FALSE;

-- Migration: per-user exercise assignments
-- If assigned_users is empty/null → exercise is global (all users see it)
-- If assigned_users has values → only those users see it
CREATE TABLE IF NOT EXISTS user_exercise_assignments (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  schedule    INTEGER[] DEFAULT '{}',
  PRIMARY KEY (user_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS idx_uea_exercise ON user_exercise_assignments(exercise_id);
CREATE INDEX IF NOT EXISTS idx_uea_user ON user_exercise_assignments(user_id);

-- Migration: per-user schedule on assignments
ALTER TABLE user_exercise_assignments ADD COLUMN IF NOT EXISTS schedule INTEGER[] DEFAULT '{}';

-- Migration: muscle records (personal bests for weightlifting)
CREATE TABLE IF NOT EXISTS muscle_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_name VARCHAR(100) NOT NULL,
  sets INTEGER NOT NULL,
  weight_kg DECIMAL(5,1) NOT NULL,
  notes VARCHAR(255),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, exercise_name)
);
CREATE INDEX IF NOT EXISTS idx_muscle_records_user ON muscle_records(user_id);
-- Migration: add category to muscle_records
ALTER TABLE muscle_records ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Autre';
-- Migration: add reps to muscle_records
ALTER TABLE muscle_records ADD COLUMN IF NOT EXISTS reps INTEGER;

-- Migration: push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  reminder_time TIME DEFAULT TIME '19:00',
  time_zone     VARCHAR(100) DEFAULT 'Europe/Paris',
  last_sent_on  DATE,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT TIME '19:00';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS time_zone VARCHAR(100) DEFAULT 'Europe/Paris';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_sent_on DATE;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_reminder_time ON push_subscriptions(reminder_time);

-- Migration: tokens (earned via mini-game)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;

-- Mini-game daily plays tracking
CREATE TABLE IF NOT EXISTS minigame_plays (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_date DATE NOT NULL,
  won BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, play_date)
);
-- Trolls table (spend 1 gem to send a pre-defined troll to another user)
CREATE TABLE IF NOT EXISTS trolls (
  id          SERIAL PRIMARY KEY,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_key VARCHAR(50) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  read        BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_trolls_receiver ON trolls(receiver_id, read);

-- Migration: add level to minigame_plays (easy/medium/hard, 1 play per level per day)
ALTER TABLE minigame_plays ADD COLUMN IF NOT EXISTS level VARCHAR(10) DEFAULT 'easy';
DO $$
BEGIN
  -- Replace old (user_id, play_date) unique with (user_id, play_date, level)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'minigame_plays_user_id_play_date_key') THEN
    ALTER TABLE minigame_plays DROP CONSTRAINT minigame_plays_user_id_play_date_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'minigame_plays_user_id_play_date_level_key') THEN
    ALTER TABLE minigame_plays ADD CONSTRAINT minigame_plays_user_id_play_date_level_key UNIQUE (user_id, play_date, level);
  END IF;
END$$;
