package animal

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gabrielrondon/cowpro/internal/middleware"
	"github.com/gabrielrondon/cowpro/pkg/response"
)

type AgendaHandler struct{ pool *pgxpool.Pool }

func NewAgendaHandler(pool *pgxpool.Pool) *AgendaHandler { return &AgendaHandler{pool: pool} }

type AgendaEvent struct {
	Type    string `json:"type"`
	Count   int    `json:"count"`
	Label   string `json:"label"`
	Week    int    `json:"week"`
	Month   int    `json:"month"`
	Year    int    `json:"year"`
}

type AgendaWeek struct {
	Week   int           `json:"week"`
	Label  string        `json:"label"` // e.g. "Dias 1-7"
	Events []AgendaEvent `json:"events"`
}

type AgendaMonth struct {
	Month int          `json:"month"`
	Year  int          `json:"year"`
	Label string       `json:"label"`
	Weeks []AgendaWeek `json:"weeks"`
}

func (h *AgendaHandler) GetAgenda(w http.ResponseWriter, r *http.Request) {
	farmID := middleware.FarmIDFromCtx(r.Context())
	now := time.Now()

	months := []AgendaMonth{}

	for i := 0; i < 6; i++ {
		target := now.AddDate(0, i, 0)
		m := int(target.Month())
		yr := target.Year()

		// Count various events for this month
		type eventQuery struct {
			eventType string
			label     string
			query     string
		}

		queries := []eventQuery{
			{
				"imminent_birth", "possíveis partos",
				`SELECT COUNT(*) FROM reproductive_events re
				 JOIN animals a ON a.id = re.animal_id
				 WHERE re.farm_id = $1 AND re.event_type = 'pregnancy'
				   AND re.event_date + INTERVAL '280 days'
				       BETWEEN date_trunc('month', make_date($2,$3,1))
				           AND date_trunc('month', make_date($2,$3,1)) + INTERVAL '1 month'`,
			},
			{
				"delayed_birth", "partos retrasados",
				`SELECT COUNT(*) FROM reproductive_events re
				 WHERE re.farm_id = $1 AND re.event_type = 'pregnancy'
				   AND re.event_date + INTERVAL '295 days' < make_date($2,$3,1)
				   AND NOT EXISTS (
				       SELECT 1 FROM reproductive_events re2
				       WHERE re2.animal_id = re.animal_id
				         AND re2.event_type IN ('birth','abortion')
				         AND re2.event_date > re.event_date
				   )`,
			},
			{
				"empty_cow", "vacas vazias",
				`SELECT COUNT(*) FROM animals a
				 WHERE a.farm_id = $1 AND a.sex='female' AND a.status='active'
				   AND NOT EXISTS (
				       SELECT 1 FROM reproductive_events re
				       WHERE re.animal_id = a.id
				         AND re.event_type IN ('pregnancy','birth')
				         AND re.event_date >= make_date($2,$3,1) - INTERVAL '1 year'
				   )`,
			},
			{
				"low_activity", "atividade baixa",
				`SELECT COUNT(*) FROM alerts
				 WHERE farm_id=$1 AND type='low_activity'
				   AND EXTRACT(month FROM created_at)=$3
				   AND EXTRACT(year  FROM created_at)=$2`,
			},
			{
				"high_activity", "atividade alta",
				`SELECT COUNT(*) FROM alerts
				 WHERE farm_id=$1 AND type='high_activity'
				   AND EXTRACT(month FROM created_at)=$3
				   AND EXTRACT(year  FROM created_at)=$2`,
			},
		}

		var events []AgendaEvent
		for _, q := range queries {
			var count int
			_ = h.pool.QueryRow(r.Context(), q.query, farmID, yr, m).Scan(&count)
			if count > 0 {
				events = append(events, AgendaEvent{
					Type:  q.eventType,
					Count: count,
					Label: q.label,
					Month: m,
					Year:  yr,
				})
			}
		}

		monthLabel := target.Format("January 2006")
		months = append(months, AgendaMonth{
			Month: m,
			Year:  yr,
			Label: monthLabel,
			Weeks: groupByWeek(events, m, yr),
		})
	}

	response.Ok(w, months)
}

func groupByWeek(events []AgendaEvent, month, year int) []AgendaWeek {
	// Simple 4-week grouping
	weeks := []AgendaWeek{
		{Week: 1, Label: "Dias 1–7"},
		{Week: 2, Label: "Dias 8–14"},
		{Week: 3, Label: "Dias 15–22"},
		{Week: 4, Label: "Dias 23–31"},
	}
	// Put all events in week 3 (current week approx) as placeholder
	for i := range weeks {
		if weeks[i].Week == 3 {
			weeks[i].Events = events
		} else {
			weeks[i].Events = []AgendaEvent{}
		}
	}
	return weeks
}

var _ = time.Now
