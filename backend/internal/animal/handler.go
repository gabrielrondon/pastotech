package animal

import (
	"encoding/json"
	"fmt"
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

// =============================================
// ANIMALS
// =============================================

type Animal struct {
	ID          uuid.UUID  `json:"id"`
	FarmID      uuid.UUID  `json:"farm_id"`
	HerdID      *uuid.UUID `json:"herd_id,omitempty"`
	ZoneID      *uuid.UUID `json:"zone_id,omitempty"`
	EarTag      string     `json:"ear_tag"`
	Name        *string    `json:"name,omitempty"`
	Sex         string     `json:"sex"`
	Breed       *string    `json:"breed,omitempty"`
	BirthDate   *string    `json:"birth_date,omitempty"`
	EntryReason *string    `json:"entry_reason,omitempty"`
	Status      string     `json:"status"`
	LastLat     *float64   `json:"last_lat,omitempty"`
	LastLng     *float64   `json:"last_lng,omitempty"`
	LastSeenAt  *time.Time `json:"last_seen_at,omitempty"`
	HerdName    *string    `json:"herd_name,omitempty"`
	HerdColor   *string    `json:"herd_color,omitempty"`
	ZoneName    *string    `json:"zone_name,omitempty"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	q := r.URL.Query()

	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	args := []any{farmID}
	where := "a.farm_id = $1"
	argN := 2

	if sex := q.Get("sex"); sex != "" {
		where += fmt.Sprintf(" AND a.sex = $%d", argN)
		args = append(args, sex)
		argN++
	}
	if herd := q.Get("herd_id"); herd != "" {
		where += fmt.Sprintf(" AND a.herd_id = $%d", argN)
		args = append(args, herd)
		argN++
	}
	if zone := q.Get("zone_id"); zone != "" {
		where += fmt.Sprintf(" AND a.zone_id = $%d", argN)
		args = append(args, zone)
		argN++
	}
	if status := q.Get("status"); status != "" {
		where += fmt.Sprintf(" AND a.status = $%d", argN)
		args = append(args, status)
		argN++
	} else {
		where += " AND a.status = 'active'"
	}
	if search := q.Get("q"); search != "" {
		where += fmt.Sprintf(" AND (a.ear_tag ILIKE $%d OR a.name ILIKE $%d)", argN, argN)
		args = append(args, "%"+search+"%")
		argN++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM animals a WHERE "+where, countArgs...).Scan(&total)

	args = append(args, limit, offset)
	rows, err := h.pool.Query(r.Context(), `
		SELECT a.id, a.farm_id, a.herd_id, a.zone_id, a.ear_tag, a.name,
		       a.sex, a.breed, a.birth_date, a.entry_reason, a.status,
		       NULL::float8, NULL::float8,
		       a.last_seen_at,
		       h.name AS herd_name, h.color AS herd_color,
		       z.name AS zone_name
		FROM animals a
		LEFT JOIN herds h ON h.id = a.herd_id
		LEFT JOIN zones z ON z.id = a.zone_id
		WHERE `+where+fmt.Sprintf(`
		ORDER BY a.ear_tag LIMIT $%d OFFSET $%d`, argN, argN+1),
		args...)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	animals := []Animal{}
	for rows.Next() {
		var a Animal
		var bd *time.Time
		if err := rows.Scan(
			&a.ID, &a.FarmID, &a.HerdID, &a.ZoneID, &a.EarTag, &a.Name,
			&a.Sex, &a.Breed, &bd, &a.EntryReason, &a.Status,
			&a.LastLat, &a.LastLng, &a.LastSeenAt,
			&a.HerdName, &a.HerdColor, &a.ZoneName,
		); err != nil {
			response.InternalError(w)
			return
		}
		if bd != nil {
			s := bd.Format("2006-01-02")
			a.BirthDate = &s
		}
		animals = append(animals, a)
	}
	response.Paginated(w, animals, total, page, limit)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	var a Animal
	var bd *time.Time
	err = h.pool.QueryRow(r.Context(), `
		SELECT a.id, a.farm_id, a.herd_id, a.zone_id, a.ear_tag, a.name,
		       a.sex, a.breed, a.birth_date, a.entry_reason, a.status,
		       NULL::float8, NULL::float8,
		       a.last_seen_at,
		       h.name AS herd_name, h.color AS herd_color,
		       z.name AS zone_name
		FROM animals a
		LEFT JOIN herds h ON h.id = a.herd_id
		LEFT JOIN zones z ON z.id = a.zone_id
		WHERE a.id=$1 AND a.farm_id=$2`, animalID, farmID,
	).Scan(&a.ID, &a.FarmID, &a.HerdID, &a.ZoneID, &a.EarTag, &a.Name,
		&a.Sex, &a.Breed, &bd, &a.EntryReason, &a.Status,
		&a.LastLat, &a.LastLng, &a.LastSeenAt,
		&a.HerdName, &a.HerdColor, &a.ZoneName)
	if err != nil {
		response.NotFound(w, "animal not found")
		return
	}
	if bd != nil {
		s := bd.Format("2006-01-02")
		a.BirthDate = &s
	}
	response.Ok(w, a)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		EarTag      string  `json:"ear_tag"`
		Name        *string `json:"name"`
		Sex         string  `json:"sex"`
		Breed       *string `json:"breed"`
		BirthDate   *string `json:"birth_date"`
		EntryReason *string `json:"entry_reason"`
		HerdID      *string `json:"herd_id"`
		ZoneID      *string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EarTag == "" || req.Sex == "" {
		response.BadRequest(w, "ear_tag and sex are required")
		return
	}
	var herdID, zoneID *uuid.UUID
	if req.HerdID != nil {
		id, _ := uuid.Parse(*req.HerdID)
		herdID = &id
	}
	if req.ZoneID != nil {
		id, _ := uuid.Parse(*req.ZoneID)
		zoneID = &id
	}
	var a Animal
	var bd *time.Time
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO animals (id, farm_id, herd_id, zone_id, ear_tag, name, sex, breed, birth_date, entry_reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10)
		RETURNING id, farm_id, herd_id, zone_id, ear_tag, name, sex, breed, birth_date, entry_reason, status,
		          NULL::float8, NULL::float8, NULL::timestamptz`,
		uuid.New(), farmID, herdID, zoneID, req.EarTag, req.Name, req.Sex,
		req.Breed, req.BirthDate, req.EntryReason,
	).Scan(&a.ID, &a.FarmID, &a.HerdID, &a.ZoneID, &a.EarTag, &a.Name,
		&a.Sex, &a.Breed, &bd, &a.EntryReason, &a.Status,
		&a.LastLat, &a.LastLng, &a.LastSeenAt)
	if err != nil {
		response.InternalError(w)
		return
	}
	if bd != nil {
		s := bd.Format("2006-01-02")
		a.BirthDate = &s
	}
	response.Created(w, a)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	var req struct {
		EarTag      string  `json:"ear_tag"`
		Name        *string `json:"name"`
		Sex         string  `json:"sex"`
		Breed       *string `json:"breed"`
		BirthDate   *string `json:"birth_date"`
		EntryReason *string `json:"entry_reason"`
		HerdID      *string `json:"herd_id"`
		ZoneID      *string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	var herdID, zoneID *uuid.UUID
	if req.HerdID != nil {
		id, _ := uuid.Parse(*req.HerdID)
		herdID = &id
	}
	if req.ZoneID != nil {
		id, _ := uuid.Parse(*req.ZoneID)
		zoneID = &id
	}
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE animals SET ear_tag=$1, name=$2, sex=$3, breed=$4,
		       birth_date=$5::date, entry_reason=$6, herd_id=$7, zone_id=$8, updated_at=NOW()
		WHERE id=$9 AND farm_id=$10`,
		req.EarTag, req.Name, req.Sex, req.Breed,
		req.BirthDate, req.EntryReason, herdID, zoneID,
		animalID, farmID)
	if err != nil || tag.RowsAffected() == 0 {
		response.NotFound(w, "animal not found")
		return
	}
	h.Get(w, r)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE animals SET status='dead', updated_at=NOW() WHERE id=$1 AND farm_id=$2`,
		animalID, farmID)
	response.NoContent(w)
}

func (h *Handler) GetActivity(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	type DayActivity struct {
		Date    string  `json:"date"`
		KmDay   float64 `json:"km_day"`
		AvgHerd float64 `json:"avg_herd"`
	}
	rows, err := h.pool.Query(r.Context(), `
		WITH daily AS (
			SELECT date_trunc('day', recorded_at) AS day, animal_id,
			       SUM(COALESCE(speed_kmh,0)) / NULLIF(COUNT(*),0) * 24 AS km_day
			FROM gps_tracks
			WHERE farm_id=$1 AND recorded_at >= NOW() - INTERVAL '7 days'
			GROUP BY day, animal_id
		), herd_avg AS (
			SELECT day, AVG(km_day) AS avg_km FROM daily GROUP BY day
		)
		SELECT to_char(d.day,'YYYY-MM-DD'), COALESCE(d.km_day,0), COALESCE(h.avg_km,0)
		FROM daily d
		JOIN herd_avg h ON h.day = d.day
		WHERE d.animal_id=$2
		ORDER BY d.day`, farmID, animalID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	days := []DayActivity{}
	for rows.Next() {
		var d DayActivity
		if err := rows.Scan(&d.Date, &d.KmDay, &d.AvgHerd); err != nil {
			continue
		}
		days = append(days, d)
	}
	response.Ok(w, days)
}

func (h *Handler) GetGPSTrack(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	hours := 24
	if hStr := r.URL.Query().Get("hours"); hStr != "" {
		hours, _ = strconv.Atoi(hStr)
	}
	type TrackPoint struct {
		Lat      float64   `json:"lat"`
		Lng      float64   `json:"lng"`
		Time     time.Time `json:"timestamp"`
		SpeedKmh *float64  `json:"speed_kmh,omitempty"`
	}
	rows, err := h.pool.Query(r.Context(), `
		SELECT ST_Y(location::geometry), ST_X(location::geometry), recorded_at, speed_kmh
		FROM gps_tracks
		WHERE animal_id=$1 AND farm_id=$2
		  AND recorded_at >= NOW() - ($3 || ' hours')::interval
		ORDER BY recorded_at`, animalID, farmID, strconv.Itoa(hours))
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	points := []TrackPoint{}
	for rows.Next() {
		var p TrackPoint
		if err := rows.Scan(&p.Lat, &p.Lng, &p.Time, &p.SpeedKmh); err != nil {
			continue
		}
		points = append(points, p)
	}
	response.Ok(w, points)
}

func (h *Handler) AddReproductiveEvent(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	var req struct {
		EventType   string   `json:"event_type"`
		EventDate   string   `json:"event_date"`
		PartnerID   *string  `json:"partner_id"`
		BirthWeight *float64 `json:"birth_weight"`
		WeanWeight  *float64 `json:"wean_weight"`
		Notes       *string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EventType == "" || req.EventDate == "" {
		response.BadRequest(w, "event_type and event_date required")
		return
	}
	var partnerID *uuid.UUID
	if req.PartnerID != nil {
		id, _ := uuid.Parse(*req.PartnerID)
		partnerID = &id
	}
	var id uuid.UUID
	err = h.pool.QueryRow(r.Context(), `
		INSERT INTO reproductive_events
		  (id, animal_id, farm_id, event_type, event_date, partner_id, birth_weight, wean_weight, notes)
		VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)
		RETURNING id`,
		uuid.New(), animalID, farmID, req.EventType, req.EventDate,
		partnerID, req.BirthWeight, req.WeanWeight, req.Notes,
	).Scan(&id)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, map[string]any{"id": id})
}

func (h *Handler) AddWeightRecord(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	animalID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid animal id")
		return
	}
	var req struct {
		WeightKg   float64 `json:"weight_kg"`
		RecordedAt string  `json:"recorded_at"`
		Notes      *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.WeightKg == 0 || req.RecordedAt == "" {
		response.BadRequest(w, "weight_kg and recorded_at required")
		return
	}
	type WeightRecord struct {
		ID         uuid.UUID `json:"id"`
		WeightKg   float64   `json:"weight_kg"`
		RecordedAt string    `json:"recorded_at"`
		DailyGain  *float64  `json:"daily_gain,omitempty"`
	}
	var rec WeightRecord
	err = h.pool.QueryRow(r.Context(), `
		WITH prev AS (
			SELECT weight_kg, recorded_at FROM weight_records
			WHERE animal_id=$2 ORDER BY recorded_at DESC LIMIT 1
		),
		inserted AS (
			INSERT INTO weight_records (id, animal_id, farm_id, weight_kg, recorded_at, notes)
			VALUES ($1,$2,$3,$4,$5::date,$6)
			RETURNING id, weight_kg, recorded_at
		)
		SELECT i.id, i.weight_kg, to_char(i.recorded_at,'YYYY-MM-DD'),
		       CASE WHEN p.recorded_at IS NOT NULL
		            THEN ($4 - p.weight_kg) /
		                 GREATEST(1, ($5::date - p.recorded_at)::int)
		            ELSE NULL END
		FROM inserted i
		LEFT JOIN prev p ON true`,
		uuid.New(), animalID, farmID, req.WeightKg, req.RecordedAt, req.Notes,
	).Scan(&rec.ID, &rec.WeightKg, &rec.RecordedAt, &rec.DailyGain)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, rec)
}

func (h *Handler) BulkMove(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		AnimalIDs []uuid.UUID `json:"animal_ids"`
		HerdID    *string     `json:"herd_id"`
		ZoneID    *string     `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.AnimalIDs) == 0 {
		response.BadRequest(w, "animal_ids required")
		return
	}
	var herdID, zoneID *uuid.UUID
	if req.HerdID != nil {
		id, _ := uuid.Parse(*req.HerdID)
		herdID = &id
	}
	if req.ZoneID != nil {
		id, _ := uuid.Parse(*req.ZoneID)
		zoneID = &id
	}
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE animals SET
		  herd_id = COALESCE($1, herd_id),
		  zone_id = COALESCE($2, zone_id),
		  updated_at = NOW()
		WHERE id=ANY($3) AND farm_id=$4`,
		herdID, zoneID, req.AnimalIDs, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Ok(w, map[string]any{"updated": tag.RowsAffected()})
}

// =============================================
// HERDS
// =============================================

type HerdHandler struct{ pool *pgxpool.Pool }

func NewHerdHandler(pool *pgxpool.Pool) *HerdHandler { return &HerdHandler{pool: pool} }

type Herd struct {
	ID          uuid.UUID  `json:"id"`
	FarmID      uuid.UUID  `json:"farm_id"`
	Name        string     `json:"name"`
	Color       string     `json:"color"`
	ZoneID      *uuid.UUID `json:"zone_id,omitempty"`
	ZoneName    *string    `json:"zone_name,omitempty"`
	AnimalCount int        `json:"animal_count"`
}

func (h *HerdHandler) List(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT hr.id, hr.farm_id, hr.name, hr.color, hr.zone_id,
		       z.name AS zone_name, COUNT(a.id)::int AS animal_count
		FROM herds hr
		LEFT JOIN zones z ON z.id = hr.zone_id
		LEFT JOIN animals a ON a.herd_id = hr.id AND a.status='active'
		WHERE hr.farm_id=$1
		GROUP BY hr.id, z.name
		ORDER BY hr.name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	herds := []Herd{}
	for rows.Next() {
		var herd Herd
		if err := rows.Scan(&herd.ID, &herd.FarmID, &herd.Name, &herd.Color,
			&herd.ZoneID, &herd.ZoneName, &herd.AnimalCount); err != nil {
			response.InternalError(w)
			return
		}
		herds = append(herds, herd)
	}
	response.Ok(w, herds)
}

func (h *HerdHandler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	herdID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid herd id")
		return
	}
	var herd Herd
	err = h.pool.QueryRow(r.Context(), `
		SELECT hr.id, hr.farm_id, hr.name, hr.color, hr.zone_id,
		       z.name, COUNT(a.id)::int
		FROM herds hr
		LEFT JOIN zones z ON z.id = hr.zone_id
		LEFT JOIN animals a ON a.herd_id = hr.id AND a.status='active'
		WHERE hr.id=$1 AND hr.farm_id=$2
		GROUP BY hr.id, z.name`, herdID, farmID,
	).Scan(&herd.ID, &herd.FarmID, &herd.Name, &herd.Color,
		&herd.ZoneID, &herd.ZoneName, &herd.AnimalCount)
	if err != nil {
		response.NotFound(w, "herd not found")
		return
	}
	response.Ok(w, herd)
}

func (h *HerdHandler) Create(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		Name   string  `json:"name"`
		Color  string  `json:"color"`
		ZoneID *string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name required")
		return
	}
	if req.Color == "" {
		req.Color = "#22c55e"
	}
	var zoneID *uuid.UUID
	if req.ZoneID != nil {
		id, _ := uuid.Parse(*req.ZoneID)
		zoneID = &id
	}
	var herd Herd
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO herds (id, farm_id, name, color, zone_id)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, farm_id, name, color, zone_id`,
		uuid.New(), farmID, req.Name, req.Color, zoneID,
	).Scan(&herd.ID, &herd.FarmID, &herd.Name, &herd.Color, &herd.ZoneID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, herd)
}

func (h *HerdHandler) Update(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	herdID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid herd id")
		return
	}
	var req struct {
		Name   string  `json:"name"`
		Color  string  `json:"color"`
		ZoneID *string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name required")
		return
	}
	var zoneID *uuid.UUID
	if req.ZoneID != nil {
		id, _ := uuid.Parse(*req.ZoneID)
		zoneID = &id
	}
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE herds SET name=$1, color=$2, zone_id=$3, updated_at=NOW()
		WHERE id=$4 AND farm_id=$5`,
		req.Name, req.Color, zoneID, herdID, farmID)
	if err != nil || tag.RowsAffected() == 0 {
		response.NotFound(w, "herd not found")
		return
	}
	h.Get(w, r)
}

func (h *HerdHandler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	herdID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid herd id")
		return
	}
	_, _ = h.pool.Exec(r.Context(),
		`DELETE FROM herds WHERE id=$1 AND farm_id=$2`, herdID, farmID)
	response.NoContent(w)
}

// silence unused import
var _ = fmt.Sprintf
