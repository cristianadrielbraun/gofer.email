package mail

import (
	"context"
	"log"
	"sync"

	"gofer.email/internal/config"
	"gofer.email/internal/mail/imap"
	"gofer.email/internal/storage"
	"gofer.email/internal/store"
)

type SyncOrchestrator struct {
	db           *storage.DB
	accountStore *config.AccountStore
	blobStore    *store.BlobStore
	events       *EventBus
	mu           sync.Mutex
	running      map[string]bool
	idleWatchers map[string]*imap.IdleWatcher
}

func NewSyncOrchestrator(db *storage.DB, accountStore *config.AccountStore, blobStore *store.BlobStore) *SyncOrchestrator {
	return &SyncOrchestrator{
		db:           db,
		accountStore: accountStore,
		blobStore:    blobStore,
		events:       NewEventBus(),
		running:      make(map[string]bool),
		idleWatchers: make(map[string]*imap.IdleWatcher),
	}
}

func (o *SyncOrchestrator) BlobStore() *store.BlobStore {
	return o.blobStore
}

func (o *SyncOrchestrator) Events() *EventBus {
	return o.events
}

func (o *SyncOrchestrator) Start(ctx context.Context) {
	accounts, err := o.db.GetAccountIDs(ctx)
	if err != nil {
		log.Printf("sync start: get accounts: %v", err)
		return
	}

	for _, accountID := range accounts {
		o.startAccount(ctx, accountID)
	}
}

func (o *SyncOrchestrator) startAccount(ctx context.Context, accountID string) {
	if err := o.syncAccount(ctx, accountID); err != nil {
		log.Printf("sync account %s: %v", accountID, err)
	}

	cfg, err := o.accountStore.GetConfig(ctx, accountID)
	if err != nil {
		log.Printf("sync idle %s: get config: %v", accountID, err)
		return
	}

	password, err := o.accountStore.DecryptPassword(ctx, accountID)
	if err != nil {
		log.Printf("sync idle %s: decrypt: %v", accountID, err)
		return
	}

	folderID, remoteName, err := o.db.GetFolderIDByRole(ctx, accountID, "inbox")
	if err != nil {
		log.Printf("sync idle %s: find inbox: %v", accountID, err)
		return
	}
	if folderID == "" {
		log.Printf("sync idle %s: no inbox folder found", accountID)
		return
	}

	watcher := imap.NewIdleWatcher(cfg, password, remoteName, func() {
		o.syncIncremental(ctx, accountID, folderID, remoteName)
	})

	o.mu.Lock()
	o.idleWatchers[accountID] = watcher
	o.mu.Unlock()

	go watcher.Run(ctx)
}

func (o *SyncOrchestrator) SyncAccount(ctx context.Context, accountID string) {
	o.mu.Lock()
	if o.running[accountID] {
		o.mu.Unlock()
		return
	}
	o.running[accountID] = true
	o.mu.Unlock()

	go func() {
		defer func() {
			o.mu.Lock()
			delete(o.running, accountID)
			o.mu.Unlock()
		}()

		if err := o.syncAccount(ctx, accountID); err != nil {
			log.Printf("sync account %s: %v", accountID, err)
		}
	}()
}

func (o *SyncOrchestrator) syncAccount(ctx context.Context, accountID string) error {
	cfg, err := o.accountStore.GetConfig(ctx, accountID)
	if err != nil {
		return err
	}

	password, err := o.accountStore.DecryptPassword(ctx, accountID)
	if err != nil {
		return err
	}

	client, err := imap.NewClient(ctx, cfg, password)
	if err != nil {
		return err
	}
	defer client.Close()

	folders, err := client.ListFolders(ctx)
	if err != nil {
		return err
	}

	var folderInputs []storage.UpsertFolderInput
	sortOrder := map[string]int{"inbox": 0, "starred": 1, "sent": 2, "drafts": 3, "archive": 4, "junk": 5, "trash": 6}

	for i, f := range folders {
		role := f.Role
		order, ok := sortOrder[role]
		if !ok {
			order = 100 + i
		}

		parentID := ""
		if f.Delimiter != 0 && containsDelimiter(f.Name, f.Delimiter) {
			parts := splitDelimiter(f.Name, f.Delimiter)
			parentID = folderIDFromRemote(accountID, parts[0])
		}

		folderInputs = append(folderInputs, storage.UpsertFolderInput{
			ID:        folderIDFromRemote(accountID, f.Name),
			AccountID: accountID,
			ParentID:  parentID,
			RemoteID:  f.Name,
			Name:      displayName(f.Name, role),
			Icon:      imap.RoleIcon(role),
			Role:      role,
			SortOrder: order,
		})
	}

	if len(folderInputs) > 0 {
		if err := o.db.UpsertFolders(ctx, folderInputs); err != nil {
			log.Printf("sync folders for %s: %v", accountID, err)
		}
	}

	for _, f := range folders {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		folderDBID := folderIDFromRemote(accountID, f.Name)
		o.syncFolderMessages(ctx, client, accountID, folderDBID, f.Name)
	}

	return nil
}

func (o *SyncOrchestrator) syncFolderMessages(ctx context.Context, client *imap.Client, accountID, folderID, remoteName string) {
	result, err := client.SyncFolder(ctx, folderID, remoteName, 500, func(msgs []storage.SyncMessage) error {
		return o.db.UpsertSyncMessages(ctx, msgs)
	})
	if err != nil {
		log.Printf("sync messages %s/%s: %v", accountID, remoteName, err)
		o.db.Write().ExecContext(ctx,
			`UPDATE folders SET sync_error = ? WHERE id = ?`, err.Error(), folderID)
		return
	}

	if result != nil {
		o.db.UpdateFolderSyncState(ctx, folderID, result.HighestUID, result.UIDValidity, int(result.NumMessages))
	}
	o.db.RefreshFolderUnreadCount(ctx, folderID)
	log.Printf("synced %s/%s: %d messages", accountID, remoteName, result.TotalFetched)
}

func (o *SyncOrchestrator) syncIncremental(ctx context.Context, accountID, folderID, remoteName string) {
	highestUID, err := o.db.GetHighestSeenUID(ctx, folderID)
	if err != nil {
		log.Printf("incremental %s/%s: get uid: %v", accountID, remoteName, err)
		return
	}

	cfg, err := o.accountStore.GetConfig(ctx, accountID)
	if err != nil {
		log.Printf("incremental %s/%s: config: %v", accountID, remoteName, err)
		return
	}

	password, err := o.accountStore.DecryptPassword(ctx, accountID)
	if err != nil {
		log.Printf("incremental %s/%s: password: %v", accountID, remoteName, err)
		return
	}

	client, err := imap.NewClient(ctx, cfg, password)
	if err != nil {
		log.Printf("incremental %s/%s: connect: %v", accountID, remoteName, err)
		return
	}
	defer client.Close()

	result, err := client.SyncFolderIncremental(ctx, folderID, remoteName, highestUID, func(msgs []storage.SyncMessage) error {
		return o.db.UpsertSyncMessages(ctx, msgs)
	})
	if err != nil {
		log.Printf("incremental %s/%s: %v", accountID, remoteName, err)
		return
	}

	if result.TotalFetched > 0 {
		log.Printf("incremental %s/%s: %d new messages", accountID, remoteName, result.TotalFetched)
	}

	if result != nil {
		o.db.UpdateFolderIncrementalSync(ctx, folderID, result.HighestUID, result.UIDValidity, int(result.NumMessages))
	}

	unread, _ := o.db.RefreshFolderUnreadCount(ctx, folderID)

	o.events.Publish(Event{
		Type:      EventNewMail,
		AccountID: accountID,
		FolderID:  folderID,
	})
	_ = unread
}

func folderIDFromRemote(accountID, remoteName string) string {
	return accountID + "_" + sanitizeRemote(remoteName)
}

func sanitizeRemote(name string) string {
	result := make([]rune, 0, len(name))
	for _, r := range name {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			result = append(result, r)
		} else if r >= 'A' && r <= 'Z' {
			result = append(result, r+32)
		} else {
			result = append(result, '_')
		}
	}
	return string(result)
}

func containsDelimiter(name string, delim rune) bool {
	for _, r := range name {
		if r == delim {
			return true
		}
	}
	return false
}

func splitDelimiter(name string, delim rune) []string {
	for i, r := range name {
		if r == delim {
			return []string{name[:i], name[i+1:]}
		}
	}
	return []string{name}
}

func displayName(remoteName, role string) string {
	if role != "custom" {
		switch role {
		case "inbox":
			return "Inbox"
		case "sent":
			return "Sent"
		case "drafts":
			return "Drafts"
		case "trash":
			return "Trash"
		case "junk":
			return "Spam"
		case "archive":
			return "Archive"
		case "starred":
			return "Starred"
		}
	}
	return remoteName
}
