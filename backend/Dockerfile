FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /api ./cmd/api

FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata postgresql-client
WORKDIR /app
COPY --from=builder /api .
COPY migrations/ ./migrations/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
EXPOSE 8080
CMD ["./entrypoint.sh"]
