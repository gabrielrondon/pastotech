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
	)

	type step struct {
		name string
		sql  string
	}

	steps := []step{
		{"user", fmt.Sprintf(
			`INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
			 VALUES ('%s', 'Demo User', 'demo@cowpro.io', '%s', NOW(), NOW())
			 ON CONFLICT (email) DO NOTHING`,
			userID, string(hash),
		)},
		{"farm", fmt.Sprintf(
			`INSERT INTO farms (id, name, owner_id, created_at, updated_at)
			 VALUES ('%s', 'Fazenda Demo', '%s', NOW(), NOW())
			 ON CONFLICT (id) DO NOTHING`,
			farmID, userID,
		)},
		{"farm_member", fmt.Sprintf(
			`INSERT INTO farm_members (farm_id, user_id, role, created_at)
			 VALUES ('%s', '%s', 'owner', NOW())
			 ON CONFLICT (farm_id, user_id) DO NOTHING`,
			farmID, userID,
		)},
		{"subscription", fmt.Sprintf(
			`INSERT INTO subscriptions (id, farm_id, plan, status, animal_limit, created_at, updated_at)
			 VALUES (gen_random_uuid(), '%s', 'pro', 'active', 500, NOW(), NOW())
			 ON CONFLICT (farm_id) DO UPDATE SET plan = 'pro', animal_limit = 500`,
			farmID,
		)},
		{"herds", fmt.Sprintf(
			`INSERT INTO herds (id, farm_id, name, color, created_at, updated_at) VALUES
			 ('%s', '%s', 'Nelore Engorda', '#f59e0b', NOW(), NOW()),
			 ('%s', '%s', 'Angus Engorda', '#3b82f6', NOW(), NOW()),
			 ('%s', '%s', 'Matrizes Nelore', '#ec4899', NOW(), NOW()),
			 ('%s', '%s', 'Bezerros', '#10b981', NOW(), NOW())
			 ON CONFLICT (id) DO NOTHING`,
			herd1ID, farmID, herd2ID, farmID, herd3ID, farmID, herd4ID, farmID,
		)},
	}

	for _, s := range steps {
		if _, err := tx.Exec(ctx, s.sql); err != nil {
			response.Error(w, http.StatusInternalServerError, fmt.Sprintf("%s error: %v", s.name, err))
			return
		}
	}

	// Animals: use ear_tag column (not tag)
	animalSQL := fmt.Sprintf(`
		INSERT INTO animals (id, farm_id, herd_id, ear_tag, species, breed, sex, birth_date, entry_reason, status, created_at, updated_at)
		SELECT
			gen_random_uuid(),
			'%s',
			herd_id,
			'BR-' || LPAD(seq::text, 5, '0'),
			'bovine',
			breed,
			sex,
			(NOW() - (INTERVAL '1 day' * (365 + (random()*730)::int)))::date,
			'birth',
			'active',
			NOW(), NOW()
		FROM (
			SELECT '%s'::uuid AS herd_id, 'Nelore' AS breed, 'M' AS sex, generate_series(1,15) AS seq
			UNION ALL
			SELECT '%s'::uuid, 'Angus', 'M', generate_series(16,28)
			UNION ALL
			SELECT '%s'::uuid, 'Nelore', 'F', generate_series(29,40)
			UNION ALL
			SELECT '%s'::uuid, 'Nelore', 'M', generate_series(41,48)
		) t
		ON CONFLICT DO NOTHING`,
		farmID, herd1ID, herd2ID, herd3ID, herd4ID)

	if _, err := tx.Exec(ctx, animalSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("animals error: %v", err))
		return
	}

	// Weight records (recorded_at is DATE)
	weightSQL := fmt.Sprintf(`
		INSERT INTO weight_records (id, animal_id, farm_id, weight_kg, recorded_at, created_at)
		SELECT
			gen_random_uuid(),
			a.id,
			'%s',
			200 + (random() * 250)::int + gs * 8,
			(NOW() - (INTERVAL '30 days' * (6 - gs)))::date,
			NOW()
		FROM animals a, generate_series(1,6) gs
		WHERE a.farm_id = '%s'
		ON CONFLICT DO NOTHING`,
		farmID, farmID)

	if _, err := tx.Exec(ctx, weightSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("weights error: %v", err))
		return
	}

	// Health events (event_type + name, no type/description)
	healthSQL := fmt.Sprintf(`
		INSERT INTO health_events (id, farm_id, herd_id, event_type, name, animal_count, created_at, updated_at)
		VALUES
			(gen_random_uuid(), '%s', '%s', 'vaccine', 'Vacinação Aftosa 2025', 15, NOW() - INTERVAL '45 days', NOW()),
			(gen_random_uuid(), '%s', '%s', 'vaccine', 'Brucelose - Matrizes', 12, NOW() - INTERVAL '30 days', NOW()),
			(gen_random_uuid(), '%s', '%s', 'sanitation', 'Vermifugação Lote Engorda', 28, NOW() - INTERVAL '20 days', NOW()),
			(gen_random_uuid(), '%s', '%s', 'feed', 'Suplemento mineral', 48, NOW() - INTERVAL '10 days', NOW())
		ON CONFLICT DO NOTHING`,
		farmID, herd1ID,
		farmID, herd3ID,
		farmID, herd2ID,
		farmID, herd4ID,
	)

	if _, err := tx.Exec(ctx, healthSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("health error: %v", err))
		return
	}

	// Alerts
	alertSQL := fmt.Sprintf(`
		INSERT INTO alerts (id, farm_id, type, severity, message, is_read, created_at)
		VALUES
			(gen_random_uuid(), '%s', 'out_of_zone', 'warning', 'Animal BR-00003 saiu da área monitorada', false, NOW() - INTERVAL '2 hours'),
			(gen_random_uuid(), '%s', 'device_offline', 'critical', 'Dispositivo GPS-011 offline há mais de 4h', false, NOW() - INTERVAL '5 hours'),
			(gen_random_uuid(), '%s', 'low_activity', 'info', '3 animais com baixa atividade detectada', false, NOW() - INTERVAL '1 day'),
			(gen_random_uuid(), '%s', 'out_of_zone', 'warning', 'Animal BR-00017 saiu da área monitorada', true, NOW() - INTERVAL '2 days'),
			(gen_random_uuid(), '%s', 'low_activity', 'info', 'Animal BR-00031 com atividade incomum', true, NOW() - INTERVAL '3 days')
		ON CONFLICT DO NOTHING`,
		farmID, farmID, farmID, farmID, farmID)

	if _, err := tx.Exec(ctx, alertSQL); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("alerts error: %v", err))
		return
	}

	if err := tx.Commit(ctx); err != nil {
		response.InternalError(w)
		return
	}

	response.Ok(w, map[string]any{
		"status":  "seeded",
		"message": "Demo data inserted successfully",
	})
}
