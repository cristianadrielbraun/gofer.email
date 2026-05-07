package imap

import (
	"context"
	"fmt"

	"github.com/emersion/go-imap/v2"
)

func (c *Client) StoreFlags(ctx context.Context, folderRemoteName string, uid uint32, op imap.StoreFlagsOp, flags []imap.Flag) error {
	return c.StoreFlagsBatch(ctx, folderRemoteName, []uint32{uid}, op, flags)
}

func (c *Client) StoreFlagsBatch(ctx context.Context, folderRemoteName string, uids []uint32, op imap.StoreFlagsOp, flags []imap.Flag) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(uids) == 0 {
		return nil
	}
	if c.closed {
		return fmt.Errorf("client is closed")
	}

	_, err := c.client.Select(folderRemoteName, nil).Wait()
	if err != nil {
		return fmt.Errorf("select %s: %w", folderRemoteName, err)
	}
	defer c.client.Unselect()

	var uidSet imap.UIDSet
	for _, uid := range uids {
		uidSet.AddNum(imap.UID(uid))
	}

	storeCmd := c.client.Store(uidSet, &imap.StoreFlags{
		Op:     op,
		Silent: true,
		Flags:  flags,
	}, nil)

	return storeCmd.Close()
}

func (c *Client) MoveMessage(ctx context.Context, folderRemoteName string, uid uint32, destFolderRemoteName string) error {
	return c.MoveMessages(ctx, folderRemoteName, []uint32{uid}, destFolderRemoteName)
}

func (c *Client) MoveMessages(ctx context.Context, folderRemoteName string, uids []uint32, destFolderRemoteName string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(uids) == 0 {
		return nil
	}
	if c.closed {
		return fmt.Errorf("client is closed")
	}

	_, err := c.client.Select(folderRemoteName, nil).Wait()
	if err != nil {
		return fmt.Errorf("select %s: %w", folderRemoteName, err)
	}
	defer c.client.Unselect()

	var uidSet imap.UIDSet
	for _, uid := range uids {
		uidSet.AddNum(imap.UID(uid))
	}

	moveCmd := c.client.Move(uidSet, destFolderRemoteName)
	_, err = moveCmd.Wait()
	return err
}

func (c *Client) DeleteMessages(ctx context.Context, folderRemoteName string, uids []uint32) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	_, err := c.client.Select(folderRemoteName, nil).Wait()
	if err != nil {
		return fmt.Errorf("select %s: %w", folderRemoteName, err)
	}
	defer c.client.Unselect()

	var uidSet imap.UIDSet
	for _, uid := range uids {
		uidSet.AddNum(imap.UID(uid))
	}

	storeCmd := c.client.Store(uidSet, &imap.StoreFlags{
		Op:     imap.StoreFlagsAdd,
		Silent: true,
		Flags:  []imap.Flag{imap.FlagDeleted},
	}, nil)
	if err := storeCmd.Close(); err != nil {
		return fmt.Errorf("store deleted: %w", err)
	}

	expungeCmd := c.client.UIDExpunge(uidSet)
	_, err = expungeCmd.Collect()
	return err
}
