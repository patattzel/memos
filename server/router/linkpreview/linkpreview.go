package linkpreview

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"

	"github.com/usememos/memos/plugin/httpgetter"
	"github.com/usememos/memos/server/auth"
	"github.com/usememos/memos/store"
)

// Service exposes a tiny HTTP endpoint for fetching link metadata (Open Graph).
// It runs on the server to avoid browser CORS limits and blocks internal IPs
// via the shared httpgetter validation.
type Service struct {
	authenticator *auth.Authenticator
}

// NewService constructs a link preview service.
func NewService(store *store.Store, secret string) *Service {
	return &Service{
		authenticator: auth.NewAuthenticator(store, secret),
	}
}

// RegisterRoutes registers HTTP routes on the provided group.
// Path: GET /api/link/preview?url=<encoded>
func (s *Service) RegisterRoutes(group *echo.Group) {
	group.GET("/api/link/preview", s.handlePreview)
}

// handlePreview fetches Open Graph metadata for the requested URL.
// Authentication: session cookie or Bearer token (same as other HTTP endpoints).
func (s *Service) handlePreview(c echo.Context) error {
	// Require authentication (session cookie or JWT bearer)
	if _, err := s.authenticate(c.Request()); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "unauthorized").SetInternal(err)
	}

	rawURL := strings.TrimSpace(c.QueryParam("url"))
	if rawURL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url is required")
	}

	meta, err := httpgetter.GetHTMLMeta(rawURL)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to fetch metadata").SetInternal(err)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"url":         rawURL,
		"title":       meta.Title,
		"description": meta.Description,
		"image":       meta.Image,
	})
}

// authenticate tries session cookie first, then bearer token.
func (s *Service) authenticate(r *http.Request) (*store.User, error) {
	ctx := r.Context()

	// Session cookie
	if cookie, err := r.Cookie(auth.SessionCookieName); err == nil && cookie.Value != "" {
		if user, err := s.authenticator.AuthenticateBySession(ctx, cookie.Value); err == nil && user != nil {
			return user, nil
		}
	}

	// Bearer token
	accessToken := auth.ExtractBearerToken(r.Header.Get("Authorization"))
	if accessToken != "" {
		if user, err := s.authenticator.AuthenticateByJWT(ctx, accessToken); err == nil && user != nil {
			return user, nil
		}
	}

	return nil, errors.New("no valid auth method")
}
