package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/gabrielrondon/cowpro/pkg/response"
)

type contextKey string

const (
	UserIDKey  contextKey = "user_id"
	FarmIDKey  contextKey = "farm_id"
	UserRoleKey contextKey = "user_role"
)

type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	FarmID uuid.UUID `json:"farm_id"`
	Role   string    `json:"role"`
	jwt.RegisteredClaims
}

type Auth struct {
	secret string
}

func NewAuth(secret string) *Auth {
	return &Auth{secret: secret}
}

func (a *Auth) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			response.Unauthorized(w)
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(a.secret), nil
		})

		if err != nil || !token.Valid {
			response.Unauthorized(w)
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, FarmIDKey, claims.FarmID)
		ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *Auth) AuthenticateDevice(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-Device-Key")
		if apiKey == "" {
			response.Unauthorized(w)
			return
		}
		// API key validation happens in the IoT handler against the DB
		ctx := context.WithValue(r.Context(), contextKey("device_key"), apiKey)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserIDFromCtx(ctx context.Context) uuid.UUID {
	v, _ := ctx.Value(UserIDKey).(uuid.UUID)
	return v
}

func FarmIDFromCtx(ctx context.Context) uuid.UUID {
	v, _ := ctx.Value(FarmIDKey).(uuid.UUID)
	return v
}

func RoleFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(UserRoleKey).(string)
	return v
}
