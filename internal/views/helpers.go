package views

import (
	"encoding/json"
	"fmt"
	"gofer.email/internal/models"

	"github.com/a-h/templ"
)

func folderDisplayName(folderID string) string {
	names := map[string]string{
		"inbox":   "Inbox",
		"starred": "Starred",
		"sent":    "Sent",
		"drafts":  "Drafts",
		"archive": "Archive",
		"spam":    "Spam",
		"trash":   "Trash",
	}
	if name, ok := names[folderID]; ok {
		return name
	}
	return "Inbox"
}

func composeDefaultAccountID(accounts []models.Account) string {
	if len(accounts) > 0 {
		return accounts[0].ID
	}
	return ""
}

func composeDefaultEmail(accounts []models.Account) string {
	if len(accounts) > 0 {
		return accounts[0].Email
	}
	return ""
}

func composeDefaultName(accounts []models.Account) string {
	if len(accounts) > 0 {
		return accounts[0].Name
	}
	return ""
}

func uiSettingsJSON(settings map[string]string) string {
	b, _ := json.Marshal(settings)
	return string(b)
}

func uiSettingGet(settings map[string]string, key, fallback string) string {
	if v, ok := settings[key]; ok && v != "" {
		return v
	}
	return fallback
}

func accountHasActiveFolder(account models.Account, activeFolder string) bool {
	for _, folder := range account.Folders {
		if folderHasActiveID(folder, activeFolder) {
			return true
		}
	}
	return false
}

func folderHasActiveID(folder models.Folder, activeFolder string) bool {
	if folder.ID == activeFolder {
		return true
	}
	for _, child := range folder.Children {
		if folderHasActiveID(child, activeFolder) {
			return true
		}
	}
	return false
}

func unifiedHasActiveFolder(activeFolder string) bool {
	switch activeFolder {
	case "inbox", "starred", "sent", "drafts", "archive", "spam", "trash":
		return true
	default:
		return false
	}
}

func unifiedFolders(accounts []models.Account) []models.Folder {
	roles := []struct {
		id   string
		name string
		icon string
	}{
		{"inbox", "Inbox", "inbox"},
		{"starred", "Starred", "starred"},
		{"sent", "Sent", "send"},
		{"drafts", "Drafts", "file"},
		{"archive", "Archive", "archive"},
		{"spam", "Spam", "alert-circle"},
		{"trash", "Trash", "trash"},
	}

	unreadByRole := make(map[string]int)
	seenRole := make(map[string]bool)
	for _, account := range accounts {
		collectUnifiedFolders(account.Folders, unreadByRole, seenRole)
	}

	folders := make([]models.Folder, 0, len(roles))
	for _, role := range roles {
		if role.id != "starred" && !seenRole[role.id] {
			continue
		}
		folders = append(folders, models.Folder{
			ID:       role.id,
			Name:     role.name,
			Icon:     role.icon,
			Role:     role.id,
			Unread:   unreadByRole[role.id],
			IsSystem: true,
		})
	}
	return folders
}

func collectUnifiedFolders(folders []models.Folder, unreadByRole map[string]int, seenRole map[string]bool) {
	for _, folder := range folders {
		if folder.Role != "" && folder.Role != "custom" {
			seenRole[folder.Role] = true
			unreadByRole[folder.Role] += folder.Unread
		}
		collectUnifiedFolders(folder.Children, unreadByRole, seenRole)
	}
}

func themeClass(settings map[string]string) string {
	if uiSettingGet(settings, "theme", "dark") == "dark" {
		return "dark"
	}
	return ""
}

func themeStyle(settings map[string]string) string {
	return uiSettingGet(settings, "theme_style", "classic")
}

func senderDisplay(contact models.Contact, mode string) string {
	switch mode {
	case "email":
		if contact.Email != "" {
			return contact.Email
		}
		return contact.Name
	case "both":
		if contact.Name == "" || contact.Email == "" || contact.Name == contact.Email {
			if contact.Name != "" {
				return contact.Name
			}
			return contact.Email
		}
		return fmt.Sprintf("%s <%s>", contact.Name, contact.Email)
	default:
		if contact.Name != "" {
			return contact.Name
		}
		return contact.Email
	}
}

func senderDisplaySettingLabel(mode string) string {
	switch mode {
	case "email":
		return "Only email"
	case "both":
		return "Name and email"
	default:
		return "Only name"
	}
}

func mailListViewMode(mode string) string {
	if mode == "table" {
		return "table"
	}
	return "cards"
}

func mailListViewIndicatorStyle(mode string) string {
	if mailListViewMode(mode) == "table" {
		return "transform: translateX(100%);"
	}
	return "transform: translateX(0);"
}

func autoMarkReadSettingLabel(value string) string {
	switch value {
	case "0":
		return "Immediately"
	case "5":
		return "After 5 seconds"
	case "10":
		return "After 10 seconds"
	case "2":
		return "After 2 seconds"
	case "never":
		return "Never"
	default:
		return "Immediately"
	}
}

func accountColorStyle(color string) string {
	if color == "" {
		color = "#8b5cf6"
	}
	return "background-color: " + color
}

func sidebarFolderHref(folderID, accountID string) templ.SafeURL {
	if accountID == "" {
		return templ.URL(fmt.Sprintf("/?folder=%s", folderID))
	}
	return templ.URL(fmt.Sprintf("/?folder=%s&account=%s", folderID, accountID))
}
