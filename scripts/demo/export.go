// This command is copied into a temporary Gofer snapshot by build.py.
// It never runs in, or changes, the application's checkout.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/a-h/templ"
	"github.com/cristianadrielbraun/gofer/internal/models"
	"github.com/cristianadrielbraun/gofer/internal/views"
	"golang.org/x/net/html"
)

type demo struct {
	Revision      string                       `json:"revision"`
	ResponsiveCSS string                       `json:"responsiveCSS"`
	Date          string                       `json:"date"`
	Shells        map[string]string            `json:"shells"`
	Lists         map[string]string            `json:"lists"`
	Messages      map[string]string            `json:"messages"`
	Bodies        map[string]string            `json:"bodies"`
	MailIndex     map[string]map[string]string `json:"mailIndex"`
	Contacts      map[string]string            `json:"contacts"`
	Activities    map[string]string            `json:"activities"`
	Calendars     map[string]string            `json:"calendars"`
	Events        map[string]string            `json:"events"`
	Threads       map[string]string            `json:"threads"`
	Compose       map[string]string            `json:"compose"`
}

// Keep the real markup and classes, but omit executable template scripts and
// turn server request attributes into inert metadata for the website runtime.
func fragment(component templ.Component, shell bool) string {
	var source bytes.Buffer
	if err := component.Render(context.Background(), &source); err != nil {
		panic(err)
	}
	doc, err := html.Parse(&source)
	if err != nil {
		panic(err)
	}
	var found *html.Node
	var clean func(*html.Node)
	clean = func(node *html.Node) {
		attrs := node.Attr[:0]
		for _, attr := range node.Attr {
			if attr.Key == "id" && attr.Val == "app-shell" {
				found = node
			}
			if strings.HasPrefix(attr.Key, "on") {
				// Retain an inert signal for controls whose app behavior is inline.
				if attr.Key == "onclick" {
					attrs = append(attrs, html.Attribute{Key: "data-demo-inline-action", Val: attr.Val})
				}
				continue
			}
			if strings.HasPrefix(attr.Key, "hx-") {
				attr.Key = "data-demo-" + attr.Key
			}
			if attr.Key == "src" && strings.HasPrefix(attr.Val, "/assets/") {
				attr.Val = "/demo" + attr.Val
			}
			attrs = append(attrs, attr)
		}
		node.Attr = attrs
		for child := node.FirstChild; child != nil; {
			next := child.NextSibling
			if child.Type == html.ElementNode && child.Data == "script" {
				node.RemoveChild(child)
			} else {
				clean(child)
			}
			child = next
		}
	}
	clean(doc)
	var result bytes.Buffer
	if shell {
		if found == nil {
			panic("template no longer renders #app-shell")
		}
		if err := html.Render(&result, found); err != nil {
			panic(err)
		}
	} else {
		var writeBody func(*html.Node)
		writeBody = func(node *html.Node) {
			if node.Type == html.ElementNode && node.Data == "body" {
				for child := node.FirstChild; child != nil; child = child.NextSibling {
					if err := html.Render(&result, child); err != nil {
						panic(err)
					}
				}
				return
			}
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				writeBody(child)
			}
		}
		writeBody(doc)
	}
	return result.String()
}

func main() {
	if len(os.Args) != 3 {
		panic("usage: demo-export OUTPUT REVISION")
	}
	settings := map[string]string{"theme": "light", "theme_style": "classic", "sidebar_width": "290px", "mail_list_width": "40%", "mail_list_view": "cards", "mail_list_navigation": "infinite", "timezone": "Europe/Prague"}
	calendarSettings := make(map[string]string, len(settings))
	for key, value := range settings {
		calendarSettings[key] = value
	}
	calendarSettings["mail_list_width"] = "76%"
	people := []models.Contact{
		{ID: "mira", Name: "Mira Chen", Email: "mira@example.com", Initials: "MC", Organization: "Atelier Studio", Title: "Product designer", Phone: "+420 555 010 101", Notes: "Working together on the autumn launch.", Source: "local", IsManual: true},
		{ID: "leo", Name: "Leo Martins", Email: "leo@example.com", Initials: "LM", Organization: "Atelier Studio", Title: "Frontend engineer", Phone: "+420 555 010 102", Notes: "Usually available in the afternoons.", Source: "local", IsManual: true},
		{ID: "nora", Name: "Nora Williams", Email: "nora@example.com", Initials: "NW", Organization: "Field Notes", Title: "Editor", Phone: "+420 555 010 103", Notes: "Sends the Friday reading list.", Source: "local", IsManual: true},
		{ID: "sam", Name: "Sam Patel", Email: "sam@example.com", Initials: "SP", Organization: "Northside", Title: "Photographer", Phone: "+420 555 010 104", Notes: "Ask about the next photo walk.", Source: "local", IsManual: true},
		{ID: "ines", Name: "Inès Laurent", Email: "ines@example.com", Initials: "IL", Organization: "Paper & Ink", Title: "Creative director", Phone: "+420 555 010 105", Notes: "Enjoys print design and good coffee.", Source: "local", IsManual: true},
		{ID: "alex", Name: "Alex Morgan", Email: "alex@example.com", Initials: "AM", Organization: "Atelier Studio", Title: "Project lead", Phone: "+420 555 010 106", Source: "local", IsManual: true},
	}
	accounts := []models.Account{
		{ID: "work", Name: "Work", Email: "alex@atelier.example", Provider: "gmail", Color: "#b86d41", Initials: "AM", IsActive: true, CalendarSyncEnabled: true, CalendarSources: []models.AccountCalendarSource{{ID: "studio", Name: "Studio", Color: "#b86d41"}}, Folders: []models.Folder{{ID: "work-inbox", Name: "Inbox", Role: "inbox", Icon: "inbox", Unread: 4, IsSystem: true}, {ID: "work-sent", Name: "Sent", Role: "sent", Icon: "send", IsSystem: true}, {ID: "work-archive", Name: "Archive", Role: "archive", Icon: "archive", IsSystem: true}}},
		{ID: "personal", Name: "Personal", Email: "alex@example.com", Provider: "imap", Color: "#668577", Initials: "AM", IsActive: true, CalendarSyncEnabled: true, CalendarSources: []models.AccountCalendarSource{{ID: "personal", Name: "Personal", Color: "#668577"}}, Folders: []models.Folder{{ID: "personal-inbox", Name: "Inbox", Role: "inbox", Icon: "inbox", Unread: 2, IsSystem: true}, {ID: "personal-sent", Name: "Sent", Role: "sent", Icon: "send", IsSystem: true}, {ID: "personal-archive", Name: "Archive", Role: "archive", Icon: "archive", IsSystem: true}}},
	}
	for i := range accounts {
		accounts[i].EmailSyncEnabled = true
		accounts[i].ContactSyncEnabled = true
	}
	syncSettings := models.SyncSettings{SyncIntervalMinutes: 5}
	for _, account := range accounts {
		status := models.AccountSyncStatus{AccountID: account.ID, AccountName: account.Name, AccountEmail: account.Email, Provider: account.Provider, Color: account.Color, Initials: account.Initials}
		for _, folder := range account.Folders {
			count := 24
			if folder.Role == "inbox" {
				count = 128
			}
			status.Folders = append(status.Folders, models.FolderSyncStatus{ID: folder.ID, Name: folder.Name, RemoteID: folder.Name, Icon: folder.Icon, Role: folder.Role, LastSyncedAt: "2026-10-07T09:42:00+02:00", MessageCount: count, IsIDLE: account.Provider == "imap" && folder.Role == "inbox", EffectiveIDLE: account.Provider == "imap" && folder.Role == "inbox"})
		}
		syncSettings.Accounts = append(syncSettings.Accounts, status)
	}
	type letter struct {
		sender                                  int
		subject, preview, body, folder, account string
		read, starred                           bool
	}
	letters := []letter{
		{0, "Ideas for the autumn launch", "The new direction is ready for a first look.", "<p>Hey Alex,</p><p>I’ve put together a few ideas for the autumn launch. The direction is a little warmer this time: more natural textures, quieter colors, and plenty of room for the work itself.</p><h2>Three things to explore</h2><ul><li>A simpler opening page</li><li>A small collection of stories from the studio</li><li>A more personal welcome email</li></ul><p>Would love to hear what you think before our review on Wednesday.</p><p>Mira</p>", "inbox", "work", false, true},
		{1, "Re: Autumn launch ideas", "The first prototype is up. A couple of small details to discuss.", "<p>Hi both,</p><p>The first prototype is ready. I’ve kept the motion subtle and made sure the transitions feel good with a keyboard, too.</p><p>One small suggestion: let the images do a little more of the talking on the opening screen.</p><p>See you at the review,<br>Leo</p>", "inbox", "work", false, false},
		{2, "Your weekend reading list", "Five things worth slowing down for.", "<p>Hello Alex,</p><p>This week’s reading list is about noticing the little things.</p><h2>On the list</h2><p><strong>Making room.</strong> A short essay about the spaces between projects.</p><p><strong>The everyday archive.</strong> A photographer’s collection of ordinary afternoons.</p><p><strong>A good question.</strong> Why the beginning of a conversation matters.</p><p>Enjoy a slow weekend,<br>Nora</p>", "inbox", "personal", true, false},
		{3, "Saturday photo walk?", "Coffee first, then the river. Bring your camera.", "<p>Hey!</p><p>A few of us are meeting on Saturday for a photo walk along the river. Nothing too organized—just coffee, cameras, and seeing where we end up.</p><p>Meet at the little café at 10?</p><p>Sam</p>", "inbox", "personal", false, false},
		{4, "The print samples have arrived", "The uncoated stock looks even better in person.", "<p>Hi Alex,</p><p>The samples arrived this morning, and the uncoated paper looks lovely. The colors are softer than on screen, in a good way.</p><p>I’ll bring them to the studio next week so everyone can take a look.</p><p>Best,<br>Inès</p>", "inbox", "work", true, true},
		{0, "Notes from the studio", "A quick recap and a few next steps.", "<p>Hi team,</p><p>Thanks for a useful session yesterday. Here’s a quick recap:</p><ul><li>Keep the navigation simple</li><li>Use the warm palette for the first concept</li><li>Share a working prototype before the next review</li></ul><p>Looking forward to the next round.<br>Mira</p>", "inbox", "work", true, false},
		{5, "Re: Studio review", "Wednesday at 10 works for me.", "<p>Hi Mira,</p><p>Wednesday at 10 works well. I’ll bring the latest notes, and we can go through the prototype together.</p><p>Thanks,<br>Alex</p>", "sent", "work", true, false},
		{5, "Re: Saturday photo walk?", "Count me in. See you at the café.", "<p>Hey Sam,</p><p>Count me in! I’ll bring the small camera. See you at the café at 10.</p><p>Alex</p>", "sent", "personal", true, false},
		{4, "Summer collection files", "Everything is packed and ready for the printer.", "<p>Hello Alex,</p><p>The summer collection is wrapped up. Thanks for all your work on this one—it came together beautifully.</p><p>The final files are ready for the printer.</p><p>Inès</p>", "archive", "work", true, false},
		{2, "A note from July", "A little inspiration for your next project.", "<p>Hello,</p><p>A small note from the archives: sometimes the best ideas arrive when you stop looking for them.</p><p>Until next time,<br>Nora</p>", "archive", "personal", true, false},
	}
	d := demo{Revision: os.Args[2], Date: "2026-10-07", Shells: map[string]string{}, Lists: map[string]string{}, Messages: map[string]string{}, Bodies: map[string]string{}, MailIndex: map[string]map[string]string{}, Contacts: map[string]string{}, Activities: map[string]string{}, Calendars: map[string]string{}, Events: map[string]string{}, Threads: map[string]string{}}
	for _, tab := range []string{"accounts", "sync"} {
		d.Shells["settings-"+tab] = fragment(views.SettingsLayout(accounts, syncSettings, tab, settings, nil), true)
	}
	var responsive bytes.Buffer
	if err := views.AppSidebarResponsiveStyle().Render(context.Background(), &responsive); err != nil {
		panic(err)
	}
	d.ResponsiveCSS = strings.TrimSuffix(strings.TrimPrefix(responsive.String(), "<style>"), "</style>")
	emails := make([]models.Email, 0, len(letters))
	for i, letter := range letters {
		color := accounts[0].Color
		if letter.account == "personal" {
			color = accounts[1].Color
		}
		email := models.Email{ID: fmt.Sprintf("message-%d", i+1), AccountID: letter.account, AccountColor: color, FolderID: letter.account + "-" + letter.folder, FolderRole: letter.folder, From: people[letter.sender], To: []models.Contact{people[5]}, Subject: letter.subject, Preview: letter.preview, TextBody: letter.preview, Date: fmt.Sprintf("%02d:%02d", 10-i/2, 45-i*3), DateFull: "October 7, 2026", IsRead: letter.read, IsStarred: letter.starred}
		if i < 2 {
			email.ThreadCount = 2
			email.ThreadID = "launch"
		}
		emails = append(emails, email)
		d.Bodies[email.ID] = letter.body
		d.MailIndex[email.ID] = map[string]string{"from": email.From.Name + " " + email.From.Email, "to": "Alex Morgan alex@example.com", "subject": letter.subject, "body": letter.preview + " " + letter.body}
	}
	thread := []models.ThreadItem{}
	for _, email := range emails[:2] {
		thread = append(thread, models.ThreadItem{ID: email.ID, AccountID: email.AccountID, AccountColor: email.AccountColor, From: email.From, To: email.To, Subject: email.Subject, Preview: email.Preview, Date: email.Date, DateFull: email.DateFull, FolderID: email.FolderID, FolderRole: email.FolderRole, IsRead: email.IsRead})
	}
	for i := range emails {
		var items []models.ThreadItem
		if i < 2 {
			items = thread
		}
		d.Messages[emails[i].ID] = fragment(views.MailViewContent(&emails[i], items), false)
	}
	d.Threads["launch"] = fragment(views.MailListThreadSubItems(thread, "name"), false)
	var inbox []models.Email
	for _, e := range emails {
		if e.FolderRole == "inbox" {
			inbox = append(inbox, e)
		}
	}
	d.Shells["mail"] = fragment(views.Layout(accounts, "inbox", inbox, &emails[0], len(inbox), len(inbox), settings, thread, "", 0, models.EmailFilters{}), true)
	d.Shells["compose"] = d.Shells["mail"]
	d.Compose = map[string]string{"pane": fragment(views.ComposePane(accounts), false), "dialog": fragment(views.ComposeDialog(accounts), false)}
	for _, folder := range []string{"inbox", "sent", "archive", "starred", "work-inbox", "work-sent", "work-archive", "personal-inbox", "personal-sent", "personal-archive"} {
		var items []models.Email
		for _, e := range emails {
			if e.FolderRole == folder || e.FolderID == folder || folder == "starred" && e.IsStarred {
				items = append(items, e)
			}
		}
		for _, view := range []string{"cards", "table"} {
			d.Lists[folder+":"+view] = fragment(views.MailListEmails(accounts, items, folder, &emails[0], len(items), len(items), 0, "name", view, "infinite"), false)
		}
	}
	for i := range people {
		var related []models.Email
		for _, email := range emails {
			if email.From.ID == people[i].ID {
				related = append(related, email)
			}
		}
		people[i].MessageCount = len(related)
		people[i].CreatedAt = "Sep 12, 2026"
		people[i].UpdatedAt = "Oct 7, 2026"
		people[i].LastSeenAt = "Oct 7, 2026"
		d.Activities[people[i].ID] = fragment(views.ContactRecentActivity(people[i], related), false)
	}
	d.Shells["contacts"] = fragment(views.ContactsLayout(accounts, people, &people[0], nil, false, false, models.ContactFilters{View: "cards"}, len(people), settings), true)
	for _, view := range []string{"cards", "table"} {
		d.Lists["contacts:"+view] = fragment(views.ContactsListPane(people, &people[0], models.ContactFilters{View: view}, len(people), settings["mail_list_width"], accounts), false)
	}
	for i := range people {
		d.Contacts[people[i].ID] = fragment(views.ContactsDetail(&people[i], nil, false, false, accounts), false)
	}
	location, err := time.LoadLocation("Europe/Prague")
	if err != nil {
		panic(err)
	}
	at := time.Date(2026, 10, 7, 0, 0, 0, 0, location)
	for offset := -1; offset <= 1; offset++ {
		date := at.AddDate(0, offset, 0)
		var events []views.CalendarEvent
		for i, info := range []struct {
			day, hour            int
			title, source, place string
		}{{7, 10, "Studio review", "studio", "Atelier Studio"}, {9, 14, "Print samples & coffee", "studio", "Paper & Ink"}, {10, 10, "Saturday photo walk", "personal", "Riverside café"}, {14, 11, "Autumn launch planning", "studio", "Atelier Studio"}, {16, 16, "A little time to read", "personal", "Home"}, {21, 10, "Design catch-up", "studio", "Atelier Studio"}} {
			start := time.Date(date.Year(), date.Month(), info.day, info.hour, 0, 0, 0, location)
			end := start.Add(time.Hour)
			name, color := "Studio", accounts[0].Color
			if info.source == "personal" {
				name, color = "Personal", accounts[1].Color
			}
			event := views.CalendarEvent{ID: fmt.Sprintf("event-%d-%d", date.Month(), i), SourceID: info.source, SourceName: name, SourceColor: color, Summary: info.title, Location: info.place, Status: "confirmed", ResponseStatus: "accepted", StartDate: start.Format("2006-01-02"), EndDate: end.Format("2006-01-02"), StartAt: &start, EndAt: &end}
			events = append(events, event)
			d.Events[event.ID] = fragment(views.CalendarEventDialog(views.CalendarEventDetails{Event: event, Description: "A little space to connect, share ideas, and make plans together.", Organizer: views.CalendarEventParticipant{Name: "Mira Chen", Email: "mira@example.com"}, Attendees: []views.CalendarEventParticipant{{Name: "Alex Morgan", Email: "alex@example.com", ResponseStatus: "accepted"}, {Name: "Leo Martins", Email: "leo@example.com", ResponseStatus: "accepted"}}}, location), false)
		}
		syncedAt := at.Add(9 * time.Hour)
		month := views.NewCalendarMonthData(date)
		month.Events = events
		month.HasSources = true
		month.TodayDateKey = d.Date
		month.TodayMonthKey = "2026-10"
		month.LastSyncedAt = &syncedAt
		for w := range month.Weeks {
			for day := range month.Weeks[w].Days {
				month.Weeks[w].Days[day].IsToday = month.Weeks[w].Days[day].ISODate == d.Date
			}
		}
		d.Calendars["month:"+date.Format("2006-01")] = fragment(views.CalendarPage(month, calendarSettings), false)
		if offset == 0 {
			d.Shells["calendar"] = fragment(views.CalendarLayout(accounts, month, calendarSettings), true)
		}
		// Store one fragment per week; the runtime normalizes dates to Monday.
		for day := 1; day <= 31; day++ {
			date := time.Date(date.Year(), date.Month(), day, 0, 0, 0, 0, location)
			week := views.NewCalendarWeekData(date)
			week.Events = events
			week.HasSources = true
			week.TodayDateKey = d.Date
			week.TodayMonthKey = "2026-10"
			week.LastSyncedAt = &syncedAt
			key := "week:" + week.Weeks[0].Days[0].ISODate
			if _, exists := d.Calendars[key]; exists {
				continue
			}
			for w := range week.Weeks {
				for day := range week.Weeks[w].Days {
					week.Weeks[w].Days[day].IsToday = week.Weeks[w].Days[day].ISODate == d.Date
				}
			}
			d.Calendars[key] = fragment(views.CalendarPage(week, calendarSettings), false)
		}
	}
	file, err := os.Create(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(d); err != nil {
		panic(err)
	}
}
