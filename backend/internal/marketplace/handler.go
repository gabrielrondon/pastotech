package marketplace

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

type Product struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	Category    string    `json:"category"`
	PriceCents  int       `json:"price_cents"`
	Currency    string    `json:"currency"`
	Stock       int       `json:"stock"`
	Images      []string  `json:"images"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type OrderItem struct {
	ID         uuid.UUID `json:"id"`
	ProductID  uuid.UUID `json:"product_id"`
	ProductName string   `json:"product_name"`
	Quantity   int       `json:"quantity"`
	PriceCents int       `json:"price_cents"`
}

type Order struct {
	ID          uuid.UUID   `json:"id"`
	FarmID      uuid.UUID   `json:"farm_id"`
	Status      string      `json:"status"`
	TotalCents  int         `json:"total_cents"`
	Currency    string      `json:"currency"`
	Items       []OrderItem `json:"items,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// ─── Products ─────────────────────────────────────────────────────────────────

func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")

	query := `
		SELECT id, name, description, category, price_cents, currency,
		       stock, COALESCE(images, '{}'), is_active, created_at
		FROM marketplace_products
		WHERE is_active = TRUE`
	args := []any{}

	if category != "" {
		query += ` AND category = $1`
		args = append(args, category)
	}
	query += ` ORDER BY category, name`

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Category,
			&p.PriceCents, &p.Currency, &p.Stock, &p.Images,
			&p.IsActive, &p.CreatedAt,
		); err != nil {
			response.InternalError(w)
			return
		}
		products = append(products, p)
	}
	response.Ok(w, products)
}

func (h *Handler) GetProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var p Product
	err := h.pool.QueryRow(r.Context(), `
		SELECT id, name, description, category, price_cents, currency,
		       stock, COALESCE(images, '{}'), is_active, created_at
		FROM marketplace_products
		WHERE id = $1 AND is_active = TRUE`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Category,
		&p.PriceCents, &p.Currency, &p.Stock, &p.Images,
		&p.IsActive, &p.CreatedAt)
	if err != nil {
		response.NotFound(w, "product not found")
		return
	}
	response.Ok(w, p)
}

// ─── Orders ───────────────────────────────────────────────────────────────────

type createOrderBody struct {
	Items        []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ShippingAddr map[string]any `json:"shipping_addr"`
}

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	var body createOrderBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Items) == 0 {
		response.BadRequest(w, "items required")
		return
	}

	// Fetch prices and validate stock
	totalCents := 0
	type itemDetail struct {
		productID  uuid.UUID
		priceCents int
		quantity   int
	}
	details := make([]itemDetail, 0, len(body.Items))

	for _, it := range body.Items {
		if it.Quantity < 1 {
			it.Quantity = 1
		}
		var priceCents, stock int
		err := h.pool.QueryRow(r.Context(),
			`SELECT price_cents, stock FROM marketplace_products WHERE id = $1 AND is_active = TRUE`,
			it.ProductID,
		).Scan(&priceCents, &stock)
		if err != nil {
			response.BadRequest(w, "product not found: "+it.ProductID)
			return
		}
		if stock < it.Quantity {
			response.BadRequest(w, "insufficient stock for product "+it.ProductID)
			return
		}
		pid, _ := uuid.Parse(it.ProductID)
		totalCents += priceCents * it.Quantity
		details = append(details, itemDetail{productID: pid, priceCents: priceCents, quantity: it.Quantity})
	}

	shippingJSON, _ := json.Marshal(body.ShippingAddr)

	// Transaction: create order + items + decrement stock
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		response.InternalError(w)
		return
	}
	defer tx.Rollback(r.Context())

	var orderID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		INSERT INTO orders (farm_id, user_id, total_cents, currency, shipping_addr)
		VALUES ($1, $2, $3, 'BRL', $4)
		RETURNING id`,
		farmID, userID, totalCents, shippingJSON,
	).Scan(&orderID)
	if err != nil {
		response.InternalError(w)
		return
	}

	for _, d := range details {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO order_items (order_id, product_id, quantity, price_cents)
			VALUES ($1, $2, $3, $4)`,
			orderID, d.productID, d.quantity, d.priceCents)
		if err != nil {
			response.InternalError(w)
			return
		}
		_, err = tx.Exec(r.Context(),
			`UPDATE marketplace_products SET stock = stock - $1 WHERE id = $2`,
			d.quantity, d.productID)
		if err != nil {
			response.InternalError(w)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.InternalError(w)
		return
	}

	response.Created(w, map[string]any{"order_id": orderID, "total_cents": totalCents})
}

func (h *Handler) ListOrders(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	rows, err := h.pool.Query(r.Context(), `
		SELECT id, farm_id, status, total_cents, currency, created_at
		FROM orders
		WHERE farm_id = $1
		ORDER BY created_at DESC
		LIMIT 50`, farmID)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.FarmID, &o.Status, &o.TotalCents, &o.Currency, &o.CreatedAt,
		); err != nil {
			response.InternalError(w)
			return
		}
		orders = append(orders, o)
	}
	response.Ok(w, orders)
}

func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	id := chi.URLParam(r, "id")

	var o Order
	err := h.pool.QueryRow(r.Context(), `
		SELECT id, farm_id, status, total_cents, currency, created_at
		FROM orders WHERE id = $1 AND farm_id = $2`, id, farmID,
	).Scan(&o.ID, &o.FarmID, &o.Status, &o.TotalCents, &o.Currency, &o.CreatedAt)
	if err != nil {
		response.NotFound(w, "order not found")
		return
	}

	itemRows, err := h.pool.Query(r.Context(), `
		SELECT oi.id, oi.product_id, p.name, oi.quantity, oi.price_cents
		FROM order_items oi
		JOIN marketplace_products p ON p.id = oi.product_id
		WHERE oi.order_id = $1`, id)
	if err != nil {
		response.InternalError(w)
		return
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var it OrderItem
		if err := itemRows.Scan(&it.ID, &it.ProductID, &it.ProductName, &it.Quantity, &it.PriceCents); err != nil {
			response.InternalError(w)
			return
		}
		o.Items = append(o.Items, it)
	}

	response.Ok(w, o)
}
