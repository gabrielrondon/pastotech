package iot

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

// ─── Types ────────────────────────────────────────────────────────────────────

type Device struct {
	ID         uuid.UUID  `json:"id"`
	FarmID     uuid.UUID  `json:"farm_id"`
	AnimalID   *uuid.UUID `json:"animal_id"`
	AnimalTag  *string    `json:"animal_tag"`
	DeviceUID  string     `json:"device_uid"`
	Type       string     `json:"type"`
	BatteryPct *int       `json:"battery_pct"`
	LastPingAt *time.Time `json:"last_ping_at"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
}

type Antenna struct {
	ID        uuid.UUID `json:"id"`
	FarmID    uuid.UUID `json:"farm_id"`
	Name      string    `json:"name"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	RadiusM   int       `json:"radius_m"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type DeviceHandler struct {
	pool *pgxpool.Pool
	hub  *Hub
}

func NewDeviceHandler(pool *pgxpool.Pool, hub *Hub) *DeviceHandler {
	return &DeviceHandler{pool: pool, hub: hub}
}

// ─── Devices ──────────────────────────────────────────────────────────────────

func (h *DeviceHandler) List(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	rows, err := h.pool.Query(r.Context(), `
		SELECT d.id, d.farm_id, d.animal_id, a.ear_tag,
		       d.device_uid, d.type, d.battery_pct, d.last_ping_at,
		       d.is_active, d.created_at
		FROM devices d
		LEFT JOIN animals a ON a.id = d.animal_id
		WHERE d.farm_id = $1
		ORDER BY d.created_at DESC`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	devices := []Device{}
	for rows.Next() {
		var d Device
		if err := rows.Scan(
			&d.ID, &d.FarmID, &d.AnimalID, &d.AnimalTag,
			&d.DeviceUID, &d.Type, &d.BatteryPct, &d.LastPingAt,
			&d.IsActive, &d.CreatedAt,
		); err != nil {
			response.InternalError(w)
			return
		}
		devices = append(devices, d)
	}
	response.Ok(w, devices)
}

func (h *DeviceHandler) Create(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	var body struct {
		DeviceUID string `json:"device_uid"`
		Type      string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	if body.DeviceUID == "" {
		response.BadRequest(w, "device_uid required")
		return
	}
	if body.Type == "" {
		body.Type = "collar"
	}

	// Generate a random API key
	apiKey := uuid.New().String()

	var d Device
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO devices (farm_id, device_uid, api_key, type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, farm_id, animal_id, device_uid, type, battery_pct, last_ping_at, is_active, created_at`,
		farmID, body.DeviceUID, apiKey, body.Type,
	).Scan(&d.ID, &d.FarmID, &d.AnimalID, &d.DeviceUID, &d.Type,
		&d.BatteryPct, &d.LastPingAt, &d.IsActive, &d.CreatedAt)
	if err != nil {
		response.InternalError(w)
		return
	}

	// Return with the API key (only shown once)
	type createResp struct {
		Device
		APIKey string `json:"api_key"`
	}
	response.Created(w, createResp{Device: d, APIKey: apiKey})
}

func (h *DeviceHandler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	var d Device
	err := h.pool.QueryRow(r.Context(), `
		SELECT d.id, d.farm_id, d.animal_id, a.ear_tag,
		       d.device_uid, d.type, d.battery_pct, d.last_ping_at,
		       d.is_active, d.created_at
		FROM devices d
		LEFT JOIN animals a ON a.id = d.animal_id
		WHERE d.id = $1 AND d.farm_id = $2`, id, farmID,
	).Scan(&d.ID, &d.FarmID, &d.AnimalID, &d.AnimalTag,
		&d.DeviceUID, &d.Type, &d.BatteryPct, &d.LastPingAt,
		&d.IsActive, &d.CreatedAt)
	if err != nil {
		response.NotFound(w, "not found")
		return
	}
	response.Ok(w, d)
}

func (h *DeviceHandler) Update(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	var body struct {
		IsActive *bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}

	_, err := h.pool.Exec(r.Context(), `
		UPDATE devices SET is_active = COALESCE($1, is_active)
		WHERE id = $2 AND farm_id = $3`,
		body.IsActive, id, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.NoContent(w)
}

func (h *DeviceHandler) AssignToAnimal(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	var body struct {
		AnimalID *string `json:"animal_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}

	// Unassign any device currently on this animal (if assigning)
	if body.AnimalID != nil {
		_, _ = h.pool.Exec(r.Context(),
			`UPDATE devices SET animal_id = NULL WHERE animal_id = $1 AND farm_id = $2`,
			body.AnimalID, farmID)
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE devices SET animal_id = $1 WHERE id = $2 AND farm_id = $3`,
		body.AnimalID, id, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.NoContent(w)
}

func (h *DeviceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	_, err := h.pool.Exec(r.Context(),
		`DELETE FROM devices WHERE id = $1 AND farm_id = $2`, id, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.NoContent(w)
}

// ─── Antennas ─────────────────────────────────────────────────────────────────

func (h *DeviceHandler) ListAntennas(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	rows, err := h.pool.Query(r.Context(), `
		SELECT id, farm_id, name,
		       ST_Y(location::geometry) AS lat,
		       ST_X(location::geometry) AS lng,
		       radius_m, is_active, created_at
		FROM antennas
		WHERE farm_id = $1
		ORDER BY name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	antennas := []Antenna{}
	for rows.Next() {
		var a Antenna
		if err := rows.Scan(&a.ID, &a.FarmID, &a.Name, &a.Lat, &a.Lng,
			&a.RadiusM, &a.IsActive, &a.CreatedAt); err != nil {
			response.InternalError(w)
			return
		}
		antennas = append(antennas, a)
	}
	response.Ok(w, antennas)
}

func (h *DeviceHandler) CreateAntenna(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	var body struct {
		Name     string  `json:"name"`
		Lat      float64 `json:"lat"`
		Lng      float64 `json:"lng"`
		RadiusM  int     `json:"radius_m"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	if body.Name == "" {
		response.BadRequest(w, "name required")
		return
	}
	if body.RadiusM == 0 {
		body.RadiusM = 3000
	}

	var a Antenna
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO antennas (farm_id, name, location, radius_m)
		VALUES ($1, $2, ST_GeogFromText('POINT(' || $3 || ' ' || $4 || ')'), $5)
		RETURNING id, farm_id, name,
		          ST_Y(location::geometry),
		          ST_X(location::geometry),
		          radius_m, is_active, created_at`,
		farmID, body.Name, body.Lng, body.Lat, body.RadiusM,
	).Scan(&a.ID, &a.FarmID, &a.Name, &a.Lat, &a.Lng, &a.RadiusM, &a.IsActive, &a.CreatedAt)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, a)
}
