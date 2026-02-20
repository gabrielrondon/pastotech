package zone

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// =============================================
// ZONES
// =============================================

type Zone struct {
	ID         uuid.UUID  `json:"id"`
	FarmID     uuid.UUID  `json:"farm_id"`
	GroupID    *uuid.UUID `json:"group_id,omitempty"`
	Name       string     `json:"name"`
	AreaHa     float64    `json:"area_ha"`
	GrassType  *string    `json:"grass_type,omitempty"`
	UGMHaLimit *float64   `json:"ugm_ha_limit,omitempty"`
	IsActive   bool       `json:"is_active"`
	AnimalCount int       `json:"animal_count"`
	UGMHa      float64    `json:"ugm_ha"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT z.id, z.farm_id, z.group_id, z.name, z.area_ha,
		       z.grass_type, z.ugm_ha_limit, z.is_active,
		       COUNT(a.id)::int AS animal_count,
		       CASE WHEN z.area_ha > 0
		            THEN COUNT(a.id)::float / z.area_ha
		            ELSE 0 END AS ugm_ha
		FROM zones z
		LEFT JOIN animals a ON a.zone_id = z.id AND a.status = 'active'
		WHERE z.farm_id = $1
		GROUP BY z.id
		ORDER BY z.name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	zones := []Zone{}
	for rows.Next() {
		var z Zone
		if err := rows.Scan(&z.ID, &z.FarmID, &z.GroupID, &z.Name, &z.AreaHa,
			&z.GrassType, &z.UGMHaLimit, &z.IsActive, &z.AnimalCount, &z.UGMHa); err != nil {
			response.InternalError(w)
			return
		}
		zones = append(zones, z)
	}
	response.Ok(w, zones)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	zoneID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid zone id")
		return
	}
	var z Zone
	err = h.pool.QueryRow(r.Context(), `
		SELECT z.id, z.farm_id, z.group_id, z.name, z.area_ha,
		       z.grass_type, z.ugm_ha_limit, z.is_active,
		       COUNT(a.id)::int AS animal_count,
		       CASE WHEN z.area_ha > 0
		            THEN COUNT(a.id)::float / z.area_ha
		            ELSE 0 END AS ugm_ha
		FROM zones z
		LEFT JOIN animals a ON a.zone_id = z.id AND a.status = 'active'
		WHERE z.id = $1 AND z.farm_id = $2
		GROUP BY z.id`, zoneID, farmID,
	).Scan(&z.ID, &z.FarmID, &z.GroupID, &z.Name, &z.AreaHa,
		&z.GrassType, &z.UGMHaLimit, &z.IsActive, &z.AnimalCount, &z.UGMHa)
	if err != nil {
		response.NotFound(w, "zone not found")
		return
	}
	response.Ok(w, z)
}

type ZoneRequest struct {
	GroupID    *uuid.UUID `json:"group_id"`
	Name       string     `json:"name"`
	GeoJSON    string     `json:"geojson"`
	AreaHa     float64    `json:"area_ha"`
	GrassType  *string    `json:"grass_type"`
	UGMHaLimit *float64   `json:"ugm_ha_limit"`
	IsActive   bool       `json:"is_active"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req ZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name and geojson are required")
		return
	}
	var z Zone
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO zones (id, farm_id, group_id, name, geometry, area_ha, grass_type, ugm_ha_limit, is_active)
		VALUES ($1,$2,$3,$4,ST_GeogFromGeoJSON($5),$6,$7,$8,$9)
		RETURNING id, farm_id, group_id, name, area_ha, grass_type, ugm_ha_limit, is_active`,
		uuid.New(), farmID, req.GroupID, req.Name, req.GeoJSON, req.AreaHa,
		req.GrassType, req.UGMHaLimit, req.IsActive,
	).Scan(&z.ID, &z.FarmID, &z.GroupID, &z.Name, &z.AreaHa, &z.GrassType, &z.UGMHaLimit, &z.IsActive)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, z)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	zoneID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid zone id")
		return
	}
	var req ZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	var z Zone
	err = h.pool.QueryRow(r.Context(), `
		UPDATE zones SET name=$1, group_id=$2, grass_type=$3, ugm_ha_limit=$4,
		       is_active=$5, updated_at=NOW()
		WHERE id=$6 AND farm_id=$7
		RETURNING id, farm_id, group_id, name, area_ha, grass_type, ugm_ha_limit, is_active`,
		req.Name, req.GroupID, req.GrassType, req.UGMHaLimit, req.IsActive, zoneID, farmID,
	).Scan(&z.ID, &z.FarmID, &z.GroupID, &z.Name, &z.AreaHa, &z.GrassType, &z.UGMHaLimit, &z.IsActive)
	if err != nil {
		response.NotFound(w, "zone not found")
		return
	}
	response.Ok(w, z)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	zoneID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid zone id")
		return
	}
	_, _ = h.pool.Exec(r.Context(), `DELETE FROM zones WHERE id=$1 AND farm_id=$2`, zoneID, farmID)
	response.NoContent(w)
}

func (h *Handler) AssignAnimals(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	zoneID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid zone id")
		return
	}
	var req struct{ AnimalIDs []uuid.UUID `json:"animal_ids"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.AnimalIDs) == 0 {
		response.BadRequest(w, "animal_ids required")
		return
	}
	tag, err := h.pool.Exec(r.Context(),
		`UPDATE animals SET zone_id=$1, updated_at=NOW() WHERE id=ANY($2) AND farm_id=$3`,
		zoneID, req.AnimalIDs, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Ok(w, map[string]any{"moved": tag.RowsAffected()})
}

func (h *Handler) MoveAnimals(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	fromZoneID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.BadRequest(w, "invalid zone id")
		return
	}
	var req struct {
		ToZoneID  uuid.UUID   `json:"to_zone_id"`
		AnimalIDs []uuid.UUID `json:"animal_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	var tag interface{ RowsAffected() int64 }
	if len(req.AnimalIDs) > 0 {
		tag, err = h.pool.Exec(r.Context(),
			`UPDATE animals SET zone_id=$1, updated_at=NOW()
			 WHERE id=ANY($2) AND zone_id=$3 AND farm_id=$4`,
			req.ToZoneID, req.AnimalIDs, fromZoneID, farmID)
	} else {
		tag, err = h.pool.Exec(r.Context(),
			`UPDATE animals SET zone_id=$1, updated_at=NOW()
			 WHERE zone_id=$2 AND farm_id=$3`,
			req.ToZoneID, fromZoneID, farmID)
	}
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Ok(w, map[string]any{"moved": tag.RowsAffected()})
}

// =============================================
// ZONE GROUPS
// =============================================

type ZoneGroup struct {
	ID          uuid.UUID `json:"id"`
	FarmID      uuid.UUID `json:"farm_id"`
	Name        string    `json:"name"`
	AnimalCount int       `json:"animal_count"`
	ZoneCount   int       `json:"zone_count"`
}

func (h *Handler) ListGroups(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT g.id, g.farm_id, g.name,
		       COALESCE(SUM(ac.cnt),0)::int AS animal_count,
		       COUNT(z.id)::int AS zone_count
		FROM zone_groups g
		LEFT JOIN zones z ON z.group_id = g.id
		LEFT JOIN (
			SELECT zone_id, COUNT(*) AS cnt FROM animals
			WHERE status='active' GROUP BY zone_id
		) ac ON ac.zone_id = z.id
		WHERE g.farm_id = $1
		GROUP BY g.id
		ORDER BY g.name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	groups := []ZoneGroup{}
	for rows.Next() {
		var g ZoneGroup
		if err := rows.Scan(&g.ID, &g.FarmID, &g.Name, &g.AnimalCount, &g.ZoneCount); err != nil {
			response.InternalError(w)
			return
		}
		groups = append(groups, g)
	}
	response.Ok(w, groups)
}

func (h *Handler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct{ Name string `json:"name"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name is required")
		return
	}
	var g ZoneGroup
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO zone_groups (id, farm_id, name) VALUES ($1,$2,$3) RETURNING id, farm_id, name`,
		uuid.New(), farmID, req.Name,
	).Scan(&g.ID, &g.FarmID, &g.Name)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, g)
}

// =============================================
// KEY POINTS
// =============================================

type KeyPoint struct {
	ID       uuid.UUID `json:"id"`
	FarmID   uuid.UUID `json:"farm_id"`
	Name     string    `json:"name"`
	Icon     string    `json:"icon"`
	Lat      float64   `json:"lat"`
	Lng      float64   `json:"lng"`
	IsActive bool      `json:"is_active"`
}

func (h *Handler) ListKeyPoints(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, farm_id, name, icon,
		       ST_Y(location::geometry) AS lat,
		       ST_X(location::geometry) AS lng,
		       is_active
		FROM key_points WHERE farm_id=$1 ORDER BY name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	kps := []KeyPoint{}
	for rows.Next() {
		var kp KeyPoint
		if err := rows.Scan(&kp.ID, &kp.FarmID, &kp.Name, &kp.Icon, &kp.Lat, &kp.Lng, &kp.IsActive); err != nil {
			response.InternalError(w)
			return
		}
		kps = append(kps, kp)
	}
	response.Ok(w, kps)
}

func (h *Handler) CreateKeyPoint(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		Name string  `json:"name"`
		Icon string  `json:"icon"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name, lat, lng required")
		return
	}
	if req.Icon == "" {
		req.Icon = "water"
	}
	point := fmt.Sprintf("POINT(%f %f)", req.Lng, req.Lat)
	var kp KeyPoint
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO key_points (id, farm_id, name, icon, location)
		VALUES ($1,$2,$3,$4,ST_GeogFromText($5))
		RETURNING id, farm_id, name, icon,
		  ST_Y(location::geometry), ST_X(location::geometry), is_active`,
		uuid.New(), farmID, req.Name, req.Icon, point,
	).Scan(&kp.ID, &kp.FarmID, &kp.Name, &kp.Icon, &kp.Lat, &kp.Lng, &kp.IsActive)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, kp)
}

// =============================================
// PERIMETERS
// =============================================

type Perimeter struct {
	ID     uuid.UUID `json:"id"`
	FarmID uuid.UUID `json:"farm_id"`
	Name   string    `json:"name"`
	AreaHa float64   `json:"area_ha"`
}

func (h *Handler) ListPerimeters(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, farm_id, name, area_ha FROM perimeters WHERE farm_id=$1 ORDER BY name`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()
	ps := []Perimeter{}
	for rows.Next() {
		var p Perimeter
		if err := rows.Scan(&p.ID, &p.FarmID, &p.Name, &p.AreaHa); err != nil {
			response.InternalError(w)
			return
		}
		ps = append(ps, p)
	}
	response.Ok(w, ps)
}

func (h *Handler) CreatePerimeter(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	var req struct {
		Name    string  `json:"name"`
		GeoJSON string  `json:"geojson"`
		AreaHa  float64 `json:"area_ha"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		response.BadRequest(w, "name and geojson required")
		return
	}
	var p Perimeter
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO perimeters (id, farm_id, name, geometry, area_ha)
		VALUES ($1,$2,$3,ST_GeogFromGeoJSON($4),$5)
		RETURNING id, farm_id, name, area_ha`,
		uuid.New(), farmID, req.Name, req.GeoJSON, req.AreaHa,
	).Scan(&p.ID, &p.FarmID, &p.Name, &p.AreaHa)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Created(w, p)
}
