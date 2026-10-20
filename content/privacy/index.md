---
title: Privacy Policy
description: How Gofer and gofer.email handle your data.
layout: legal
updated: October 20, 2026
---

Gofer is free, open source software released under the [MIT license](https://github.com/cristianadrielbraun/gofer/blob/master/LICENSE). You run it yourself, on your own machine or server. This policy covers both the Gofer application and this website, gofer.email.

## The short version

The Gofer project does not operate a service that receives your data. Your email, contacts, and calendar go from your mail providers to the Gofer instance you run, and nowhere else. We have no servers that see them, and we do not collect, sell, or share them.

## The Gofer application

When you run Gofer, you connect your own accounts (Gmail, Outlook, or any IMAP, JMAP, CardDAV, or CalDAV provider). Gofer then:

- **Talks directly to your providers.** It reads and sends mail, contacts, and calendar data using the Gmail API, Microsoft Graph, IMAP, JMAP, SMTP, CardDAV, and CalDAV, as the account you authorize.
- **Stores data locally.** Messages, contacts, events, settings, and sign-in credentials (including OAuth tokens) are kept in a database on the machine or server where you run Gofer. You control that storage, and deleting it removes the data.
- **Sends nothing to the developers.** There is no telemetry, analytics, or remote logging in the application sending information to us.

Because you host Gofer, you are responsible for securing your instance, its database, and its backups. If you run it for other people, you are responsible for how their data is handled.

### Google user data

Gofer's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. In particular:

- Google user data is used only to provide the email, contact, and calendar features you see in Gofer.
- It is not transferred to anyone other than your own Gofer instance, except as needed to comply with law.
- It is not used or transferred for advertising, and it is not sold.
- Humans do not read it, because it never reaches the developers.

You can revoke Gofer's access at any time in your [Google Account permissions](https://myaccount.google.com/permissions).

### Microsoft user data

Gofer uses the Microsoft identity platform and Microsoft Graph to access your Outlook and Microsoft 365 mail, contacts, and calendar when you sign in. That data is handled the same way as above: it is fetched by your Gofer instance, stored locally, and not sent to the developers. You can revoke access in your [Microsoft account app permissions](https://account.live.com/consent/Manage) or, for work and school accounts, through your organization's admin.

## This website

gofer.email is a static site. It:

- sets no cookies and runs no analytics or advertising trackers;
- stores only your light or dark theme choice in your browser's local storage;
- loads fonts from Google Fonts, so your browser contacts Google to fetch them, which shares your IP address with Google under [Google's privacy policy](https://policies.google.com/privacy);
- runs the interactive demo entirely in your browser with sample data, with no real accounts involved.

The site is served through Cloudflare, which acts as our host and CDN. Cloudflare processes requests to the site and may keep standard server logs (such as IP address and requested page) for operational and security purposes, under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

## Children

Gofer and this site are not directed at children under 13.

## Changes

If this policy changes, the new version will be published on this page with an updated date. The full history is available in the [site repository](https://github.com/cristianadrielbraun/gofer.email).

## Contact

Questions or concerns can be raised by [opening an issue on GitHub](https://github.com/cristianadrielbraun/gofer/issues).
