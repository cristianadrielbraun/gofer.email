package auth

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"golang.org/x/oauth2"
)

func (m *Manager) GetOAuthTokenForAccount(ctx context.Context, accountID string) (string, error) {
	var accessToken, refreshToken, tokenType string
	var expiresAt sql.NullTime
	var scopes string

	err := m.db.Read().QueryRowContext(ctx,
		`SELECT access_token, refresh_token, token_type, expires_at, scopes
		 FROM oauth_accounts WHERE user_id = (SELECT user_id FROM accounts WHERE id = ?) AND provider = 'google'`,
		accountID,
	).Scan(&accessToken, &refreshToken, &tokenType, &expiresAt, &scopes)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no oauth token found for account %s", accountID)
	}
	if err != nil {
		return "", fmt.Errorf("query oauth token: %w", err)
	}

	if accessToken != "" && expiresAt.Valid && expiresAt.Time.After(time.Now().Add(5*time.Minute)) {
		return accessToken, nil
	}

	if refreshToken == "" {
		return "", fmt.Errorf("no refresh token available for account %s", accountID)
	}

	return m.refreshToken(ctx, refreshToken)
}

func (m *Manager) refreshToken(ctx context.Context, refreshToken string) (string, error) {
	if m.config.GoogleClient == nil {
		return "", fmt.Errorf("google oauth not configured")
	}

	ts := m.config.GoogleClient.TokenSource(ctx, &oauth2.Token{
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
	})

	token, err := ts.Token()
	if err != nil {
		return "", fmt.Errorf("refresh token: %w", err)
	}

	return token.AccessToken, nil
}
