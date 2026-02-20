-- Migration 002: Create missing tables for environments without PostGIS
-- Uses TEXT for geometry/location columns where GEOGRAPHY would normally be used.
-- All CREATE TABLE statements use IF NOT EXISTS so they are idempotent and
-- do not overwrite tables already created by migration 001 (PostGIS environments).

CREATE TABLE IF NOT EXISTS perimeters (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    geometry   TEXT NOT NULL DEFAULT '{}',
    area_ha    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zones (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    group_id     UUID REFERENCES zone_groups(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    geometry     TEXT NOT NULL DEFAULT '{}',
    area_ha      NUMERIC(10,2) NOT NULL DEFAULT 0,
    grass_type   TEXT,
    ugm_ha_limit NUMERIC(6,2),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS key_points (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'water',
    location   TEXT NOT NULL DEFAULT '0,0',
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zone_usages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id      UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    started_at   TIMESTAMPTZ NOT NULL,
    ended_at     TIMESTAMPTZ,
    animal_count INT NOT NULL DEFAULT 0,
    ugm_ha       NUMERIC(6,2),
    notes        TEXT
);

CREATE TABLE IF NOT EXISTS herds (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#22c55e',
    zone_id    UUID REFERENCES zones(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS animals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    herd_id      UUID REFERENCES herds(id) ON DELETE SET NULL,
    zone_id      UUID REFERENCES zones(id) ON DELETE SET NULL,
    ear_tag      TEXT NOT NULL,
    name         TEXT,
    species      TEXT NOT NULL DEFAULT 'bovine',
    sex          TEXT NOT NULL,
    breed        TEXT,
    birth_date   DATE,
    entry_reason TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    last_location TEXT,
    last_seen_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(farm_id, ear_tag)
);

CREATE INDEX IF NOT EXISTS idx_animals_farm ON animals(farm_id);
CREATE INDEX IF NOT EXISTS idx_animals_herd ON animals(herd_id);
CREATE INDEX IF NOT EXISTS idx_animals_zone ON animals(zone_id);

CREATE TABLE IF NOT EXISTS devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL,
    device_uid   TEXT UNIQUE NOT NULL,
    api_key      TEXT UNIQUE NOT NULL,
    type         TEXT NOT NULL DEFAULT 'collar',
    battery_pct  INT,
    last_ping_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS antennas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '0,0',
    radius_m   INT NOT NULL DEFAULT 3000,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gps_tracks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    animal_id   UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    location    TEXT NOT NULL DEFAULT '0,0',
    speed_kmh   NUMERIC(5,2),
    battery_pct INT,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_tracks_animal_time ON gps_tracks(animal_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS reproductive_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id    UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    event_date   DATE NOT NULL,
    partner_id   UUID REFERENCES animals(id),
    offspring_id UUID REFERENCES animals(id),
    birth_weight NUMERIC(5,2),
    wean_weight  NUMERIC(5,2),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weight_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id   UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    weight_kg   NUMERIC(7,2) NOT NULL,
    recorded_at DATE NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL,
    herd_id      UUID REFERENCES herds(id) ON DELETE SET NULL,
    event_type   TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    cost_cents   INT NOT NULL DEFAULT 0,
    currency     TEXT NOT NULL DEFAULT 'BRL',
    dose_mg_kg   NUMERIC(8,2),
    quantity_kg  NUMERIC(10,2),
    animal_count INT NOT NULL DEFAULT 1,
    started_at   DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at     DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id  UUID REFERENCES animals(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    severity   TEXT NOT NULL DEFAULT 'info',
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
