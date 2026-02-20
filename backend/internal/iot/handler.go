package iot

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/pkg/response"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: restrict in production
	},
}

type Handler struct {
	pool *pgxpool.Pool
	hub  *Hub
}

func NewHandler(pool *pgxpool.Pool, hub *Hub) *Handler {
	return &Handler{pool: pool, hub: hub}
}

// IngestGPS handles GPS data posted by physical devices.
// Auth: X-Device-Key header.
type IngestGPSRequest struct {
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	SpeedKmh  float64   `json:"speed_kmh"`
	Battery   int       `json:"battery"`
	Timestamp time.Time `json:"timestamp"`
}

func (h *Handler) IngestGPS(w http.ResponseWriter, r *http.Request) {
	apiKey, _ := r.Context().Value("device_key").(string)

	var deviceID, animalID, farmID uuid.UUID
	err := h.pool.QueryRow(r.Context(),
		`SELECT d.id, d.animal_id, d.farm_id FROM devices d
		 WHERE d.api_key = $1 AND d.is_active = TRUE`,
		apiKey,
	).Scan(&deviceID, &animalID, &farmID)
	if err != nil {
		response.Unauthorized(w)
		return
	}

	var req IngestGPSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}
	if req.Timestamp.IsZero() {
		req.Timestamp = time.Now()
	}

	// Insert GPS track
	point := fmt.Sprintf("POINT(%f %f)", req.Lng, req.Lat)
	_, err = h.pool.Exec(r.Context(),
		`INSERT INTO gps_tracks (id, device_id, animal_id, farm_id, location, speed_kmh, battery_pct, recorded_at)
		 VALUES ($1, $2, $3, $4, ST_GeogFromText($5), $6, $7, $8)`,
		uuid.New(), deviceID, animalID, farmID, point, req.SpeedKmh, req.Battery, req.Timestamp,
	)
	if err != nil {
		slog.Error("failed to insert gps track", "err", err)
		response.InternalError(w)
		return
	}

	// Update animal's last known location
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE animals SET last_location = ST_GeogFromText($1), last_seen_at = $2, updated_at = NOW()
		 WHERE id = $3`,
		point, req.Timestamp, animalID,
	)

	// Update device battery and last ping
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE devices SET battery_pct = $1, last_ping_at = NOW() WHERE id = $2`,
		req.Battery, deviceID,
	)

	// Broadcast to WebSocket clients
	h.hub.BroadcastGPS(farmID, animalID, GPSPayload{
		AnimalID:  animalID,
		Lat:       req.Lat,
		Lng:       req.Lng,
		SpeedKmh:  req.SpeedKmh,
		Battery:   req.Battery,
		Timestamp: req.Timestamp.Format(time.RFC3339),
	})

	// Check if animal is out of its assigned zone
	go h.checkZoneViolation(animalID, farmID, point)

	w.WriteHeader(http.StatusAccepted)
}

// ServeWS upgrades the connection to WebSocket and registers the client.
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	farmIDStr := r.URL.Query().Get("farm_id")
	farmID, err := uuid.Parse(farmIDStr)
	if err != nil {
		response.BadRequest(w, "invalid farm_id")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade failed", "err", err)
		return
	}

	client := &Client{
		hub:    h.hub,
		farmID: farmID,
		send:   make(chan []byte, 256),
		conn:   conn,
	}

	h.hub.register <- client

	// Write pump
	go func() {
		defer func() {
			h.hub.unregister <- client
			conn.Close()
		}()
		for msg := range client.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Read pump (keep-alive / handle client messages)
	defer func() {
		h.hub.unregister <- client
		conn.Close()
	}()
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *Handler) checkZoneViolation(animalID, farmID uuid.UUID, point string) {
	var assignedZoneID *uuid.UUID
	var insideZone bool

	err := h.pool.QueryRow(
		context.Background(),
		`SELECT zone_id FROM animals WHERE id = $1`,
		animalID,
	).Scan(&assignedZoneID)
	if err != nil || assignedZoneID == nil {
		return
	}

	err = h.pool.QueryRow(
		context.Background(),
		`SELECT ST_Within(ST_GeomFromEWKT($1), geometry::geometry)
		 FROM zones WHERE id = $2`,
		point, *assignedZoneID,
	).Scan(&insideZone)
	if err != nil {
		return
	}

	if !insideZone {
		h.hub.BroadcastAlert(farmID, "out_of_zone",
			fmt.Sprintf("Animal %s saiu da zona designada", animalID))
		_, _ = h.pool.Exec(
			context.Background(),
			`INSERT INTO alerts (id, farm_id, animal_id, type, severity, message)
			 VALUES ($1, $2, $3, 'out_of_zone', 'warning', $4)`,
			uuid.New(), farmID, animalID,
			fmt.Sprintf("Animal saiu da zona designada"),
		)
	}
}
