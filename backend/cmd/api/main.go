package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"

	"github.com/gabrielrondon/cowpro/internal/auth"
	"github.com/gabrielrondon/cowpro/internal/db"
	"github.com/gabrielrondon/cowpro/internal/iot"
	"github.com/gabrielrondon/cowpro/internal/middleware"
)

func main() {
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	pool, err := db.Connect(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("database connected")

	hub := iot.NewHub()
	go hub.Run()

	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{os.Getenv("FRONTEND_URL"), "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	jwtSecret := os.Getenv("JWT_SECRET")
	authMiddleware := middleware.NewAuth(jwtSecret)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	r.Post("/admin/seed", NewSeedHandler(pool).Seed)

	r.Route("/api/v1", func(r chi.Router) {
		// Public routes
		r.Mount("/auth", auth.NewHandler(pool, jwtSecret).Routes())

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.Authenticate)
			r.Mount("/farms", farmRoutes(pool))
			r.Mount("/zones", zoneRoutes(pool))
			r.Mount("/animals", animalRoutes(pool))
			r.Mount("/herds", herdRoutes(pool))
			r.Mount("/health-events", healthRoutes(pool))
			r.Mount("/devices", deviceRoutes(pool, hub))
			r.Mount("/marketplace", marketplaceRoutes(pool))
			r.Mount("/subscription", subscriptionRoutes(pool))
			r.Mount("/stats", statsRoutes(pool))
		})

		// IoT device ingestion (API key auth)
		r.Route("/iot", func(r chi.Router) {
			r.Use(authMiddleware.AuthenticateDevice)
			r.Post("/gps", iot.NewHandler(pool, hub).IngestGPS)
		})

		// WebSocket
		r.Get("/ws", iot.NewHandler(pool, hub).ServeWS)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "err", err)
	}
	slog.Info("server stopped")
}
