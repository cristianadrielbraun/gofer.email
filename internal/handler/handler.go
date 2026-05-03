package handler

import (
	"encoding/json"
	"fmt"
	"gofer.email/internal/config"
	"gofer.email/internal/mail/imap"
	smtpclient "gofer.email/internal/mail/smtp"
	"gofer.email/internal/models"
	"gofer.email/internal/storage"
	"gofer.email/internal/views"
	"net/http"
	"os"
	"strconv"
)

type Handler struct {
	db           *storage.DB
	accountStore *config.AccountStore
}

func New(db *storage.DB, accountStore *config.AccountStore) *Handler {
	return &Handler{db: db, accountStore: accountStore}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	setupAssetsRoutes(mux)
	mux.HandleFunc("GET /", h.handleIndex)
	mux.HandleFunc("GET /email/{id}", h.handleEmailPartial)
	mux.HandleFunc("GET /folder/{id}", h.handleFolderPartial)
	mux.HandleFunc("GET /mail/folder/{id}/items", h.handleMailItems)
	mux.HandleFunc("GET /search", h.handleSearch)
	mux.HandleFunc("POST /api/accounts", h.handleCreateAccount)
	mux.HandleFunc("POST /api/accounts/{id}/test", h.handleTestAccount)
}

func setupAssetsRoutes(mux *http.ServeMux) {
	isDevelopment := os.Getenv("GO_ENV") != "production"

	assetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isDevelopment {
			w.Header().Set("Cache-Control", "no-store")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=31536000")
		}
		http.FileServer(http.Dir("./assets")).ServeHTTP(w, r)
	})

	mux.Handle("GET /assets/", http.StripPrefix("/assets/", assetHandler))
}

func (h *Handler) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	folderID := r.URL.Query().Get("folder")
	if folderID == "" {
		folderID = "inbox"
	}

	emailID := r.URL.Query().Get("email")
	ctx := r.Context()

	accounts, _ := h.db.GetAccounts(ctx)
	totalCount, _ := h.db.GetFolderEmailCount(ctx, folderID)

	page, _ := h.db.GetEmailsRange(ctx, folderID, 0, 50)
	var emails []models.Email
	if page != nil {
		emails = page.Emails
	}

	var selectedEmail *models.Email
	if emailID != "" {
		selectedEmail, _ = h.db.GetEmailByID(ctx, emailID)
	}
	if selectedEmail == nil && len(emails) > 0 {
		selectedEmail, _ = h.db.GetEmailByID(ctx, emails[0].ID)
	}

	views.Layout(accounts, folderID, emails, selectedEmail, totalCount).Render(ctx, w)
}

func (h *Handler) handleEmailPartial(w http.ResponseWriter, r *http.Request) {
	emailID := r.PathValue("id")
	if emailID == "" {
		http.NotFound(w, r)
		return
	}

	email, err := h.db.GetEmailByID(r.Context(), emailID)
	if err != nil || email == nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	views.MailViewContent(email).Render(r.Context(), w)
}

func (h *Handler) handleFolderPartial(w http.ResponseWriter, r *http.Request) {
	folderID := r.PathValue("id")
	if folderID == "" {
		folderID = "inbox"
	}

	ctx := r.Context()
	totalCount, _ := h.db.GetFolderEmailCount(ctx, folderID)

	page, _ := h.db.GetEmailsRange(ctx, folderID, 0, 50)
	var emails []models.Email
	if page != nil {
		emails = page.Emails
	}

	var selectedEmail *models.Email
	if len(emails) > 0 {
		selectedEmail, _ = h.db.GetEmailByID(ctx, emails[0].ID)
	}

	w.Header().Set("Content-Type", "text/html")
	views.FolderPartial(emails, folderID, selectedEmail, totalCount).Render(ctx, w)
}

func (h *Handler) handleMailItems(w http.ResponseWriter, r *http.Request) {
	folderID := r.PathValue("id")
	if folderID == "" {
		folderID = "inbox"
	}

	limit := 50
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}

	selectedEmailId := r.URL.Query().Get("selected")
	ctx := r.Context()

	var page *models.EmailPage

	if around := r.URL.Query().Get("around"); around != "" {
		page, _ = h.db.GetEmailsAroundEmail(ctx, folderID, around, limit)
	} else if startStr := r.URL.Query().Get("start"); startStr != "" {
		start, err := strconv.Atoi(startStr)
		if err != nil || start < 0 {
			start = 0
		}
		page, _ = h.db.GetEmailsRange(ctx, folderID, start, limit)
	} else if cursor := r.URL.Query().Get("after"); cursor != "" {
		page, _ = h.db.GetEmailsAfterCursor(ctx, folderID, cursor, limit)
	} else {
		page, _ = h.db.GetEmailsRange(ctx, folderID, 0, limit)
	}

	if page == nil {
		page = &models.EmailPage{}
	}

	w.Header().Set("Content-Type", "text/html")
	views.MailListItemsFragment(
		page.Emails, folderID,
		page.WindowStart, page.WindowEnd, page.TotalCount,
		page.NextCursor, page.HasMore,
		selectedEmailId,
	).Render(ctx, w)
}

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		w.Header().Set("Content-Type", "text/html")
		views.MailListEmails(nil, "", nil, 0).Render(r.Context(), w)
		return
	}

	emails, err := h.db.SearchMessages(r.Context(), q, 50)
	if err != nil {
		http.Error(w, "search failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	views.MailListEmails(emails, "", nil, len(emails)).Render(r.Context(), w)
}

func (h *Handler) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	var req models.CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.EmailAddress == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email_address is required"})
		return
	}
	if req.IMAPHost == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "imap_host is required"})
		return
	}
	if req.SMTPHost == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "smtp_host is required"})
		return
	}
	if req.Username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username is required"})
		return
	}
	if req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password is required"})
		return
	}

	account, err := h.accountStore.CreateAccount(r.Context(), &req)
	if err != nil {
		http.Error(w, fmt.Sprintf("create account: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, account)
}

func (h *Handler) handleTestAccount(w http.ResponseWriter, r *http.Request) {
	accountID := r.PathValue("id")
	if accountID == "" {
		http.Error(w, "account id required", http.StatusBadRequest)
		return
	}

	cfg, err := h.accountStore.GetConfig(r.Context(), accountID)
	if err != nil {
		http.Error(w, fmt.Sprintf("get config: %v", err), http.StatusNotFound)
		return
	}

	password, err := h.accountStore.DecryptPassword(r.Context(), accountID)
	if err != nil {
		http.Error(w, fmt.Sprintf("decrypt password: %v", err), http.StatusInternalServerError)
		return
	}

	results := []models.ConnectionTestResult{}

	imapErr := imap.TestConnection(r.Context(), cfg, password)
	imapResult := models.ConnectionTestResult{
		Service: "imap",
		Message: fmt.Sprintf("%s:%d (%s)", cfg.IMAPHost, cfg.IMAPPort, cfg.IMAPTLSMode),
	}
	if imapErr != nil {
		imapResult.Success = false
		imapResult.Error = imapErr.Error()
	} else {
		imapResult.Success = true
		imapResult.Message = "Connection successful"
	}
	results = append(results, imapResult)

	smtpErr := smtpclient.TestConnection(r.Context(), cfg, password)
	smtpResult := models.ConnectionTestResult{
		Service: "smtp",
		Message: fmt.Sprintf("%s:%d (%s)", cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPTLSMode),
	}
	if smtpErr != nil {
		smtpResult.Success = false
		smtpResult.Error = smtpErr.Error()
	} else {
		smtpResult.Success = true
		smtpResult.Message = "Connection successful"
	}
	results = append(results, smtpResult)

	writeJSON(w, http.StatusOK, results)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
