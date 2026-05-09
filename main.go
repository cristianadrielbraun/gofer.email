package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"gofer.email/internal/auth"
	"gofer.email/internal/config"
	"gofer.email/internal/handler"
	"gofer.email/internal/mail"
	"gofer.email/internal/storage"
	"gofer.email/internal/store"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	dbPath := os.Getenv("GOFER_DB_PATH")
	if dbPath == "" {
		dbPath = "data/gofer.db"
	}

	dataDir := filepath.Dir(dbPath)

	db, err := storage.New(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	secretKey := loadOrGenerateSecretKey(filepath.Join(dataDir, "secret.key"))

	accountStore, err := config.NewAccountStore(db, secretKey)
	if err != nil {
		log.Fatalf("failed to create account store: %v", err)
	}

	blobStore := store.NewBlobStore(filepath.Join(dataDir, "accounts"))

	authConfig := auth.LoadConfig()
	authManager := auth.NewManager(authConfig, db)

	if err := authManager.EnsureDefaultUser(); err != nil {
		log.Fatalf("failed to ensure default user: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if authManager.IsEnabled() {
		authManager.StartSessionCleanup(ctx)
	}

	syncer := mail.NewSyncOrchestrator(db, accountStore, blobStore, authManager)
	go syncer.Start(ctx)

	mux := http.NewServeMux()
	h := handler.New(db, accountStore, syncer, blobStore, authManager)
	h.RegisterRoutes(mux)

	var handler http.Handler = mux
	handler = authManager.Middleware(handler)

	addr := ":8090"
	fmt.Printf("gofer.email running on http://localhost%s\n", addr)
	fmt.Printf("database: %s\n", db.Path())
	if authConfig.Enabled {
		fmt.Printf("auth: enabled (Google OAuth2)\n")
	} else {
		fmt.Printf("auth: disabled (local mode)\n")
	}
	log.Fatal(http.ListenAndServe(addr, handler))
}

func loadOrGenerateSecretKey(path string) []byte {
	if envKey := os.Getenv("GOFER_SECRET_KEY"); envKey != "" {
		key, err := hex.DecodeString(envKey)
		if err != nil || len(key) != 32 {
			log.Fatalf("invalid GOFER_SECRET_KEY: must be 64 hex characters (32 bytes)")
		}
		return key
	}

	data, err := os.ReadFile(path)
	if err == nil && len(data) == 32 {
		return data
	}

	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatalf("generate secret key: %v", err)
	}

	os.MkdirAll(filepath.Dir(path), 0755)
	if err := os.WriteFile(path, key, 0600); err != nil {
		log.Fatalf("write secret key: %v", err)
	}

	log.Printf("generated new secret key at %s", path)
	return key
}
