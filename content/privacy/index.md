---
title: Privacy Policy
description: How Gofer and gofer.email handle your data.
layout: legal
updated: November 10, 2026
---

Gofer is free, open source software released under the [MIT license](https://github.com/cristianadrielbraun/gofer/blob/master/LICENSE). You run it yourself, on your own machine or server. This policy covers both the Gofer application and this website, gofer.email.

## The short version

The Gofer project does not operate a service that receives your data. Your email, contacts, and calendar go from your mail providers to the Gofer instance you run. We have no servers that see them, and we do not collect, sell, or share them. The only exceptions are the optional features described below that you turn on or use yourself: sender pictures and message translation.

## The Gofer application

When you run Gofer, you connect your own accounts (Gmail, Outlook, or any IMAP, JMAP, CardDAV, or CalDAV provider). Gofer then:

- **Talks directly to your providers.** It reads and sends mail, contacts, and calendar data using the Gmail API, Microsoft Graph, IMAP, JMAP, SMTP, CardDAV, and CalDAV, as the account you authorize.
- **Stores data locally.** Messages, contacts, events, settings, and sign-in credentials (including OAuth tokens) are kept in a database on the machine or server where you run Gofer. You control that storage, and deleting it removes the data.
- **Sends nothing to the developers.** There is no telemetry, analytics, or remote logging in the application sending information to us.

Because you host Gofer, you are responsible for securing your instance, its database, and its backups. If you run it for other people, you are responsible for how their data is handled.

Gofer is published by Cristian Braun as an open source project. Jedna Software publishes the built-in Google and Microsoft sign-in clients that Gofer uses, and is responsible for them. Privacy and support questions about those clients go to admin@jednasoftware.cz.

### Google user data

Gofer's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**What Gofer accesses.** When you connect a Google account, Gofer requests access to:

- your Google Account email address and basic profile (name and picture), to identify the account;
- your Gmail, to show, search, send, organize and delete your mail, using the Gmail API;
- your Google Contacts, to show, create, edit and delete contacts and write those changes back to Google;
- your Google Calendar, to show, create, edit and delete events and calendars. Access to manage all of your calendars is requested only if you choose it.

**How it is used.** Google user data is used only to provide the email, contact, and calendar features you see in Gofer. It is not used for advertising, profiling, lending, or to develop, improve or train AI or machine learning models. It is not sold.

**Where it goes.** Google user data is stored only on the Gofer instance you connected. Access and refresh tokens are encrypted there. Your instance talks directly to Google's servers and to your mail providers. It is not sent to the developers. The exceptions are the following features, which you can turn off:

- **Sender pictures.** Gofer looks up pictures for senders using Gravatar and Libravatar, which receive a hash of the sender's email address. It can also fetch the sender's BIMI logo and website icon, which means your instance contacts the DNS and web servers of the sender's domain. Lookups can be turned off with the `GOFER_AVATAR_PROVIDERS` setting.
- **Translation.** When you ask Gofer to translate a message, the text of that message is sent to Google Translate.

**How long it is kept.** Data stays on your Gofer instance until you delete the account in Gofer, which removes its mail, contacts, calendar data and tokens from the instance. Backups you made yourself are not affected.

**Revoking access.** You can stop Gofer's access at any time in your [Google Account permissions](https://myaccount.google.com/permissions). Once access is revoked, Gofer can no longer read or change the account's data.

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
