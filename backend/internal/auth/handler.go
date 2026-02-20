package auth

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

type Handler struct {
	pool      *pgxpool.Pool
	jwtSecret string
}

func NewHandler(pool *pgxpool.Pool, jwtSecret string) *Handler {
	return &Handler{pool: pool, jwtSecret: jwtSecret}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	r.Post("/login", h.Login)
	r.Post("/refresh", h.Refresh)
	r.Get("/me", h.Me)
	return r
}

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         User   `json:"user"`
}

type User struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Email string    `json:"email"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" || req.Name == "" {
		response.BadRequest(w, "name, email and password are required")
		return
	}
	if len(req.Password) < 8 {
		response.BadRequest(w, "password must be at least 8 characters")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.InternalError(w)
		return
	}

	var user User
	err = h.pool.QueryRow(r.Context(),
		`INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, NOW(), NOW())
		 RETURNING id, name, email`,
		uuid.New(), req.Name, req.Email, string(hash),
	).Scan(&user.ID, &user.Name, &user.Email)
	if err != nil {
		if isUniqueViolation(err) {
			response.Error(w, http.StatusConflict, "email already in use")
			return
		}
		response.InternalError(w)
		return
	}

	tokens, err := h.generateTokens(user.ID, uuid.Nil, "owner")
	if err != nil {
		response.InternalError(w)
		return
	}
	tokens.User = user
	response.Created(w, tokens)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	var user User
	var passwordHash string
	var farmID uuid.UUID
	var role string

	err := h.pool.QueryRow(r.Context(),
		`SELECT u.id, u.name, u.email, u.password_hash,
		        COALESCE(fm.farm_id, '00000000-0000-0000-0000-000000000000'::uuid),
		        COALESCE(fm.role, 'owner')
		 FROM users u
		 LEFT JOIN farm_members fm ON fm.user_id = u.id
		 WHERE u.email = $1
		 LIMIT 1`,
		req.Email,
	).Scan(&user.ID, &user.Name, &user.Email, &passwordHash, &farmID, &role)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		response.Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	tokens, err := h.generateTokens(user.ID, farmID, role)
	if err != nil {
		response.InternalError(w)
		return
	}
	tokens.User = user
	response.Ok(w, tokens)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	type RefreshRequest struct {
		RefreshToken string `json:"refresh_token"`
	}
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid request body")
		return
	}

	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(req.RefreshToken, claims, func(t *jwt.Token) (any, error) {
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		response.Unauthorized(w)
		return
	}

	tokens, err := h.generateTokens(claims.UserID, claims.FarmID, claims.Role)
	if err != nil {
		response.InternalError(w)
		return
	}
	response.Ok(w, tokens)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	var user User
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, name, email FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Name, &user.Email)
	if err != nil {
		response.NotFound(w, "user not found")
		return
	}
	response.Ok(w, user)
}

func (h *Handler) generateTokens(userID, farmID uuid.UUID, role string) (*TokenResponse, error) {
	now := time.Now()

	accessClaims := &middleware.Claims{
		UserID: userID,
		FarmID: farmID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString([]byte(h.jwtSecret))
	if err != nil {
		return nil, err
	}

	refreshClaims := &middleware.Claims{
		UserID: userID,
		FarmID: farmID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString([]byte(h.jwtSecret))
	if err != nil {
		return nil, err
	}

	return &TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && (err.Error() == `ERROR: duplicate key value violates unique constraint "users_email_key" (SQLSTATE 23505)`)
}
