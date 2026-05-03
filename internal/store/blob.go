package store

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type BlobStore struct {
	basePath string
}

func NewBlobStore(basePath string) *BlobStore {
	return &BlobStore{basePath: basePath}
}

func (s *BlobStore) msgDir(accountID string, localID int64) string {
	return filepath.Join(s.basePath, accountID, "messages", fmt.Sprintf("%d", localID))
}

func (s *BlobStore) ensureDir(dir string) error {
	return os.MkdirAll(dir, 0755)
}

func (s *BlobStore) StoreRaw(ctx context.Context, accountID string, localID int64, data []byte) (string, error) {
	dir := s.msgDir(accountID, localID)
	if err := s.ensureDir(dir); err != nil {
		return "", fmt.Errorf("create message dir: %w", err)
	}
	p := filepath.Join(dir, "raw.eml")
	return p, os.WriteFile(p, data, 0644)
}

func (s *BlobStore) StoreBodyText(ctx context.Context, accountID string, localID int64, data []byte) (string, error) {
	dir := s.msgDir(accountID, localID)
	if err := s.ensureDir(dir); err != nil {
		return "", fmt.Errorf("create message dir: %w", err)
	}
	p := filepath.Join(dir, "body.txt")
	return p, os.WriteFile(p, data, 0644)
}

func (s *BlobStore) StoreBodyHTML(ctx context.Context, accountID string, localID int64, data []byte) (string, error) {
	dir := s.msgDir(accountID, localID)
	if err := s.ensureDir(dir); err != nil {
		return "", fmt.Errorf("create message dir: %w", err)
	}
	p := filepath.Join(dir, "body.html")
	return p, os.WriteFile(p, data, 0644)
}

func (s *BlobStore) StoreAttachment(ctx context.Context, accountID string, localID int64, attID int64, filename string, r io.Reader) (string, error) {
	dir := filepath.Join(s.msgDir(accountID, localID), "attachments")
	if err := s.ensureDir(dir); err != nil {
		return "", fmt.Errorf("create attachments dir: %w", err)
	}
	sanitized := sanitizeFilename(filename)
	if sanitized == "" {
		sanitized = fmt.Sprintf("attachment-%d", attID)
	}
	p := filepath.Join(dir, fmt.Sprintf("%d-%s", attID, sanitized))

	f, err := os.Create(p)
	if err != nil {
		return "", fmt.Errorf("create attachment file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, r); err != nil {
		os.Remove(p)
		return "", fmt.Errorf("write attachment: %w", err)
	}
	return p, nil
}

func (s *BlobStore) Open(path string) (io.ReadCloser, error) {
	absPath := filepath.Join(s.basePath, path)
	return os.Open(absPath)
}

func (s *BlobStore) ReadFile(path string) ([]byte, error) {
	absPath := filepath.Join(s.basePath, path)
	return os.ReadFile(absPath)
}

func (s *BlobStore) ReadBodyText(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (s *BlobStore) ReadBodyHTML(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (s *BlobStore) ReadAttachment(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (s *BlobStore) DeleteMessage(accountID string, localID int64) error {
	return os.RemoveAll(s.msgDir(accountID, localID))
}

func sanitizeFilename(name string) string {
	clean := filepath.Base(name)
	if clean == "." || clean == ".." {
		return ""
	}
	return clean
}
