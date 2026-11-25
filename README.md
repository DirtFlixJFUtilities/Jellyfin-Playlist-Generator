# Dirtflix Playlist Generator - Technical Documentation

## Overview

The Dirtflix Playlist Generator is a standalone web app for building playlists on a Jellyfin media server. Search a term, browse the results grid, click titles into the right-hand "My Playlist" rail, then save the playlist directly on the server via the Jellyfin REST API. Works with Jellyfin 10.x and 12.x.

https://github.com/user-attachments/assets/618b42f1-a6b1-435e-a9cf-eb6a4199f76e

<img width="1987" height="1723" alt="new_and_improved" src="https://github.com/user-attachments/assets/3b48fdcb-971a-47eb-b63b-bff4e8521e2f" />


The workflow is a two-pane transfer model:

- **Results pane** (left) — disposable search results. Re-search freely; results regenerate with every search.
- **Playlist pane** (right) — the only list that matters. It accumulates items across searches until you save.

## Project Structure

```
Dirtflix Playlist Generator/
├── index.html            # Markup: connection bar, search bar, refine popover, two-pane workspace, tour banner, modals, showcase
├── script.js             # API client + UI state (results, playlist, refine selections, tour, library cache)
├── style.css             # CSS custom-property theme system (light/dark)
├── new_and_improved.jpg  # Screenshot (shown in the in-app showcase, embedded via <img>)
├── new_and_improved.mp4  # Demo video (embedded via <video> with the screenshot as poster)
└── dirtflixplaylist20.zip # Snapshot of the current files
```

No build step, no framework, no backend. Bootstrap 5 and Font Awesome are CDN-hosted.

## System Architecture

All processing is client-side; the browser talks directly to the Jellyfin server with `fetch`.

### Core Components
1. **User Interface (index.html)**: Bootstrap 5 layout — connection bar (server URL, API key, owner select, "Remember login"), search bar with media-type chips, Refine popover, results grid + sticky playlist rail, and a "Show Me" guided tour. Below 992px the panes become tabbed (Results / Playlist).
2. **Logic (script.js)**: One event-delegation handler per container (no per-card listeners), HTML escaping of item names (XSS-safe), debounced re-search on filter change.
3. **Styling (style.css)**: Single theme system driven by CSS variables on `:root` and `[data-theme="dark"]`; `data-bs-theme` is mirrored onto `<html>` so Bootstrap controls follow the theme. Only theme choice and (opt-in) login credentials persist in `localStorage`.

## Jellyfin API Integration

### Authentication
MediaBrowser client specification sent via the standard `Authorization` header. Jellyfin 12.x ignores the legacy `X-Emby-Authorization` header by default (`EnableLegacyAuthorization = false`); Jellyfin 10.x accepts both, so this header works on all supported versions:
```
Authorization: MediaBrowser Client="Dirtflix Playlist Generator", Device="Web Browser", Version="1.0.0", Token="{API_KEY}"
```
When an owner user is selected, `UserId="{USER_ID}"` is appended to the header and the `UserId` query parameter.

### API Endpoints Used

1. **GET /Users** - List users (requires API key)
2. **GET /Genres** - Genre names scoped to the selected media types (`IncludeItemTypes`, `Recursive`)
3. **GET /Items** (Fields=Studios) - Studio names for the Refine list; falls back to **GET /Studios** if the Items-based probe fails
4. **GET /Library/MediaFolders** - Top-level library folders (id → name map for the card library pills)
5. **GET /Items** - Search results
6. **GET /Items?Ids=...** (Fields=ParentId,Name) - Batch-resolves result items' parent folder chains (batches of 100) to find each item's top-level library
7. **POST /Playlists** - Creates the playlist with all item IDs inline

### Data Flow
1. Enter server URL + API key → users, genres/studios, and library folders load automatically; pick the playlist **Owner**.
2. Toggle Movies / TV / Music chips → genre and studio lists reload for those types.
3. Search (Enter or Search button) → `GET /Items` with `SearchTerm`, type, and Refine parameters (max 1000 results); `enrichLibraries()` then batch-resolves each item's parent chain so the card shows its library pill.
4. Click `+` on a result card to add it to the playlist (`✓` once added); `ℹ` opens a details modal. "Add all shown" batch-adds the current results.
5. Arrange the playlist with ↑/↓, sort dropdown, or remove with ✕.
6. Save → `POST /Playlists` with `Name`, `UserId`, `Users:[{UserId, CanEdit}]` (CanEdit is currently always true), `IsPublic`, `MediaType`, and `Ids` (up to 1000 GUIDs in creation order).

## Library Pills

Each result card and playlist row shows the top-level library a title lives in (e.g. `TV Shows`, `Chick Flicks`). Physical folder ids in item `ParentId` chains differ from the virtual `/Library/MediaFolders` view ids, so resolution walks the chain upward (batch `Ids` lookups) and matches by folder id **or** folder name. Unresolvable items simply show no pill.

## Search & Refine

### Media Types
Chips map to `IncludeItemTypes`: `Movie`, `Series`, `Audio`. At least one must be active.

### Refine Popover
- **Years** → `minPremiereDate` / `maxPremiereDate` (Jan 1 / Dec 31 of the entered years)
- **Min community rating** (0-10, step 0.5) → `MinCommunityRating`
- **Genres / Studios** → checkbox lists with type-to-filter inputs; selections join with `|` into the `Genres` / `Studios` parameters (any-match, like the API semantics). Active selection count badges on the Refine button.
- Changing any refinement re-runs the last search automatically (debounced 300ms).

Genre/studio lists are cleaned of junk entries (code-like names, ISBNs, punctuation-heavy labels) before display.

## Playlist Rail

- **Dedup**: items are matched by `Id`; cards already in the playlist render with a green check.
- **Ordering**: manual order by default (↑/↓ buttons), or sort A-Z / Z-A / newest / oldest / top-rated / shuffle. Order is sent to the server as-is.
- **No persistence**: the playlist lives in memory only. A refresh loses it — save before closing. Login credentials are cached only when "Remember login" is ticked.
- **Owner required**: saving without an owner selection is blocked (playlists need a user to belong to).

## Guided Tour

"Show Me" (header) runs a 7-step PowerPoint-style walkthrough: connection → owner → chips + search → search/results → Refine (opens the popover) → add to playlist → name & save. Each step shows text in a fixed, transparent floating banner (no layout shift) and pulses an accent ring on the relevant controls. On the search step two fake demo cards ("Five Star Movie", "The Show I'm Looking For") pop into the results pane; they stay visible but dimmed during the Refine step, then are removed. Auto-advances every 3.2s with Back/Next/Skip; dismisses automatically when the user presses Search.

## Login Caching

The "Remember login" checkbox (opt-in, off by default) stores `{serverUrl, apiKey, userId}` in `localStorage` under `dirtflix.connection`, auto-restoring the connection, user list selection, and filter data on the next page load. Unchecking deletes the entry immediately. Note: `file://` pages share one storage bucket and the value sits in the browser profile as recoverable plain text — see Security Considerations.

## Error Handling

- HTTP status validated on every call; failures surface as dismissible status toasts (auto-dismiss after 5s) and `console.error` detail.
- Buttons show spinners/disable during network operations.
- Confirmation dialog for playlist clear.
- Destructive and empty states show guidance instead of sample/fake data (the old demo-data fallback was removed).

## Responsive Design

- ≥992px: results grid + sticky 350px playlist rail side by side.
- <992px: Results/Playlist pill tabs switch panes (`body.is-narrow[data-pane]`).
- Result cards wrap as flex items: ~4 columns on wide screens, 3 / 2 / 1 at 992px / 768px / 576px breakpoints. Posters keep native 2:3 aspect ratio (`aspect-ratio: 2/3` + `object-fit: cover`; images are requested at `width=300` only so the server never crops them).

## Security Considerations

1. **API keys are bearer secrets.** They sit in the page (password field, in-memory) for the session, and in `localStorage` (unencrypted) if "Remember login" is ticked. Do not hardcode keys in `index.html`, do not commit real keys, avoid this option on shared machines, and revoke any key that leaks. The app is intended for LAN/trusted-network use.
2. **XSS**: all library-supplied strings (titles, genres) are HTML-escaped before rendering.
3. **CORS**: Jellyfin 12.x allows `authorization` and `x-emby-authorization` headers with `Access-Control-Allow-Origin: *`, so the page can be opened from `file://` or a local static server. Serve over HTTPS if the server requires it — mixed-content blocking, not CORS, is the usual failure in that case.

## Performance

- Search capped at 1000 items per request (`Limit=1000`).
- Event delegation: one click handler per container; result-card states refreshed in place instead of re-rendering grids on every add.
- Images lazy-load (`loading="lazy"`).

## Dependencies & Compatibility

- Bootstrap 5.3 + Font Awesome 6 (CDN)
- ES6+, Fetch API, CSS `aspect-ratio` / `color-mix` (Chrome/Edge 111+, Firefox 113+, Safari 16.4+)

## Known Limitations

1. **Playlist not persisted** — filter state and staged items are lost on refresh (deliberate). Theme and opt-in login (URL, key, owner in `localStorage` under `dirtflix.connection`) survive; untick "Remember login" to erase them.
2. **1000-result cap** per search; narrow with Refine or shorter terms for larger libraries.
3. **Video playlists only** at save time (Media type select offers `Video`).
4. **Description field absent** — Jellyfin's `POST /Playlists` accepts no description, so the UI no longer offers one.
5. **Any-match genre semantics** — Jellyfin's `Genres` filter matches items with *any* selected genre, not all.

## Troubleshooting

- **401 Unauthorized** — API key is invalid/revoked, or typed with whitespace. Create a fresh key (Dashboard → API Keys). On 12.x the server ignores `X-Emby-Authorization`; this app already uses the `Authorization` header.
- **404** — server URL/port wrong; include the scheme (`http://192.168.1.200:8096`) and no trailing slash.
- **"Failed to fetch"** — browser couldn't reach the server at all: wrong URL, server down, or mixed content (HTTPS page vs HTTP server).
- **Empty results** — broaden: fewer refinements, other media-type chips, shorter term.
- **Missing images** — item has no Primary image tag; placeholder shown.
- Debug via browser Network tab (every call is a plain GET/POST) and console logging.
