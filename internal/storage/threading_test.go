package storage

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func newThreadingTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := New(filepath.Join(t.TempDir(), "gofer.db"))
	if err != nil {
		t.Fatalf("New DB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	ctx := context.Background()
	_, err = db.Write().ExecContext(ctx, `INSERT INTO accounts (id, email_address, display_name) VALUES ('acc', 'me@example.com', 'Me')`)
	if err != nil {
		t.Fatalf("insert account: %v", err)
	}
	_, err = db.Write().ExecContext(ctx, `INSERT INTO folders (id, account_id, remote_id, name) VALUES ('inbox', 'acc', 'INBOX', 'Inbox')`)
	if err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	_, err = db.Write().ExecContext(ctx, `INSERT INTO folders (id, account_id, remote_id, name, role) VALUES ('sent', 'acc', 'Sent', 'Sent', 'sent')`)
	if err != nil {
		t.Fatalf("insert sent folder: %v", err)
	}
	return db
}

func TestThreadingUsesReferencesBeforeSubject(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 1, MessageID: "<a@example.com>", Subject: "Project", FromEmail: "alice@example.com", DateSent: now, Snippet: "root", ToRecipients: []Recipient{{Email: "me@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 2, MessageID: "<b@example.com>", InReplyTo: "<a@example.com>", References: "<a@example.com>", Subject: "Re: Project", FromEmail: "me@example.com", DateSent: now.Add(time.Minute), Snippet: "reply", ToRecipients: []Recipient{{Email: "alice@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 3, MessageID: "<c@example.com>", Subject: "Project", FromEmail: "alice@example.com", DateSent: now.Add(2 * time.Minute), Snippet: "unrelated", ToRecipients: []Recipient{{Email: "me@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	a, _ := db.GetEmailByID(ctx, "1")
	b, _ := db.GetEmailByID(ctx, "2")
	c, _ := db.GetEmailByID(ctx, "3")
	if a.ThreadID == "" || b.ThreadID == "" || c.ThreadID == "" {
		t.Fatalf("expected all messages to have thread ids: %#v %#v %#v", a, b, c)
	}
	if a.ThreadID != b.ThreadID {
		t.Fatalf("referenced reply should share root thread: %q != %q", a.ThreadID, b.ThreadID)
	}
	if c.ThreadID == a.ThreadID {
		t.Fatalf("same-subject non-reply should not be merged into thread")
	}
	thread, err := db.GetThreadMessages(ctx, "acc", a.ThreadID)
	if err != nil {
		t.Fatalf("GetThreadMessages: %v", err)
	}
	if len(thread) != 2 {
		t.Fatalf("thread len = %d, want 2", len(thread))
	}
}

func TestThreadingDoesNotFallbackMergeReplySubjects(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 1, MessageID: "<old@example.com>", Subject: "Testing a thread email", FromEmail: "old@example.com", DateSent: now.AddDate(0, 0, -3), Snippet: "old", ToRecipients: []Recipient{{Email: "me@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 2, MessageID: "<reply@example.com>", Subject: "Re: Testing a thread email", FromEmail: "other@example.com", DateSent: now, Snippet: "reply", ToRecipients: []Recipient{{Email: "me@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	oldMsg, _ := db.GetEmailByID(ctx, "1")
	reply, _ := db.GetEmailByID(ctx, "2")
	if oldMsg.ThreadID == "" || reply.ThreadID == "" {
		t.Fatalf("expected thread ids")
	}
	if oldMsg.ThreadID == reply.ThreadID {
		t.Fatalf("orphan reply subject must not merge with unrelated message sharing only account recipient")
	}
}

func TestThreadingSubjectFallbackIgnoresAccountRecipientOnlyOverlap(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 1, MessageID: "<root@example.com>", Subject: "Project", FromEmail: "alice@example.com", DateSent: now, Snippet: "root", ToRecipients: []Recipient{{Email: "me@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 2, MessageID: "<reply@example.com>", Subject: "Re: Project", FromEmail: "bob@example.com", DateSent: now.Add(time.Minute), Snippet: "reply", ToRecipients: []Recipient{{Email: "me@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	root, _ := db.GetEmailByID(ctx, "1")
	reply, _ := db.GetEmailByID(ctx, "2")
	if root.ThreadID == reply.ThreadID {
		t.Fatalf("shared account recipient alone must not satisfy subject fallback")
	}
}

func TestThreadingSubjectFallbackStillMatchesCorrespondent(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 1, MessageID: "<root@example.com>", Subject: "Project", FromEmail: "alice@example.com", DateSent: now, Snippet: "root", ToRecipients: []Recipient{{Email: "me@example.com"}}},
		{AccountID: "acc", FolderID: "sent", MessageID: "<reply@example.com>", Subject: "Re: Project", FromEmail: "me@example.com", DateSent: now.Add(time.Minute), Snippet: "reply", ToRecipients: []Recipient{{Email: "alice@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	root, _ := db.GetEmailByID(ctx, "1")
	reply, _ := db.GetEmailByID(ctx, "2")
	if root.ThreadID != reply.ThreadID {
		t.Fatalf("subject fallback should match same correspondent: root=%q reply=%q", root.ThreadID, reply.ThreadID)
	}
}

func TestThreadingMergesWhenMissingParentArrives(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	if err := db.UpsertSyncMessages(ctx, []SyncMessage{{
		AccountID: "acc", FolderID: "inbox", RemoteUID: 10, MessageID: "<child@example.com>", References: "<parent@example.com>", Subject: "Re: Delayed", FromEmail: "bob@example.com", DateSent: now.Add(time.Minute), Snippet: "child",
	}}); err != nil {
		t.Fatalf("insert child: %v", err)
	}
	childBefore, _ := db.GetEmailByID(ctx, "1")

	if err := db.UpsertSyncMessages(ctx, []SyncMessage{{
		AccountID: "acc", FolderID: "inbox", RemoteUID: 11, MessageID: "<parent@example.com>", Subject: "Delayed", FromEmail: "alice@example.com", DateSent: now, Snippet: "parent",
	}}); err != nil {
		t.Fatalf("insert parent: %v", err)
	}
	childAfter, _ := db.GetEmailByID(ctx, "1")
	parent, _ := db.GetEmailByID(ctx, "2")
	if childBefore.ThreadID == "" || childAfter.ThreadID == "" || parent.ThreadID == "" {
		t.Fatalf("expected thread ids")
	}
	if childAfter.ThreadID != parent.ThreadID {
		t.Fatalf("missing parent arrival should merge child thread: child=%q parent=%q", childAfter.ThreadID, parent.ThreadID)
	}
}

func TestThreadingResolvedParentDoesNotMoveWholeChildThread(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	if err := db.UpsertSyncMessages(ctx, []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 10, MessageID: "<child@example.com>", References: "<parent@example.com>", Subject: "Re: Delayed", FromEmail: "bob@example.com", DateSent: now.Add(time.Minute), Snippet: "child"},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 11, MessageID: "<unrelated@example.com>", Subject: "Completely unrelated", FromEmail: "carol@example.com", DateSent: now.Add(2 * time.Minute), Snippet: "unrelated"},
	}); err != nil {
		t.Fatalf("insert initial messages: %v", err)
	}

	childBefore, _ := db.GetEmailByID(ctx, "1")
	unrelatedBefore, _ := db.GetEmailByID(ctx, "2")
	if childBefore.ThreadID == "" || unrelatedBefore.ThreadID == "" {
		t.Fatalf("expected thread ids")
	}
	_, err := db.Write().ExecContext(ctx, `UPDATE messages SET thread_id = ? WHERE id = 2`, childBefore.ThreadID)
	if err != nil {
		t.Fatalf("force old bad child thread: %v", err)
	}

	if err := db.UpsertSyncMessages(ctx, []SyncMessage{{
		AccountID: "acc", FolderID: "inbox", RemoteUID: 12, MessageID: "<parent@example.com>", Subject: "Delayed", FromEmail: "alice@example.com", DateSent: now, Snippet: "parent",
	}}); err != nil {
		t.Fatalf("insert parent: %v", err)
	}

	childAfter, _ := db.GetEmailByID(ctx, "1")
	unrelatedAfter, _ := db.GetEmailByID(ctx, "2")
	parent, _ := db.GetEmailByID(ctx, "3")
	if childAfter.ThreadID != parent.ThreadID {
		t.Fatalf("child should move to parent thread: child=%q parent=%q", childAfter.ThreadID, parent.ThreadID)
	}
	if unrelatedAfter.ThreadID == parent.ThreadID {
		t.Fatalf("unrelated message was dragged into resolved parent thread")
	}
}

func TestThreadingIgnoresSelfReference(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	if err := db.UpsertSyncMessages(ctx, []SyncMessage{{
		AccountID: "acc", FolderID: "inbox", RemoteUID: 30, MessageID: "<self@example.com>", InReplyTo: "<self@example.com>", References: "<self@example.com>", Subject: "Self", FromEmail: "alice@example.com", DateSent: now, Snippet: "self",
	}}); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}
	email, _ := db.GetEmailByID(ctx, "1")
	if email == nil || email.ThreadID == "" {
		t.Fatalf("expected a thread id")
	}
	if email.ThreadCount != 1 {
		t.Fatalf("self-reference should not create multi-message thread, count=%d", email.ThreadCount)
	}
}

func TestThreadingSkipsMismatchedAncestorReference(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 1, MessageID: "<top@example.com>", Subject: "Top referrer breakdown", FromEmail: "reporting@example.com", DateSent: now.AddDate(0, 0, -3), Snippet: "report", ToRecipients: []Recipient{{Email: "me@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 2, MessageID: "<reply@example.com>", InReplyTo: "<missing@gofer>", References: "<top@example.com> <missing@gofer>", Subject: "Re: Testing a thread email", FromEmail: "other@example.com", DateSent: now, Snippet: "reply", ToRecipients: []Recipient{{Email: "me@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	top, _ := db.GetEmailByID(ctx, "1")
	reply, _ := db.GetEmailByID(ctx, "2")
	if top.ThreadID == reply.ThreadID {
		t.Fatalf("mismatched older reference should not thread unrelated messages")
	}
}

func TestThreadingLinksInboxReplyToSentParent(t *testing.T) {
	db := newThreadingTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	msgs := []SyncMessage{
		{AccountID: "acc", FolderID: "sent", MessageID: "<sent@example.com>", Subject: "Testing a thread email", FromEmail: "me@example.com", DateSent: now, Snippet: "testing body", IsRead: true, ToRecipients: []Recipient{{Email: "dest@example.com"}}},
		{AccountID: "acc", FolderID: "inbox", RemoteUID: 20, MessageID: "<reply@example.com>", InReplyTo: "<sent@example.com>", References: "<sent@example.com>", Subject: "Re: Testing a thread email", FromEmail: "dest@example.com", DateSent: now.Add(time.Minute), Snippet: "Now we respond", ToRecipients: []Recipient{{Email: "me@example.com"}}},
	}
	if err := db.UpsertSyncMessages(ctx, msgs); err != nil {
		t.Fatalf("UpsertSyncMessages: %v", err)
	}

	sent, _ := db.GetEmailByID(ctx, "1")
	reply, _ := db.GetEmailByID(ctx, "2")
	if sent.ThreadID == "" || reply.ThreadID == "" {
		t.Fatalf("expected thread ids")
	}
	if sent.ThreadID != reply.ThreadID {
		t.Fatalf("reply should thread with sent parent: sent=%q reply=%q", sent.ThreadID, reply.ThreadID)
	}
}
