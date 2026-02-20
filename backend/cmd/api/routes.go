package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/animal"
	"github.com/gabrielrondon/cowpro/internal/farm"
	"github.com/gabrielrondon/cowpro/internal/health"
	"github.com/gabrielrondon/cowpro/internal/iot"
	"github.com/gabrielrondon/cowpro/internal/marketplace"
	"github.com/gabrielrondon/cowpro/internal/subscription"
	"github.com/gabrielrondon/cowpro/internal/zone"
)

func farmRoutes(pool *pgxpool.Pool) http.Handler {
	h := farm.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	return r
}

func zoneRoutes(pool *pgxpool.Pool) http.Handler {
	h := zone.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	r.Post("/{id}/assign-animals", h.AssignAnimals)
	r.Post("/{id}/move-animals", h.MoveAnimals)
	// Groups
	r.Get("/groups", h.ListGroups)
	r.Post("/groups", h.CreateGroup)
	// Key points
	r.Get("/keypoints", h.ListKeyPoints)
	r.Post("/keypoints", h.CreateKeyPoint)
	// Perimeters
	r.Get("/perimeters", h.ListPerimeters)
	r.Post("/perimeters", h.CreatePerimeter)
	return r
}

func animalRoutes(pool *pgxpool.Pool) http.Handler {
	h := animal.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	r.Get("/{id}/activity", h.GetActivity)
	r.Get("/{id}/gps-track", h.GetGPSTrack)
	r.Post("/{id}/reproductive-event", h.AddReproductiveEvent)
	r.Post("/{id}/weight-record", h.AddWeightRecord)
	r.Post("/bulk-move", h.BulkMove)
	r.Get("/agenda", animal.NewAgendaHandler(pool).GetAgenda)
	return r
}

func herdRoutes(pool *pgxpool.Pool) http.Handler {
	h := animal.NewHerdHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	return r
}

func healthRoutes(pool *pgxpool.Pool) http.Handler {
	h := health.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Delete("/{id}", h.Delete)
	return r
}

func deviceRoutes(pool *pgxpool.Pool, hub *iot.Hub) http.Handler {
	h := iot.NewDeviceHandler(pool, hub)
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Post("/{id}/assign", h.AssignToAnimal)
	r.Delete("/{id}", h.Delete)
	// Antennas
	r.Get("/antennas", h.ListAntennas)
	r.Post("/antennas", h.CreateAntenna)
	return r
}

func marketplaceRoutes(pool *pgxpool.Pool) http.Handler {
	h := marketplace.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/products", h.ListProducts)
	r.Get("/products/{id}", h.GetProduct)
	r.Post("/orders", h.CreateOrder)
	r.Get("/orders", h.ListOrders)
	r.Get("/orders/{id}", h.GetOrder)
	return r
}

func subscriptionRoutes(pool *pgxpool.Pool) http.Handler {
	h := subscription.NewHandler(pool)
	r := chi.NewRouter()
	r.Get("/", h.GetCurrent)
	r.Post("/checkout", h.CreateCheckout)
	r.Post("/portal", h.CustomerPortal)
	r.Post("/webhook", h.StripeWebhook)
	return r
}

func statsRoutes(pool *pgxpool.Pool) http.Handler {
	h := farm.NewStatsHandler(pool)
	r := chi.NewRouter()
	r.Get("/overview", h.Overview)
	r.Get("/breeding", h.Breeding)
	r.Get("/fattening", h.Fattening)
	r.Get("/profitability", h.Profitability)
	r.Get("/alerts", h.ListAlerts)
	r.Post("/alerts/{id}/read", h.MarkAlertRead)
	return r
}
