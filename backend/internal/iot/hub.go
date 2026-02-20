package iot

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/google/uuid"
)

// Hub manages WebSocket connections and broadcasts GPS updates.
type Hub struct {
	clients    map[*Client]bool
	farmClients map[uuid.UUID]map[*Client]bool
	broadcast  chan *GPSEvent
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type Client struct {
	hub    *Hub
	farmID uuid.UUID
	send   chan []byte
	conn   interface{ WriteMessage(int, []byte) error; Close() error }
}

type GPSEvent struct {
	Type     string    `json:"type"` // gps_update | alert | device_status
	FarmID   uuid.UUID `json:"farm_id"`
	AnimalID uuid.UUID `json:"animal_id"`
	Payload  any       `json:"payload"`
}

type GPSPayload struct {
	AnimalID  uuid.UUID `json:"animal_id"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	SpeedKmh  float64   `json:"speed_kmh"`
	Battery   int       `json:"battery"`
	Timestamp string    `json:"timestamp"`
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		farmClients: make(map[uuid.UUID]map[*Client]bool),
		broadcast:   make(chan *GPSEvent, 256),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if h.farmClients[client.farmID] == nil {
				h.farmClients[client.farmID] = make(map[*Client]bool)
			}
			h.farmClients[client.farmID][client] = true
			h.mu.Unlock()
			slog.Info("ws client registered", "farm_id", client.farmID)

		case client := <-h.unregister:
			h.mu.Lock()
			if h.clients[client] {
				delete(h.clients, client)
				delete(h.farmClients[client.farmID], client)
				close(client.send)
			}
			h.mu.Unlock()
			slog.Info("ws client unregistered", "farm_id", client.farmID)

		case event := <-h.broadcast:
			h.mu.RLock()
			clients := h.farmClients[event.FarmID]
			h.mu.RUnlock()

			msg, err := json.Marshal(event)
			if err != nil {
				slog.Error("failed to marshal event", "err", err)
				continue
			}

			for client := range clients {
				select {
				case client.send <- msg:
				default:
					h.mu.Lock()
					close(client.send)
					delete(h.clients, client)
					delete(h.farmClients[event.FarmID], client)
					h.mu.Unlock()
				}
			}
		}
	}
}

// BroadcastGPS sends a GPS update to all clients subscribed to a farm.
func (h *Hub) BroadcastGPS(farmID, animalID uuid.UUID, payload GPSPayload) {
	h.broadcast <- &GPSEvent{
		Type:     "gps_update",
		FarmID:   farmID,
		AnimalID: animalID,
		Payload:  payload,
	}
}

// BroadcastAlert sends an alert to all clients of a farm.
func (h *Hub) BroadcastAlert(farmID uuid.UUID, alertType, message string) {
	h.broadcast <- &GPSEvent{
		Type:   "alert",
		FarmID: farmID,
		Payload: map[string]string{
			"type":    alertType,
			"message": message,
		},
	}
}
