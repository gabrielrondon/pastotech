package health

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

type HealthEvent struct {
	ID          uuid.UUID  `json:"id"`
	FarmID      uuid.UUID  `json:"farm_id"`
	AnimalID    *uuid.UUID `json:"animal_id,omitempty"`
	HerdID      *uuid.UUID `json:"herd_id,omitempty"`
	EventType   string     `json:"event_type"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	CostCents   int        `json:"cost_cents"`
	Currency    string     `json:"currency"`
	DoseMgKg    *float64   `json:"dose_mg_kg,omitempty"`
	QuantityKg  *float64   `json:"quantity_kg,omitempty"`
	AnimalCount int        `json:"animal_count"`
	StartedAt   string     `json:"started_at"`
	EndedAt     *string    `json:"ended_at,omitempty"`
	// Joined
	AnimalName *string `json:"animal_name,omitempty"`
	HerdName   *string `json:"herd_name,omitempty"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	q := r.URL.Query()

	where := "he.farm_id = $1"
	args := []any{farmID}
	argN := 2

	if et := q.Get("event_type"); et != "" {
		where += " AND he.event_type = $2"
		args = append(args, et)
		argN++
	}
	if aid := q.Get("animal_id"); aid != "" {
		where += " AND he.animal_id = $" + strconv.Itoa(argN)
		args = append(args, aid)
		argN++
	}
	_ = argN

	rows, err := h.pool.Query(r.Context(), `
		SELECT he.id, he.farm_id, he.animal_id, he.herd_id,
		       he.event_type, he.name, he.description,
		       he.cost_cents, he.currency, he.dose_mg_kg, he.quantity_kg,
		       he.animal_count,
		       to_char(he.started_at, 'YYYY-MM-DD'),
		       to_char(he.ended_at,   'YYYY-MM-DD'),
		       a.name  AS animal_name,
		       hr.name AS herd_name
		FROM health_events he
		LEFT JOIN animals a  ON a.id  = he.animal_id
		LEFT JOIN herds   hr ON hr.id = he.herd_id
		WHERE `+where+`
		ORDER BY he.started_at DESC`, args...)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	events := []HealthEvent{}
	for rows.Next() {
		var e HealthEvent
		if err := rows.Scan(
			&e.ID, &e.FarmID, &e.AnimalID, &e.HerdID,
			&e.EventType, &e.Name, &e.Description,
			&e.CostCents, &e.Currency, &e.DoseMgKg, &e.QuantityKg,
			&e.AnimalCount, &e.StartedAt, &e.EndedAt,
			&e.AnimalName, &e.HerdName,
		); err != nil {
			response.InternalError(w)
			return
		}
		events = append(events, e)
	}
	response.Ok(w, events)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid id")
		return
	}
	var e HealthEvent
	err = h.pool.QueryRow(r.Context(), `
		SELECT he.id, he.farm_id, he.animal_id, he.herd_id,
		       he.event_type, he.name, he.description,
		       he.cost_cents, he.currency, he.dose_mg_kg, he.quantity_kg,
		       he.animal_count,
		       to_char(he.started_at,'YYYY-MM-DD'),
		       to_char(he.ended_at,  'YYYY-MM-DD'),
		       a.name, hr.name
		FROM health_events he
		LEFT JOIN animals a  ON a.id  = he.animal_id
		LEFT JOIN herds   hr ON hr.id = he.herd_id
		WHERE he.id=$1 AND he.farm_id=$2`, id, farmID,
	).Scan(&e.ID, &e.FarmID, &e.AnimalID, &e.HerdID,
		&e.EventType, &e.Name, &e.Description,
		&e.CostCents, &e.Currency, &e.DoseMgKg, &e.QuantityKg,
		&e.AnimalCount, &e.StartedAt, &e.EndedAt,
		&e.AnimalName, &e.HerdName)
	if err != nil {
		response.NotFound(w, "event not found")
		return
	}
	response.Ok(w, e)
}

type CreateRequest struct {
	AnimalID    *string  `json:"animal_id"`
	HerdID      *string  `json:"herd_id"`
	EventType   string   `json:"event_type"`
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	CostCents   int      `json:"cost_cents"`
	Currency    string   `json:"currency"`
	DoseMgKg    *float64 `json:"dose_mg_kg"`
	QuantityKg  *float64 `json:"quantity_kg"`
	AnimalCount int      `json:"animal_count"`
	StartedAt   string   `json:"started_at"`
	EndedAt     *string  `json:"ended_at"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || req.EventType == "" {
		response.BadRequest(w, "name, event_type and started_at required")
		return
	}
	if req.Currency == "" {
		req.Currency = "BRL"
	}
	if req.AnimalCount < 1 {
		req.AnimalCount = 1
	}
	var animalID, herdID *uuid.UUID
	if req.AnimalID != nil {
		id, _ := uuid.Parse(*req.AnimalID)
		animalID = &id
	}
	if req.HerdID != nil {
		id, _ := uuid.Parse(*req.HerdID)
		herdID = &id
	}

	var e HealthEvent
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO health_events
		  (id, farm_id, animal_id, herd_id, event_type, name, description,
		   cost_cents, currency, dose_mg_kg, quantity_kg, animal_count,
		   started_at, ended_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date)
		RETURNING id, farm_id, animal_id, herd_id, event_type, name, description,
		          cost_cents, currency, dose_mg_kg, quantity_kg, animal_count,
		          to_char(started_at,'YYYY-MM-DD'), to_char(ended_at,'YYYY-MM-DD')`,
		uuid.New(), farmID, animalID, herdID, req.EventType, req.Name, req.Description,
		req.CostCents, req.Currency, req.DoseMgKg, req.QuantityKg, req.AnimalCount,
		req.StartedAt, req.EndedAt,
	).Scan(&e.ID, &e.FarmID, &e.AnimalID, &e.HerdID, &e.EventType, &e.Name, &e.Description,
		&e.CostCents, &e.Currency, &e.DoseMgKg, &e.QuantityKg, &e.AnimalCount,
		&e.StartedAt, &e.EndedAt)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, e)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid id")
		return
	}
	_, _ = h.pool.Exec(r.Context(),
		`DELETE FROM health_events WHERE id=$1 AND farm_id=$2`, id, farmID)
	response.NoContent(w)
}

// silence unused
var _ = time.Now
