package farm

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

// =============================================
// FARM CRUD
// =============================================

type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

type Farm struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	OwnerID  uuid.UUID `json:"owner_id"`
	Country  string    `json:"country"`
	Timezone string    `json:"timezone"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT f.id, f.name, f.owner_id, f.country, f.timezone
		FROM farms f
		JOIN farm_members fm ON fm.farm_id = f.id
		WHERE fm.user_id = $1
		ORDER BY f.name`, userID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	farms := []Farm{}
	for rows.Next() {
		var f Farm
		if err := rows.Scan(&f.ID, &f.Name, &f.OwnerID, &f.Country, &f.Timezone); err != nil {
			response.InternalError(w)
			return
		}
		farms = append(farms, f)
	}
	response.Ok(w, farms)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var f Farm
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, name, owner_id, country, timezone FROM farms WHERE id=$1`, farmID,
	).Scan(&f.ID, &f.Name, &f.OwnerID, &f.Country, &f.Timezone)
	if err != nil {
		response.NotFound(w, "farm not found")
		return
	}
	response.Ok(w, f)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	var req struct {
		Name     string `json:"name"`
		Country  string `json:"country"`
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name required")
		return
	}
	if req.Country == "" { req.Country = "BR" }
	if req.Timezone == "" { req.Timezone = "America/Sao_Paulo" }

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		response.InternalError(w)
		return
	}
	defer tx.Rollback(r.Context())

	farmID := uuid.New()
	var f Farm
	err = tx.QueryRow(r.Context(), `
		INSERT INTO farms (id, name, owner_id, country, timezone)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, name, owner_id, country, timezone`,
		farmID, req.Name, userID, req.Country, req.Timezone,
	).Scan(&f.ID, &f.Name, &f.OwnerID, &f.Country, &f.Timezone)
	if err != nil {
		response.InternalError(w)
		return
	}

	// Add owner as farm member
	_, err = tx.Exec(r.Context(),
		`INSERT INTO farm_members (id, farm_id, user_id, role) VALUES ($1,$2,$3,'owner')`,
		uuid.New(), farmID, userID)
	if err != nil {
		response.InternalError(w)
		return
	}

	// Create free subscription
	_, err = tx.Exec(r.Context(),
		`INSERT INTO subscriptions (id, farm_id, plan, animal_limit) VALUES ($1,$2,'free',5)`,
		uuid.New(), farmID)
	if err != nil {
		response.InternalError(w)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, f)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		Name     string `json:"name"`
		Country  string `json:"country"`
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name required")
		return
	}
	var f Farm
	err := h.pool.QueryRow(r.Context(), `
		UPDATE farms SET name=$1, country=$2, timezone=$3, updated_at=NOW()
		WHERE id=$4
		RETURNING id, name, owner_id, country, timezone`,
		req.Name, req.Country, req.Timezone, farmID,
	).Scan(&f.ID, &f.Name, &f.OwnerID, &f.Country, &f.Timezone)
	if err != nil {
		response.NotFound(w, "farm not found")
		return
	}
	response.Ok(w, f)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	idParam := chi.URLParam(r, "id")
	id, err := uuid.Parse(idParam)
	if err != nil || id != farmID {
		response.Forbidden(w)
		return
	}
	_, _ = h.pool.Exec(r.Context(), `DELETE FROM farms WHERE id=$1`, farmID)
	response.NoContent(w)
}

// =============================================
// STATS
// =============================================

type StatsHandler struct{ pool *pgxpool.Pool }

func NewStatsHandler(pool *pgxpool.Pool) *StatsHandler { return &StatsHandler{pool: pool} }

type OverviewStats struct {
	TotalAnimals   int `json:"total_animals"`
	ActiveAnimals  int `json:"active_animals"`
	TotalZones     int `json:"total_zones"`
	OccupiedZones  int `json:"occupied_zones"`
	AlertsToday    int `json:"alerts_today"`
	DevicesOnline  int `json:"devices_online"`
	DevicesOffline int `json:"devices_offline"`
}

func (h *StatsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var s OverviewStats

	_ = h.pool.QueryRow(r.Context(), `
		SELECT
		  (SELECT COUNT(*) FROM animals WHERE farm_id=$1)::int,
		  (SELECT COUNT(*) FROM animals WHERE farm_id=$1 AND status='active')::int,
		  (SELECT COUNT(*) FROM zones   WHERE farm_id=$1)::int,
		  (SELECT COUNT(DISTINCT zone_id) FROM animals WHERE farm_id=$1 AND status='active' AND zone_id IS NOT NULL)::int,
		  (SELECT COUNT(*) FROM alerts  WHERE farm_id=$1 AND created_at >= CURRENT_DATE)::int,
		  (SELECT COUNT(*) FROM devices WHERE farm_id=$1 AND is_active=true  AND last_ping_at >= NOW() - INTERVAL '1 hour')::int,
		  (SELECT COUNT(*) FROM devices WHERE farm_id=$1 AND is_active=true  AND (last_ping_at IS NULL OR last_ping_at < NOW() - INTERVAL '1 hour'))::int`,
		farmID,
	).Scan(&s.TotalAnimals, &s.ActiveAnimals, &s.TotalZones, &s.OccupiedZones,
		&s.AlertsToday, &s.DevicesOnline, &s.DevicesOffline)

	response.Ok(w, s)
}

type BreedingStats struct {
	Nodrizas        int     `json:"nodrizas"`
	Terneros        int     `json:"terneros"`
	ReproductionPct float64 `json:"reproduction_pct"`
	Pregnancies     int     `json:"pregnancies"`
	EmptyCows       int     `json:"empty_cows"`
	Births          int     `json:"births"`
	Abortions       int     `json:"abortions"`
	Sales           int     `json:"sales"`
	Deaths          int     `json:"deaths"`
	Campaign        string  `json:"campaign"`
}

func (h *StatsHandler) Breeding(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	// Campaign year from query or default current year
	year := r.URL.Query().Get("year")
	if year == "" {
		year = "EXTRACT(year FROM NOW())::int::text"
	}

	var s BreedingStats
	_ = h.pool.QueryRow(r.Context(), `
		WITH campaign AS (
			SELECT $2::int AS yr
		),
		events AS (
			SELECT event_type, COUNT(*) AS cnt
			FROM reproductive_events re
			JOIN campaign c ON EXTRACT(year FROM re.event_date) = c.yr
			WHERE re.farm_id = $1
			GROUP BY event_type
		)
		SELECT
		  (SELECT COUNT(*) FROM animals WHERE farm_id=$1 AND sex='female' AND status='active')::int AS nodrizas,
		  COALESCE((SELECT cnt FROM events WHERE event_type='birth'),0)::int,
		  COALESCE((SELECT cnt FROM events WHERE event_type='pregnancy'),0)::int,
		  COALESCE((SELECT cnt FROM events WHERE event_type='birth'),0)::int,
		  COALESCE((SELECT cnt FROM events WHERE event_type='abortion'),0)::int,
		  COALESCE((SELECT cnt FROM events WHERE event_type='sale'),0)::int,
		  COALESCE((SELECT cnt FROM events WHERE event_type='death'),0)::int`,
		farmID, year,
	).Scan(&s.Nodrizas, &s.Terneros, &s.Pregnancies,
		&s.Births, &s.Abortions, &s.Sales, &s.Deaths)

	if s.Nodrizas > 0 {
		s.ReproductionPct = float64(s.Births) / float64(s.Nodrizas) * 100
	}
	// Empty cows = nodrizas - pregnancies - births
	s.EmptyCows = s.Nodrizas - s.Pregnancies - s.Births
	if s.EmptyCows < 0 {
		s.EmptyCows = 0
	}

	response.Ok(w, s)
}

type FatteningEntry struct {
	HerdName    string  `json:"herd_name"`
	HerdColor   string  `json:"herd_color"`
	AnimalCount int     `json:"animal_count"`
	AvgGMD      float64 `json:"avg_gmd"`
	AvgWeight   float64 `json:"avg_weight"`
}

func (h *StatsHandler) Fattening(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	rows, err := h.pool.Query(r.Context(), `
		WITH latest_weights AS (
			SELECT DISTINCT ON (animal_id)
				animal_id, weight_kg, recorded_at
			FROM weight_records
			WHERE farm_id = $1
			ORDER BY animal_id, recorded_at DESC
		),
		prev_weights AS (
			SELECT DISTINCT ON (animal_id)
				animal_id, weight_kg, recorded_at
			FROM weight_records
			WHERE farm_id = $1
			ORDER BY animal_id, recorded_at ASC
		)
		SELECT h.name, h.color,
		       COUNT(a.id)::int,
		       COALESCE(AVG((lw.weight_kg - pw.weight_kg) /
		           NULLIF((lw.recorded_at - pw.recorded_at), 0)), 0) AS avg_gmd,
		       COALESCE(AVG(lw.weight_kg), 0) AS avg_weight
		FROM herds h
		JOIN animals a ON a.herd_id = h.id AND a.status='active'
		LEFT JOIN latest_weights lw ON lw.animal_id = a.id
		LEFT JOIN prev_weights pw   ON pw.animal_id = a.id
		WHERE h.farm_id = $1
		GROUP BY h.id
		ORDER BY h.name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	entries := []FatteningEntry{}
	for rows.Next() {
		var e FatteningEntry
		if err := rows.Scan(&e.HerdName, &e.HerdColor, &e.AnimalCount, &e.AvgGMD, &e.AvgWeight); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	response.Ok(w, entries)
}

type ProfitabilityStats struct {
	TotalHealthCost int64   `json:"total_health_cost_cents"`
	TotalSales      int     `json:"total_sales"`
	Currency        string  `json:"currency"`
	CostPerAnimal   float64 `json:"cost_per_animal"`
}

type Alert struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Severity  string    `json:"severity"`
	Message   string    `json:"message"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *StatsHandler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, type, severity, message, is_read, created_at
		FROM alerts WHERE farm_id=$1
		ORDER BY created_at DESC LIMIT 50`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	alerts := []Alert{}
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.Type, &a.Severity, &a.Message, &a.IsRead, &a.CreatedAt); err != nil {
			continue
		}
		alerts = append(alerts, a)
	}
	response.Ok(w, alerts)
}

func (h *StatsHandler) MarkAlertRead(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")
	_, err := h.pool.Exec(r.Context(),
		`UPDATE alerts SET is_read=true WHERE id=$1 AND farm_id=$2`, id, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Ok(w, map[string]bool{"ok": true})
}

func (h *StatsHandler) Profitability(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var s ProfitabilityStats
	s.Currency = "BRL"

	_ = h.pool.QueryRow(r.Context(), `
		SELECT
		  COALESCE(SUM(cost_cents),0)::bigint,
		  (SELECT COUNT(*) FROM reproductive_events
		   WHERE farm_id=$1 AND event_type='sale'
		     AND event_date >= DATE_TRUNC('year', NOW()))::int
		FROM health_events
		WHERE farm_id=$1
		  AND started_at >= DATE_TRUNC('year', NOW())`, farmID,
	).Scan(&s.TotalHealthCost, &s.TotalSales)

	var animalCount int
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM animals WHERE farm_id=$1 AND status='active'`, farmID,
	).Scan(&animalCount)
	if animalCount > 0 {
		s.CostPerAnimal = float64(s.TotalHealthCost) / float64(animalCount) / 100
	}

	response.Ok(w, s)
}
