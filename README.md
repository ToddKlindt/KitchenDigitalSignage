# Klindt dashboard 2.2.0 — Synology edition

Real TeslaFi status, OpenWeatherMap weather, ICS calendars and RSS/Atom news. No sample data is displayed. Credentials and private feed URLs stay on the NAS; only selected display fields go to the browser.

## Upgrade from version 1

1. Back up your project folder and .env. Optionally export your browser layout from Settings.
2. Extract this ZIP into the SAME project folder and overwrite its program files. The ZIP has no .env, so it will not overwrite your existing key. Preserve any custom host port in docker-compose.yml.
3. KEEP your existing TESLAFI_API_KEY line. Append the following to .env, filling the two blank values locally:

```dotenv
OPENWEATHER_API_KEY=
WEATHER_CITY=Ames,IA,US
GOOGLE_CALENDAR_URL=
GOOGLE_CALENDAR_NAME=Family
INCLUDE_US_HOLIDAYS=true
TZ=America/Chicago
```

Use the OpenWeatherMap key from your MagicMirror config.js weather section. For Google Calendar use Settings > Integrate calendar > Secret address in iCal format. Reusing that HTTPS URL from MagicMirror's calendar configuration also works. Do not put private URLs in browser Settings or share the .env contents.

4. Container Manager > Project: select the existing dashboard project, then Action > Build. Enable a clean/no-cache build if offered. Start the project after the build. A simple Restart does not apply new code or changed environment values; recreate/rebuild the project.
5. Open http://kitchensignage:8081/ and press Ctrl+F5. Open /settings to check connections; it shows v2.1.0. The kiosk page has no controls or version badge.

The kiosk browser attempts to migrate its old local layout on the first upgraded load if no NAS settings have been saved yet. Keep the original .env file. You do not need to create a second project or delete the running project configuration.

SSH alternative (Linux NAS shell):

```sh
cd /volume1/docker/KlindtDashboard
sudo docker compose -f docker-compose.yml up -d --build --force-recreate
```

If your NAS uses the older command, substitute docker-compose for docker compose.

## New installation

Extract into /volume1/docker/KlindtDashboard. Dockerfile must sit beside docker-compose.yml, package.json and package-lock.json, with server/ and web/ folders.

Rename env.example to .env, enter the values, then create a Container Manager Project from docker-compose.yml. Build and start it. Web Station is not required. Change only the left port in 8081:8080 if 8081 is occupied.

The first build downloads the Node base image and locked parser dependencies. Node/npm need not be installed on the NAS itself. No bind mounts are required. Changed code is copied into the image on rebuild. The .env file is excluded from the image build context.

## Settings and freshness

- Weather: city (city,state,country), Fahrenheit/Celsius, refresh interval 10–60 minutes. Uses OpenWeatherMap 2.5 current weather and 5-day/3-hour forecast endpoints; your key must have access to both. Forecast highs/lows cover the remaining forecast samples, not full-day extremes. Attribution links to OpenWeatherMap.
- Calendar: configured calendar selection, event count 1–6, look-ahead 1–60 days, refresh interval 5–60 minutes. Recurrences, exception dates, moved/cancelled instances, all-day dates and time zones use node-ical. TZ defaults to America/Chicago.
- RSS: source selection/filter, headline rotation 5–120 seconds, refresh interval 5–60 minutes. Default feeds: Yahoo News, BBC, Electrek, Engadget, New York Times and KCCI. Dated articles older than 72 hours are excluded; undated items are labeled. Titles/URLs are deduplicated and link to original articles.
- TeslaFi: lastGood read-only request, checked once per minute. No wake or vehicle-control commands. Last-recorded vehicle timestamp is shown. VIN, precise location and raw API responses are excluded.

Cards display update age and per-source failures. On refresh errors, good cached weather/calendar/news data stays visible and is marked stale. Caches are in memory. Polling runs while a browser has the dashboard open. Server minimum cache windows: weather 10 minutes, calendar/news 5 minutes. Failures retry after up to 1 minute. The Check all connections button respects these limits.

Layout and display choices are saved on the NAS and shared with the TV; exports include no secrets. Keys and private source URLs belong in .env. Browser Settings control which sources to show, units, intervals and event limits without restarting the server.

## Extra sources

Google Calendar and US holidays are available together. Add additional calendars with one line of single-quoted JSON in .env:

```dotenv
CALENDARS_JSON='[{"name":"School","url":"https://example.org/school.ics","color":"#8ecae6"}]'
```

Replace the default RSS list with:

```dotenv
RSS_FEEDS_JSON='[{"name":"BBC","url":"https://feeds.bbci.co.uk/news/rss.xml"},{"name":"Electrek","url":"https://electrek.co/feed/"}]'
```

Use public HTTPS URLs, up to 10 calendars and 12 news feeds. Server configuration supplies URLs; browsers select source IDs and cannot submit arbitrary feed URLs. Recreate/rebuild after changing .env, then reload the page.

## Troubleshooting

- Not configured: check the exact variable names and .env filename (not .env.txt), then recreate the project.
- Weather error: check city and API activation/access for both weather products. New keys may need time to activate.
- Calendar error: use an ICS subscription URL, not an ordinary calendar website link. Google secret ICS feeds do not require browser login. No upcoming events can be a valid result.
- One RSS source unavailable: the others continue; the status line identifies failed sources. Replace changed/blocked feeds in RSS_FEEDS_JSON if needed.
- Startup errors: Container Manager > Container > klindt-dashboard > Log. Do not share secrets in logs/screenshots.

The /settings page has no separate application login. Devices with network access can view and edit display settings. Cross-origin browser writes are rejected. This server has no application login. Keep it LAN-only or use an authenticated reverse proxy. Its API returns your personal events and vehicle status to devices that can reach the server.

## Validation

npm test runs recurrence/DST/exceptions, all-day date, RSS/Atom/deduplication, weather aggregation/caching, secret exclusion and TeslaFi checks. Browser syntax: node --check web/app.js. Dependencies are pinned in package-lock.json; Docker uses npm ci with package scripts disabled.

This ZIP updates the NAS version, not the separately hosted preview. Weather and private-calendar end-to-end validation needs the keys/feed URL in your NAS environment. They are not included in this package.

Version 2.0.1 removes calendar source-name labels from entries and the time-zone label above the clock. Settings offers a 1–6 event dropdown. The clock still uses the configured local time zone.

Version 2.0.2 adds a black-on-white QR code on the right of the news box. It updates with the current headline and opens the same article URL. On narrow screens it sits below the headline. Codes are generated locally on the NAS, without a third-party QR service. No new environment settings are needed.


## Version 2.1.0: clean TV display and remote settings

The TV stays at http://kitchensignage:8081/ . Open http://kitchensignage:8081/settings on your computer or phone to configure it. Save settings applies them to the TV within five seconds while it is connected. Reset, import, revert and source checks are all on /settings. Keys and private URLs remain in .env.

The main page has no settings/fullscreen controls, next-story button, clickable pagination dots, headline links, QR links or retry buttons. Branding and technical header/footer labels are removed. The clock, cards, automatic news rotation and scan-to-read QR remain. Failed integrations retry automatically once a minute.

A named Docker volume, dashboard-data, stores display settings under /app/data/settings.json. Include the updated docker-compose.yml when extracting this upgrade. Ordinary rebuilds preserve the volume. Do not remove the volume or run docker compose down -v unless you want to erase saved display settings. Keep the same Compose project name/folder so the same named volume is reused.

After upgrading, reload the TV first so it can migrate its browser-local layout. Then open /settings on your computer. If the TV has no saved browser layout, the defaults apply until you Save from /settings. Once shared settings exist, they take precedence over each browser's old local settings. To recover a layout from another browser, export/import it on /settings and Save.

The settings page refuses stale saves if another device has changed the settings; reload before editing again. Unsaved edits and imports are drafts; Save is required before they reach the TV. Settings survive container recreation through the volume; .env still provides API credentials.

Version 2.1.1 adds a second matching Tesla metric row: odometer, TeslaFi tagged location, and reported charge rate (mi/hr). If TeslaFi reports zero power while charging, known single-phase AC current/voltage may supply an explicitly estimated kW value; DC and ambiguous multiphase power are not guessed. Tagged location is now returned to LAN dashboard clients; latitude/longitude, VIN and API credentials remain excluded. No new .env entries are needed.


## Version 2.2.0: recent news, charging reminders, weather alerts and health

Upgrade by extracting all files over the existing project, keeping .env, then run docker compose -f docker-compose.yml up -d --build --force-recreate from the same folder/project. Keep the existing dashboard-data volume. Reload the TV and /settings after upgrading. No new API keys are needed.

### /news

Open http://kitchensignage:8081/news on your phone/computer. Search titles and filter by source or headlines seen within 1, 6 or 24 hours. Articles open directly from their original links. This page lists all configured feeds, independent of which are selected on the TV.

The NAS collects feeds at startup and every ten minutes, even when nobody has the dashboard open. Headlines remain available for 24 hours after last appearing in a successfully fetched feed, up to 2,000 entries. Publication time and last-seen time are shown separately. The archive starts with the feeds available when this update is installed; it cannot recover stories that disappeared before installation. Headlines, source names, timestamps and article links are stored in news-history.json in the same persistent Docker volume as settings. Full articles are not downloaded. Feed errors do not erase retained history or extend old entries indefinitely.

### Charging reminder

In /settings, set the exact TeslaFi named home location tag (default Home) and battery target (default 80%). The amber reminder appears inside the Tesla card only when the car is at that tag, explicitly unplugged, below target, not driving and has vehicle data recorded within the last 15 minutes. Missing/unknown data and stale readings suppress reminders. The feature is a visual reminder only and sends no vehicle commands or external messages.

TeslaFi dates without a UTC offset are interpreted in the TeslaFi account time zone. This defaults to TZ (America/Chicago for this image). If your TeslaFi account uses another zone, set TESLAFI_TIMEZONE to that IANA zone in .env and recreate the container. The time zone controls interpretation of TeslaFi's date field, not a conversion based on the NAS clock.

### Official weather alerts

NWS alerts use a separate US map point: central Ames (42.0347, -93.6199) by default. Changing the OpenWeatherMap city does not move this point. Latitude, longitude, enable/disable and minimum severity are configurable in /settings. Moderate and above is the default and includes qualifying advisories; choose Severe and extreme for fewer banners.

The NWS API is checked at most once per minute per point. Actual, active, non-cancelled alerts meeting your severity threshold appear in a read-only banner above the TV widgets. Test messages and expired alerts are excluded. The banner shows up to two alerts with expiry time; /settings includes the active alert details/instructions. The banner disappears when a successful check finds no qualifying alerts. An unavailable or stale NWS connection is labeled as such, rather than shown as an all-clear. Cached alerts are still removed after expiry. No weather API key is needed for NWS.

This US-only supplemental display is not a replacement for phone emergency alerts, weather radio or official warning channels. Network/provider failures can delay alerts.

### Display health in /settings

The health panel shows the running version, server time/uptime, persistent-storage status, archive count, integration status, last good data/attempt, response time and unhealthy-response count. Calendar/news sources show individual status. Cached data timestamps are used when available. TeslaFi can be reachable while its vehicle record is stale; the health panel distinguishes that state.

The main dashboard sends a heartbeat every 30 seconds. /settings lists display resolution, page version, visibility and last heartbeat. A display not seen for 90 seconds is marked as not seen recently. Version mismatches suggest reloading the display. Heartbeats indicate the page is running; they do not prove the physical TV is on. Browser IDs and transient health records reset on server restart; saved display settings and headline history persist.

The TV remains read-only: /news and /settings contain the interactive controls. The four new features do not change the QR code destination or the existing vehicle/calendar data sources.


## 2.2.1 kiosk compatibility
Uses older-browser request and settings APIs, preserves unchanged widgets and QR images, keeps news rotation independent of data refreshes, and caches date formatters. Appearance, features and refresh intervals remain unchanged. Actual Pi Zero W performance and lockup recovery require device testing.


## 2.2.2 portrait layout
Portrait kiosk screens at least 480 CSS pixels wide place clock/weather in the top row, Tesla/calendar in the second row, and news across the bottom. Saved desktop columns and order remain available on landscape displays. Compact spacing and a 144-pixel QR code reduce height. Narrow phones retain the stacked layout.


## 2.2.3 kiosk refinements
Portrait news aligns to the bottom of available space without overlaying content or alerts. Longer content can still scroll. QR images use PNG on the display, retain the SVG API default, and retry after failures. Fresh vehicle data retains the charging reminder; 15-minute to 24-hour-old records meeting the same home/low-battery/unplugged conditions show an explicitly conditional last-reported advisory. Unknown, older or future data is suppressed.
