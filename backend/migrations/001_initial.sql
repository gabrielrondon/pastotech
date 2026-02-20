-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- =============================================
-- USERS & AUTH
-- =============================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- FARMS (multi-tenant)
-- =============================================
CREATE TABLE farms (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country     TEXT NOT NULL DEFAULT 'BR',
    timezone    TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE farm_members (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'worker', -- owner | manager | worker
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(farm_id, user_id)
);

-- =============================================
-- SUBSCRIPTIONS
-- =============================================
CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE UNIQUE,
    plan                  TEXT NOT NULL DEFAULT 'free', -- free | basic | pro | enterprise
    status                TEXT NOT NULL DEFAULT 'active', -- active | canceled | past_due | trialing
    animal_limit          INT NOT NULL DEFAULT 5,
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    trial_ends_at         TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- ZONES (pastures)
-- =============================================
CREATE TABLE perimeters (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    geometry   GEOGRAPHY(POLYGON, 4326) NOT NULL,
    area_ha    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE zone_groups (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE zones (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    group_id       UUID REFERENCES zone_groups(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    geometry       GEOGRAPHY(POLYGON, 4326) NOT NULL,
    area_ha        NUMERIC(10,2) NOT NULL DEFAULT 0,
    grass_type     TEXT,
    ugm_ha_limit   NUMERIC(6,2),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE key_points (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'water', -- water | barn | gate | vet | other
    location   GEOGRAPHY(POINT, 4326) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Zone usage history
CREATE TABLE zone_usages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id      UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    started_at   TIMESTAMPTZ NOT NULL,
    ended_at     TIMESTAMPTZ,
    animal_count INT NOT NULL DEFAULT 0,
    ugm_ha       NUMERIC(6,2),
    notes        TEXT
);

-- =============================================
-- HERDS (lotes)
-- =============================================
CREATE TABLE herds (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#22c55e',
    zone_id    UUID REFERENCES zones(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- ANIMALS
-- =============================================
CREATE TABLE animals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    herd_id         UUID REFERENCES herds(id) ON DELETE SET NULL,
    zone_id         UUID REFERENCES zones(id) ON DELETE SET NULL,
    ear_tag         TEXT NOT NULL,          -- crotal
    name            TEXT,
    species         TEXT NOT NULL DEFAULT 'bovine',
    sex             TEXT NOT NULL,          -- male | female
    breed           TEXT,
    birth_date      DATE,
    entry_reason    TEXT,                   -- birth | purchase | other
    status          TEXT NOT NULL DEFAULT 'active', -- active | sold | dead
    last_location   GEOGRAPHY(POINT, 4326),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(farm_id, ear_tag)
);

CREATE INDEX idx_animals_farm ON animals(farm_id);
CREATE INDEX idx_animals_herd ON animals(herd_id);
CREATE INDEX idx_animals_zone ON animals(zone_id);
CREATE INDEX idx_animals_last_location ON animals USING GIST(last_location);

-- =============================================
-- GPS TRACKING
-- =============================================
CREATE TABLE devices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL,
    device_uid   TEXT UNIQUE NOT NULL,
    api_key      TEXT UNIQUE NOT NULL,
    type         TEXT NOT NULL DEFAULT 'collar', -- collar | ear_tag
    battery_pct  INT,
    last_ping_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE antennas (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    location    GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_m    INT NOT NULL DEFAULT 3000,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gps_tracks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    animal_id   UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    location    GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh   NUMERIC(5,2),
    battery_pct INT,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition gps_tracks by month for performance
CREATE INDEX idx_gps_tracks_animal_time ON gps_tracks(animal_id, recorded_at DESC);
CREATE INDEX idx_gps_tracks_location ON gps_tracks USING GIST(location);

-- =============================================
-- REPRODUCTIVE EVENTS (cria)
-- =============================================
CREATE TABLE reproductive_events (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id    UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL, -- mating | pregnancy | birth | abortion | weaning | sale | death
    event_date   DATE NOT NULL,
    partner_id   UUID REFERENCES animals(id),  -- sire for mating
    offspring_id UUID REFERENCES animals(id),  -- calf born
    birth_weight NUMERIC(5,2),
    wean_weight  NUMERIC(5,2),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- WEIGHT RECORDS (engorde)
-- =============================================
CREATE TABLE weight_records (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    animal_id   UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    weight_kg   NUMERIC(7,2) NOT NULL,
    recorded_at DATE NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- HEALTH EVENTS (saude)
-- =============================================
CREATE TABLE health_events (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL, -- null = whole herd
    herd_id      UUID REFERENCES herds(id) ON DELETE SET NULL,
    event_type   TEXT NOT NULL, -- disease | vaccine | feed | sanitation | other
    name         TEXT NOT NULL,
    description  TEXT,
    cost_cents   INT NOT NULL DEFAULT 0,
    currency     TEXT NOT NULL DEFAULT 'BRL',
    dose_mg_kg   NUMERIC(8,2),
    quantity_kg  NUMERIC(10,2),
    animal_count INT NOT NULL DEFAULT 1,
    started_at   DATE NOT NULL,
    ended_at     DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- MARKETPLACE
-- =============================================
CREATE TABLE marketplace_products (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    description   TEXT,
    category      TEXT NOT NULL, -- collar | ear_tag | antenna | accessory
    price_cents   INT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'BRL',
    stock         INT NOT NULL DEFAULT 0,
    images        TEXT[] DEFAULT '{}',
    specs         JSONB DEFAULT '{}',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | paid | shipped | delivered | canceled
    total_cents   INT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'BRL',
    shipping_addr JSONB NOT NULL DEFAULT '{}',
    stripe_pi_id  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES marketplace_products(id),
    quantity    INT NOT NULL DEFAULT 1,
    price_cents INT NOT NULL
);

-- =============================================
-- ALERTS
-- =============================================
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id   UUID REFERENCES animals(id) ON DELETE CASCADE,
    type        TEXT NOT NULL, -- out_of_zone | low_activity | high_activity | imminent_birth | device_offline
    severity    TEXT NOT NULL DEFAULT 'info', -- info | warning | critical
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- PUSH SUBSCRIPTIONS (PWA)
-- =============================================
CREATE TABLE push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);
