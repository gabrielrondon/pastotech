package subscription

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

// ─── Plans ────────────────────────────────────────────────────────────────────

type Plan struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AnimalLimit int    `json:"animal_limit"`
	PriceCents  int    `json:"price_cents"`
	Currency    string `json:"currency"`
	StripePriceID string `json:"stripe_price_id,omitempty"`
}

var Plans = []Plan{
	{
		ID:          "free",
		Name:        "Free",
		AnimalLimit: 5,
		PriceCents:  0,
		Currency:    "BRL",
	},
	{
		ID:            "basic",
		Name:          "Basic",
		AnimalLimit:   50,
		PriceCents:    9900,
		Currency:      "BRL",
		StripePriceID: os.Getenv("STRIPE_PRICE_BASIC"),
	},
	{
		ID:            "pro",
		Name:          "Pro",
		AnimalLimit:   500,
		PriceCents:    29900,
		Currency:      "BRL",
		StripePriceID: os.Getenv("STRIPE_PRICE_PRO"),
	},
	{
		ID:            "enterprise",
		Name:          "Enterprise",
		AnimalLimit:   99999,
		PriceCents:    99900,
		Currency:      "BRL",
		StripePriceID: os.Getenv("STRIPE_PRICE_ENTERPRISE"),
	},
}

// ─── Subscription type ────────────────────────────────────────────────────────

type Subscription struct {
	ID                   string     `json:"id"`
	FarmID               string     `json:"farm_id"`
	Plan                 string     `json:"plan"`
	Status               string     `json:"status"`
	AnimalLimit          int        `json:"animal_limit"`
	AnimalCount          int        `json:"animal_count"`
	StripeCustomerID     *string    `json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID *string    `json:"stripe_subscription_id,omitempty"`
	CurrentPeriodEnd     *time.Time `json:"current_period_end,omitempty"`
	TrialEndsAt          *time.Time `json:"trial_ends_at,omitempty"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type Handler struct{ pool *pgxpool.Pool }

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// GET /subscription — current farm subscription + usage
func (h *Handler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	var sub Subscription
	err := h.pool.QueryRow(r.Context(), `
		SELECT s.id, s.farm_id, s.plan, s.status, s.animal_limit,
		       s.stripe_customer_id, s.stripe_subscription_id,
		       s.current_period_end, s.trial_ends_at,
		       (SELECT COUNT(*) FROM animals WHERE farm_id = s.farm_id AND status = 'active') AS animal_count
		FROM subscriptions s
		WHERE s.farm_id = $1`, farmID,
	).Scan(&sub.ID, &sub.FarmID, &sub.Plan, &sub.Status, &sub.AnimalLimit,
		&sub.StripeCustomerID, &sub.StripeSubscriptionID,
		&sub.CurrentPeriodEnd, &sub.TrialEndsAt, &sub.AnimalCount)
	if err != nil {
		response.NotFound(w, "subscription not found")
		return
	}

	type resp struct {
		Subscription Subscription `json:"subscription"`
		Plans        []Plan       `json:"plans"`
	}
	response.Ok(w, resp{Subscription: sub, Plans: Plans})
}

// POST /subscription/checkout — create Stripe checkout session
func (h *Handler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	var body struct {
		PlanID      string `json:"plan_id"`
		SuccessURL  string `json:"success_url"`
		CancelURL   string `json:"cancel_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "invalid body")
		return
	}

	// Find the plan
	var selectedPlan *Plan
	for i := range Plans {
		if Plans[i].ID == body.PlanID {
			selectedPlan = &Plans[i]
			break
		}
	}
	if selectedPlan == nil || selectedPlan.StripePriceID == "" {
		response.BadRequest(w, "invalid plan or stripe not configured")
		return
	}

	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeKey == "" {
		response.Error(w, http.StatusServiceUnavailable, "stripe not configured")
		return
	}

	// Get or create Stripe customer
	var stripeCustomerID *string
	h.pool.QueryRow(r.Context(),
		`SELECT stripe_customer_id FROM subscriptions WHERE farm_id = $1`, farmID,
	).Scan(&stripeCustomerID)

	// Build Stripe checkout session via REST API
	params := map[string]any{
		"mode":               "subscription",
		"success_url":        body.SuccessURL,
		"cancel_url":         body.CancelURL,
		"line_items[0][price]":    selectedPlan.StripePriceID,
		"line_items[0][quantity]": "1",
		"metadata[farm_id]":       farmID.String(),
	}
	if stripeCustomerID != nil {
		params["customer"] = *stripeCustomerID
	}

	checkoutURL, err := stripeCheckoutSession(stripeKey, params)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "failed to create checkout session")
		return
	}

	response.Ok(w, map[string]string{"url": checkoutURL})
}

// POST /subscription/portal — create Stripe customer portal session
func (h *Handler) CustomerPortal(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())

	var body struct {
		ReturnURL string `json:"return_url"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	var stripeCustomerID string
	err := h.pool.QueryRow(r.Context(),
		`SELECT stripe_customer_id FROM subscriptions WHERE farm_id = $1 AND stripe_customer_id IS NOT NULL`,
		farmID,
	).Scan(&stripeCustomerID)
	if err != nil {
		response.BadRequest(w, "no active stripe subscription")
		return
	}

	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeKey == "" {
		response.Error(w, http.StatusServiceUnavailable, "stripe not configured")
		return
	}

	portalURL, err := stripePortalSession(stripeKey, stripeCustomerID, body.ReturnURL)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "failed to create portal session")
		return
	}

	response.Ok(w, map[string]string{"url": portalURL})
}

// POST /subscription/webhook — Stripe webhook handler
func (h *Handler) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		response.BadRequest(w, "failed to read body")
		return
	}

	// Parse the event type without verifying signature (add signature verification in prod)
	var event struct {
		Type string `json:"type"`
		Data struct {
			Object map[string]any `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		response.BadRequest(w, "invalid event")
		return
	}

	switch event.Type {
	case "customer.subscription.created", "customer.subscription.updated":
		farmID, _ := event.Data.Object["metadata"].(map[string]any)["farm_id"].(string)
		status, _ := event.Data.Object["status"].(string)
		customerID, _ := event.Data.Object["customer"].(string)
		subID, _ := event.Data.Object["id"].(string)

		if farmID != "" {
			// Map Stripe plan to our plan ID
			plan := "basic"
			if items, ok := event.Data.Object["items"].(map[string]any); ok {
				if data, ok := items["data"].([]any); ok && len(data) > 0 {
					if item, ok := data[0].(map[string]any); ok {
						if price, ok := item["price"].(map[string]any); ok {
							priceID, _ := price["id"].(string)
							for _, p := range Plans {
								if p.StripePriceID == priceID {
									plan = p.ID
									break
								}
							}
						}
					}
				}
			}

			animalLimit := 50
			for _, p := range Plans {
				if p.ID == plan {
					animalLimit = p.AnimalLimit
					break
				}
			}

			h.pool.Exec(r.Context(), `
				UPDATE subscriptions
				SET plan = $1, status = $2, stripe_customer_id = $3,
				    stripe_subscription_id = $4, animal_limit = $5,
				    updated_at = NOW()
				WHERE farm_id = $6`,
				plan, status, customerID, subID, animalLimit, farmID)
		}

	case "customer.subscription.deleted":
		customerID, _ := event.Data.Object["customer"].(string)
		h.pool.Exec(r.Context(), `
			UPDATE subscriptions
			SET plan = 'free', status = 'active', stripe_subscription_id = NULL,
			    animal_limit = 5, updated_at = NOW()
			WHERE stripe_customer_id = $1`, customerID)
	}

	w.WriteHeader(http.StatusOK)
}

// ─── Stripe REST helpers ───────────────────────────────────────────────────────

func stripeCheckoutSession(key string, params map[string]any) (string, error) {
	// Build form body for Stripe API
	formBody := ""
	for k, v := range params {
		if formBody != "" {
			formBody += "&"
		}
		formBody += k + "=" + urlEncode(v.(string))
	}

	req, err := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions",
		io.NopCloser(stringReader(formBody)))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(key, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		URL string `json:"url"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.URL, nil
}

func stripePortalSession(key, customerID, returnURL string) (string, error) {
	formBody := "customer=" + urlEncode(customerID) + "&return_url=" + urlEncode(returnURL)

	req, err := http.NewRequest("POST", "https://api.stripe.com/v1/billing_portal/sessions",
		io.NopCloser(stringReader(formBody)))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(key, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		URL string `json:"url"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.URL, nil
}

// minimal URL encoding for Stripe params
func urlEncode(s string) string {
	encoded := ""
	for _, c := range s {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~':
			encoded += string(c)
		default:
			encoded += "%" + hexByte(byte(c))
		}
	}
	return encoded
}

func hexByte(b byte) string {
	const hex = "0123456789ABCDEF"
	return string([]byte{hex[b>>4], hex[b&0xf]})
}

type strReader struct{ s string; pos int }
func (r *strReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.s) { return 0, io.EOF }
	n = copy(p, r.s[r.pos:])
	r.pos += n
	return n, nil
}
func stringReader(s string) *strReader { return &strReader{s: s} }
