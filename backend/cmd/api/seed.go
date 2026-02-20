package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/gabrielrondon/cowpro/pkg/response"
)

type SeedHandler struct {
	pool *pgxpool.Pool
}

func NewSeedHandler(pool *pgxpool.Pool) *SeedHandler {
	return &SeedHandler{pool: pool}
}

func (h *SeedHandler) Seed(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("SEED_SECRET")
	if secret == "" || r.Header.Get("X-Seed-Secret") != secret {
		response.Error(w, http.StatusForbidden, "forbidden")
		return
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer tx.Rollback(ctx)

	hash, err := bcrypt.GenerateFromPassword([]byte("demo1234"), bcrypt.DefaultCost)
	if err != nil {
		response.InternalError(w)
		return
	}

	// Fixed UUIDs for idempotency
	const (
		userID  = "11111111-0000-0000-0000-000000000001"
		farmID  = "22222222-0000-0000-0000-000000000001"
		herd1ID = "33333333-0000-0000-0000-000000000001"
		herd2ID = "33333333-0000-0000-0000-000000000002"
		herd3ID = "33333333-0000-0000-0000-000000000003"
		herd4ID = "33333333-0000-0000-0000-000000000004"
		zone1ID = "44444444-0000-0000-0000-000000000001"
		zone2ID = "44444444-0000-0000-0000-000000000002"
		zone3ID = "44444444-0000-0000-0000-000000000003"
		zone4ID = "44444444-0000-0000-0000-000000000004"
	)

	steps := []string{
		// User
		fmt.Sprintf(`INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
			VALUES ('%s', 'Demo User', 'demo@cowpro.io', '%s', NOW(), NOW())
			ON CONFLICT (email) DO NOTHING`, userID, string(hash)),

		// Farm
		fmt.Sprintf(`INSERT INTO farms (id, name, owner_id, location, area_ha, created_at, updated_at)
			VALUES ('%s', 'Fazenda Demo', '%s', 'Mato Grosso do Sul, Brasil', 1500.0, NOW(), NOW())
			ON CONFLICT (id) DO NOTHING`, farmID, userID),

		// Farm member
		fmt.Sprintf(`INSERT INTO farm_members (farm_id, user_id, role, created_at)
			VALUES ('%s', '%s', 'owner', NOW())
			ON CONFLICT (farm_id, user_id) DO NOTHING`, farmID, userID),

		// Subscription
		fmt.Sprintf(`INSERT INTO subscriptions (id, farm_id, plan, status, animal_limit, created_at, updated_at)
			VALUES (gen_random_uuid(), '%s', 'pro', 'active', 500, NOW(), NOW())
			ON CONFLICT DO NOTHING`, farmID),

		// Herds
		fmt.Sprintf(`INSERT INTO herds (id, farm_id, name, breed, purpose, created_at, updated_at) VALUES
			('%s', '%s', 'Nelore Engorda', 'Nelore', 'beef', NOW(), NOW()),
			('%s', '%s', 'Angus Engorda', 'Angus', 'beef', NOW(), NOW()),
			('%s', '%s', 'Matrizes Nelore', 'Nelore', 'breeding', NOW(), NOW()),
			('%s', '%s', 'Bezerros', 'Nelore', 'beef', NOW(), NOW())
			ON CONFLICT (id) DO NOTHING`,
			herd1ID, farmID, herd2ID, farmID, herd3ID, farmID, herd4ID, farmID),

		// Zones
		fmt.Sprintf(`INSERT INTO zones (id, farm_id, name, type, area_ha, created_at, updated_at) VALUES
			('%s', '%s', 'Pasto Norte', 'pasture', 320.0, NOW(), NOW()),
			('%s', '%s', 'Pasto Sul', 'pasture', 280.0, NOW(), NOW()),
			('%s', '%s', 'Pasto Leste', 'pasture', 250.0, NOW(), NOW()),
			('%s', '%s', 'Pasto Oeste', 'pasture', 200.0, NOW(), NOW())
			ON CONFLICT (id) DO NOTHING`,
			zone1ID, farmID, zone2ID, farmID, zone3ID, farmID, zone4ID, farmID),
	}

	for _, sql := range steps {
		if _, err := tx.Exec(ctx, sql); err != nil {
			response.Error(w, http.StatusInternalServerError, fmt.Sprintf("seed error: %v", err))
			return
		}
	}

	// Insert 40 animals across herds
	animalSQL := fmt.Sprintf(`
		INSERT INTO animals (id, farm_id, herd_id, tag, name, breed, sex, birth_date, weight_kg, status, created_at, updated_at)
		SELECT
			gen_random_uuid(),
			'%s',
			herd_id,
			'BR-' || LPAD(seq::text, 5, '0'),
			NULL,
			breed,
			sex,
			NOW() - (INTERVAL '1 day' * (365 + (random()*730)::int)),
			300 + (random() * 250)::int,
			'active',
			NOW(), NOW()
		FROM (
			SELECT '%s' AS herd_id, 'Nelore' AS breed, 'M' AS sex, generate_series(1,15) AS seq
			UNION ALL
			SELECT '%s', 'Angus', 'M', generate_series(16,28)
			UNION ALL
			SELECT '%s', 'Nelore', 'F', generate_series(29,40)
			UNION ALL
			SELECT '%s', 'Nelore', 'M', generate_series(41,48)
		) t
		ON CONFLICT DO NOTHING`,
		farmID, herd1ID, herd2ID, herd3ID, herd4ID)

	if _, err := tx.Exec(ctx, animalSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("animals error: %v", err))
		return
	}

	// Weight records for existing animals
	weightSQL := fmt.Sprintf(`
		INSERT INTO weight_records (id, animal_id, weight_kg, recorded_at, created_at)
		SELECT gen_random_uuid(), a.id,
			a.weight_kg - (random()*80)::int + (generate_series * 10),
			NOW() - (INTERVAL '30 days' * (6 - generate_series)),
			NOW()
		FROM animals a, generate_series(1,6)
		WHERE a.farm_id = '%s'
		ON CONFLICT DO NOTHING`, farmID)

	if _, err := tx.Exec(ctx, weightSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("weight error: %v", err))
		return
	}

	// Alerts
	alertSQL := fmt.Sprintf(`
		INSERT INTO alerts (id, farm_id, type, severity, message, is_read, created_at)
		VALUES
			(gen_random_uuid(), '%s', 'out_of_zone', 'warning', 'Animal BR-00003 saiu da Zona Pasto Norte', false, NOW() - INTERVAL '2 hours'),
			(gen_random_uuid(), '%s', 'device_offline', 'critical', 'Dispositivo GPS-011 offline há mais de 4h', false, NOW() - INTERVAL '5 hours'),
			(gen_random_uuid(), '%s', 'low_activity', 'info', '3 animais com baixa atividade detectada', false, NOW() - INTERVAL '1 day'),
			(gen_random_uuid(), '%s', 'out_of_zone', 'warning', 'Animal BR-00017 saiu da Zona Pasto Sul', true, NOW() - INTERVAL '2 days'),
			(gen_random_uuid(), '%s', 'low_activity', 'info', 'Animal BR-00031 com atividade incomum', true, NOW() - INTERVAL '3 days')
		ON CONFLICT DO NOTHING`,
		farmID, farmID, farmID, farmID, farmID)

	if _, err := tx.Exec(ctx, alertSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("alerts error: %v", err))
		return
	}

	// Health events
	healthSQL := fmt.Sprintf(`
		INSERT INTO health_events (id, farm_id, type, description, event_date, created_at)
		SELECT gen_random_uuid(), '%s', 'vaccination', 'Vacinação Aftosa - Lote ' || (row_number() OVER ()),
			NOW() - (INTERVAL '1 day' * (random()*60)::int), NOW()
		FROM generate_series(1, 5)
		ON CONFLICT DO NOTHING`, farmID)

	if _, err := tx.Exec(ctx, healthSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("health error: %v", err))
		return
	}

	if err := tx.Commit(ctx); err != nil {
		response.InternalError(w)
		return
	}

	response.Ok(w, map[string]string{"status": "seeded", "message": "Demo data inserted successfully"})
}
