// Dirtflix Playlist Generator — two-pane search/add model
// API layer targets Jellyfin 10.x and 12.x (Authorization header, POST /Playlists).

let results = [];
let playlist = [];
let genres = [];
let studios = [];
let userId = '';
let genresLoaded = false;
let studiosLoaded = false;
let hasSearched = false;
let searchTimer = null;
let libraryNames = {};

const activeGenres = new Set();
const activeStudios = new Set();

// DOM elements
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const userSelect = document.getElementById('userSelect');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const refineBtn = document.getElementById('refineBtn');
const refineBadge = document.getElementById('refineBadge');
const refinePopover = document.getElementById('refinePopover');
const genreSearch = document.getElementById('genreSearch');
const genreList = document.getElementById('genreList');
const studioSearch = document.getElementById('studioSearch');
const studioList = document.getElementById('studioList');
const yearFrom = document.getElementById('yearFrom');
const yearTo = document.getElementById('yearTo');
const ratingFilter = document.getElementById('ratingFilter');
const ratingValue = document.getElementById('ratingValue');
const resultsCount = document.getElementById('resultsCount');
const resultsContainer = document.getElementById('resultsContainer');
const addAllBtn = document.getElementById('addAllBtn');
const playlistCount = document.getElementById('playlistCount');
const tabPlaylistCount = document.getElementById('tabPlaylistCount');
const playlistSort = document.getElementById('playlistSort');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
const playlistContainer = document.getElementById('playlistContainer');
const playlistName = document.getElementById('playlistName');
const isPublicCheckbox = document.getElementById('isPublicCheckbox');
const mediaTypeSelect = document.getElementById('mediaTypeSelect');
const savePlaylistBtn = document.getElementById('savePlaylistBtn');
const statusMessages = document.getElementById('statusMessages');
const tabResultsBtn = document.getElementById('tabResultsBtn');
const tabPlaylistBtn = document.getElementById('tabPlaylistBtn');
const rememberLogin = document.getElementById('rememberLogin');
const tourBtn = document.getElementById('tourBtn');
const tourBanner = document.getElementById('tourBanner');
const tourStepEl = document.getElementById('tourStep');
const tourTextEl = document.getElementById('tourText');
const tourPrevBtn = document.getElementById('tourPrev');
const tourNextBtn = document.getElementById('tourNext');
const tourSkipBtn = document.getElementById('tourSkip');
const chips = Array.from(document.querySelectorAll('.chip'));

const CONN_KEY = 'dirtflix.connection';

function getSavedConnection() {
    try {
        return JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
    } catch {
        return null;
    }
}

function saveConnection() {
    if (!rememberLogin.checked) return;
    localStorage.setItem(CONN_KEY, JSON.stringify({
        serverUrl: serverUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        userId
    }));
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function authHeader() {
    let header = `MediaBrowser Client="Dirtflix Playlist Generator", Device="Web Browser", Version="1.0.0", Token="${apiKeyInput.value.trim()}"`;
    if (userId) {
        header += `, UserId="${userId}"`;
    }
    return header;
}

function connectionReady() {
    return serverUrlInput.value.trim() && apiKeyInput.value.trim();
}

// Theme toggle
function applyTheme(theme) {
    const body = document.body;
    const icon = document.getElementById('themeToggle').querySelector('i');

    body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('theme', theme);
}

// Responsive pane switching
function updateNarrowMode() {
    document.body.classList.toggle('is-narrow', window.innerWidth < 992);
}

function setActivePane(pane) {
    document.body.setAttribute('data-pane', pane);
    tabResultsBtn.classList.toggle('active', pane === 'results');
    tabPlaylistBtn.classList.toggle('active', pane === 'playlist');
}

document.addEventListener('DOMContentLoaded', function () {
    applyTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('themeToggle').addEventListener('click', () => {
        applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    updateNarrowMode();
    setActivePane('results');
    window.addEventListener('resize', updateNarrowMode);

    tabResultsBtn.addEventListener('click', () => setActivePane('results'));
    tabPlaylistBtn.addEventListener('click', () => setActivePane('playlist'));

    yearFrom.placeholder = '1900';
    yearTo.placeholder = new Date().getFullYear().toString();

    // Connection
    const saved = getSavedConnection();
    if (saved) {
        serverUrlInput.value = saved.serverUrl || '';
        apiKeyInput.value = saved.apiKey || '';
        rememberLogin.checked = true;
    }

    function onConnectionChange() {
        saveConnection();
        if (connectionReady()) {
            fetchUsers();
            loadGenresAndStudios();
            loadLibraries();
        }
    }
    serverUrlInput.addEventListener('change', onConnectionChange);
    apiKeyInput.addEventListener('change', onConnectionChange);

    rememberLogin.addEventListener('change', () => {
        if (rememberLogin.checked) {
            saveConnection();
        } else {
            localStorage.removeItem(CONN_KEY);
        }
    });

    userSelect.addEventListener('change', function () {
        userId = this.value;
        saveConnection();
        updateSaveButtonLabel();
        if (hasSearched) {
            runSearch();
        }
    });

    // Search triggers
    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') runSearch();
    });

    // Type chips
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            if (genresLoaded) loadGenresAndStudios(true);
            if (hasSearched) scheduleSearch();
        });
    });

    // Refine popover
    refineBtn.addEventListener('click', e => {
        e.stopPropagation();
        refinePopover.hidden = !refinePopover.hidden;
    });
    document.addEventListener('click', e => {
        if (!refinePopover.hidden && !refinePopover.contains(e.target) && e.target !== refineBtn) {
            refinePopover.hidden = true;
        }
    });

    ratingFilter.addEventListener('input', function () {
        ratingValue.textContent = this.value;
        if (hasSearched) scheduleSearch();
    });

    yearFrom.addEventListener('change', () => { if (hasSearched) scheduleSearch(); });
    yearTo.addEventListener('change', () => { if (hasSearched) scheduleSearch(); });

    genreSearch.addEventListener('input', () => filterCheckList(genreList, genreSearch.value));
    studioSearch.addEventListener('input', () => filterCheckList(studioList, studioSearch.value));

    // Results delegation: add/remove + details
    resultsContainer.addEventListener('click', e => {
        const card = e.target.closest('.item-card');
        if (!card) return;
        const item = results.find(it => it.Id === card.dataset.id);
        if (!item) return;
        if (e.target.closest('.info-btn')) {
            showItemDetails(item);
        } else {
            togglePlaylist(item);
        }
    });

    addAllBtn.addEventListener('click', () => {
        let added = 0;
        results.forEach(item => {
            if (!playlist.some(p => p.Id === item.Id)) {
                playlist.push(item);
                added++;
            }
        });
        renderPlaylist();
        refreshResultCards();
        showStatusMessage(added > 0 ? `Added ${added} item(s) to your playlist` : 'All shown items are already in your playlist', added > 0 ? 'success' : 'info');
    });

    // Playlist delegation
    playlistContainer.addEventListener('click', e => {
        const row = e.target.closest('.pl-row');
        if (!row) return;
        const id = row.dataset.id;
        const idx = playlist.findIndex(p => p.Id === id);
        if (idx === -1) return;

        if (e.target.closest('.pl-remove')) {
            playlist.splice(idx, 1);
        } else if (e.target.closest('.pl-up') && idx > 0) {
            [playlist[idx - 1], playlist[idx]] = [playlist[idx], playlist[idx - 1]];
        } else if (e.target.closest('.pl-down') && idx < playlist.length - 1) {
            [playlist[idx + 1], playlist[idx]] = [playlist[idx], playlist[idx + 1]];
        } else if (e.target.closest('.pl-detail')) {
            showItemDetails(playlist[idx]);
            return;
        } else {
            return;
        }
        renderPlaylist();
        refreshResultCards();
    });

    playlistSort.addEventListener('change', function () {
        sortPlaylist(this.value);
    });

    clearPlaylistBtn.addEventListener('click', () => {
        if (playlist.length === 0) return;
        if (confirm(`Clear all ${playlist.length} item(s) from your playlist?`)) {
            playlist = [];
            renderPlaylist();
            refreshResultCards();
        }
    });

    savePlaylistBtn.addEventListener('click', savePlaylist);

    document.getElementById('helpModalTrigger').addEventListener('click', e => {
        e.preventDefault();
        new bootstrap.Modal(document.getElementById('helpModal')).show();
    });

    tourBtn.addEventListener('click', startTour);
    tourNextBtn.addEventListener('click', nextTourStep);
    tourPrevBtn.addEventListener('click', prevTourStep);
    tourSkipBtn.addEventListener('click', endTour);

    if (connectionReady()) {
        fetchUsers();
        loadGenresAndStudios();
        loadLibraries();
    }

    renderPlaylist();
});

function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
}

function updateSaveButtonLabel() {
    const userName = userSelect.value ? userSelect.options[userSelect.selectedIndex].textContent : '';
    savePlaylistBtn.innerHTML = `<i class="fas fa-save me-2"></i>Save Playlist${userName ? ` for ${esc(userName)}` : ' to Jellyfin'}`;
}

// ---------- Libraries ----------
async function loadLibraries() {
    if (!connectionReady()) return;
    try {
        const response = await fetch(`${serverUrlInput.value.trim()}/Library/MediaFolders`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        libraryNames = {};
        (data.Items || []).forEach(folder => { libraryNames[folder.Id] = folder.Name; });
    } catch (error) {
        console.error('Error loading libraries:', error);
    }
}

// Batch-resolve each item's ancestor folder chain, then tag items with their
// top-level library (matched by folder id or folder name — physical folder ids
// differ from the virtual MediaFolders view ids).
async function enrichLibraries(items) {
    if (!Object.keys(libraryNames).length || items.length === 0) return;
    const libNames = new Set(Object.values(libraryNames));
    const nameOf = {};
    const parentOf = {};

    let frontier = new Set(items.map(it => it.ParentId).filter(Boolean));
    let guard = 0;
    while (frontier.size && guard++ < 6) {
        const ids = Array.from(frontier).filter(id => !(id in nameOf));
        if (ids.length === 0) break;
        for (let i = 0; i < ids.length; i += 100) {
            const batch = ids.slice(i, i + 100);
            const params = new URLSearchParams();
            params.append('Ids', batch.join(','));
            params.append('Fields', 'ParentId,Name');
            try {
                const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
                    headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
                });
                if (!response.ok) return;
                const data = await response.json();
                (data.Items || []).forEach(f => {
                    nameOf[f.Id] = f.Name;
                    parentOf[f.Id] = f.ParentId || '';
                });
            } catch (error) {
                console.error('Error resolving library folders:', error);
                return;
            }
        }
        const next = new Set();
        for (const id of ids) {
            const parent = parentOf[id];
            if (parent && !(parent in nameOf) && !libraryNames[parent] && !libNames.has(nameOf[id] || '')) {
                next.add(parent);
            }
        }
        frontier = next;
    }

    items.forEach(item => {
        let cur = item.ParentId;
        const seen = new Set();
        for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
            seen.add(cur);
            if (libraryNames[cur]) { item._library = libraryNames[cur]; return; }
            const nm = nameOf[cur];
            if (nm && libNames.has(nm)) { item._library = nm; return; }
            cur = nm ? parentOf[cur] : '';
        }
    });
}

function libraryName(item) {
    return item._library || (item.ParentId && libraryNames[item.ParentId]) || '';
}

// ---------- Users ----------
async function fetchUsers() {
    try {
        const response = await fetch(`${serverUrlInput.value.trim()}/Users`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const users = await response.json();
        const usersArray = Array.isArray(users) ? users : (users.Items || []);

        const previous = userSelect.value || (getSavedConnection() || {}).userId || '';
        userSelect.innerHTML = '<option value="">Select a user...</option>';
        usersArray.forEach(user => {
            const option = document.createElement('option');
            option.value = user.Id;
            option.textContent = user.Name;
            userSelect.appendChild(option);
        });
        if (previous && usersArray.some(u => u.Id === previous)) {
            userSelect.value = previous;
        }
        userId = userSelect.value;
        saveConnection();
        updateSaveButtonLabel();
        showStatusMessage(`Successfully loaded ${usersArray.length} users`, 'success');
    } catch (error) {
        console.error('Error fetching users:', error);
        showStatusMessage(`Error loading users: ${error.message}`, 'danger');
    }
}

// ---------- Genres & studios ----------
function selectedTypes() {
    return chips.filter(c => c.classList.contains('active')).map(c => c.dataset.type);
}

async function fetchGenresForTypes(itemTypes) {
    const params = new URLSearchParams();
    params.append('IncludeItemTypes', itemTypes.join(','));
    params.append('Recursive', 'true');

    const response = await fetch(`${serverUrlInput.value.trim()}/Genres?${params}`, {
        headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error fetching genres! status: ${response.status}`);

    const data = await response.json();
    let names = data.Items ? data.Items.map(i => i.Name) : [];

    // Drop junk genres: not title-case, code-looking names, ISBNs, heavy punctuation
    return names.filter(name => {
        if (!name) return false;
        if (name[0] !== name[0].toUpperCase()) return false;
        const words = name.split(' ');
        if (words.length > 1 && words.some(w => w.length > 0 && w[0] !== w[0].toUpperCase())) return false;
        if ((name.match(/[^a-zA-Z0-9]/g) || []).length > 1) return false;
        if (name.includes(':') || name.includes(';')) return false;
        if (/^FIC\d{6}$/.test(name)) return false;
        if (/^[A-Z]{3}\d{6}$/.test(name)) return false;
        if (/[A-Za-z]{3}\d{6}/.test(name)) return false;
        if (/ISBN(\s\d+)+/.test(name) || /ISBN\d+/.test(name)) return false;
        return true;
    });
}

async function fetchStudiosForTypes(itemTypes) {
    const serverUrl = serverUrlInput.value.trim();
    const params = new URLSearchParams();
    params.append('IncludeItemTypes', itemTypes.join(','));
    params.append('Recursive', 'true');
    params.append('Fields', 'Studios');
    params.append('Limit', '1000');

    const clean = names => names.filter(name => {
        if (!name) return false;
        if (name[0] !== name[0].toUpperCase()) return false;
        if (/^\d+$/.test(name)) return false;
        if (name.includes('\ufffd')) return false;
        if ((name.match(/[^a-zA-Z0-9]/g) || []).length >= 4) return false;
        return true;
    });

    try {
        const response = await fetch(`${serverUrl}/Items?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error fetching items for studios! status: ${response.status}`);
        const data = await response.json();
        const names = [];
        (data.Items || []).forEach(item => {
            (item.Studios || []).forEach(s => {
                const n = typeof s === 'string' ? s : s.Name;
                if (n && !names.includes(n)) names.push(n);
            });
        });
        return clean(names);
    } catch (error) {
        console.error('Error fetching studios:', error);
        try {
            const response = await fetch(`${serverUrl}/Studios`, {
                headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                return clean(data.Items ? data.Items.map(i => i.Name) : []);
            }
        } catch (fallbackError) {
            console.error('Fallback error fetching studios:', fallbackError);
        }
        throw error;
    }
}

async function loadGenresAndStudios(force = false) {
    if ((genresLoaded && studiosLoaded && !force) || !connectionReady()) return;

    const itemTypes = selectedTypes();
    if (itemTypes.length === 0) return;

    try {
        genres = await fetchGenresForTypes(itemTypes);
        genresLoaded = true;
        studios = await fetchStudiosForTypes(itemTypes);
        studiosLoaded = true;

        activeGenres.forEach(g => { if (!genres.includes(g)) activeGenres.delete(g); });
        activeStudios.forEach(s => { if (!studios.includes(s)) activeStudios.delete(s); });

        buildCheckList(genreList, genres, activeGenres, () => { if (hasSearched) scheduleSearch(); });
        buildCheckList(studioList, studios, activeStudios, () => { if (hasSearched) scheduleSearch(); });
        updateRefineBadge();
    } catch (error) {
        console.error('Error loading genres and studios:', error);
        showStatusMessage(`Could not load genres/studios: ${error.message}`, 'warning');
    }
}

function buildCheckList(container, items, activeSet, onChange) {
    container.innerHTML = '';
    items.forEach(name => {
        const label = document.createElement('label');
        label.className = 'check-item';
        label.dataset.name = name.toLowerCase();
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = activeSet.has(name);
        input.addEventListener('change', () => {
            if (input.checked) activeSet.add(name); else activeSet.delete(name);
            updateRefineBadge();
            onChange();
        });
        const span = document.createElement('span');
        span.textContent = name;
        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });
}

function filterCheckList(container, term) {
    const needle = term.trim().toLowerCase();
    container.querySelectorAll('.check-item').forEach(label => {
        label.style.display = !needle || label.dataset.name.includes(needle) ? '' : 'none';
    });
}

function updateRefineBadge() {
    const n = activeGenres.size + activeStudios.size;
    refineBadge.hidden = n === 0;
    refineBadge.textContent = n;
}

// ---------- Search ----------
async function runSearch() {
    if (tourTimer) endTour();
    if (!connectionReady()) {
        showStatusMessage('Enter your server URL and API key first', 'warning');
        return;
    }
    const itemTypes = selectedTypes();
    if (itemTypes.length === 0) {
        showStatusMessage('Select at least one media type (Movies/TV/Music)', 'warning');
        return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        const params = new URLSearchParams();
        params.append('IncludeItemTypes', itemTypes.join(','));
        params.append('Recursive', 'true');
        params.append('EnableImageTypes', 'Primary,Backdrop');
        params.append('Limit', '1000');
        params.append('Fields', 'Overview,Taglines,CriticRating,CommunityRating,ProductionYear,Studios,ImageTags,Name,Type,Genres,ParentId');

        const minRating = parseFloat(ratingFilter.value);
        if (minRating > 0) params.append('MinCommunityRating', minRating.toString());

        const yFrom = parseInt(yearFrom.value);
        const yTo = parseInt(yearTo.value);
        if (!isNaN(yFrom)) params.append('minPremiereDate', new Date(yFrom, 0, 1).toISOString());
        if (!isNaN(yTo)) params.append('maxPremiereDate', new Date(yTo, 11, 31).toISOString());

        if (activeGenres.size > 0) params.append('Genres', Array.from(activeGenres).join('|'));
        if (activeStudios.size > 0) params.append('Studios', Array.from(activeStudios).join('|'));

        const term = searchInput.value.trim();
        if (term) params.append('SearchTerm', term);
        if (userId) params.append('UserId', userId);

        const response = await fetch(`${serverUrlInput.value.trim()}/Items?${params}`, {
            headers: { 'Authorization': authHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        results = data.Items || [];
        hasSearched = true;
        await enrichLibraries(results);
        renderResults();
    } catch (error) {
        console.error('Error fetching items:', error);
        showStatusMessage(`Search failed: ${error.message}`, 'danger');
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="fas fa-search me-2"></i>Search';
    }
}

function typeLabel(item) {
    if (item.Type === 'Movie') return 'Movie';
    if (item.Type === 'Series' || item.Type === 'TvProgram') return 'TV Series';
    return item.Type || '';
}

function renderResults() {
    if (results.length === 0) {
        resultsCount.textContent = 'No matches';
        addAllBtn.disabled = true;
        resultsContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No titles matched that search</p>
                <p>Try different keywords, media types, or fewer refinements</p>
            </div>`;
        return;
    }

    addAllBtn.disabled = false;
    resultsCount.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}`;
    resultsContainer.innerHTML = results.map(cardHtml).join('');
}

function cardHtml(item) {
    const inList = playlist.some(p => p.Id === item.Id);
    const lib = libraryName(item);
    const img = item.ImageTags && item.ImageTags.Primary
        ? `<img src="${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=300" alt="${esc(item.Name)}" class="item-image" loading="lazy">`
        : `<div class="item-image item-placeholder"><i class="fas fa-film fa-3x"></i></div>`;

    return `
        <div class="item-card ${inList ? 'in-playlist' : ''}" data-id="${item.Id}">
            <div class="card-actions">
                <button type="button" class="card-btn add-btn" title="${inList ? 'Remove from playlist' : 'Add to playlist'}">
                    <i class="fas ${inList ? 'fa-check' : 'fa-plus'}"></i>
                </button>
                <button type="button" class="card-btn info-btn" title="Details">
                    <i class="fas fa-circle-info"></i>
                </button>
            </div>
            ${img}
            <div class="item-body">
                <div class="item-title">${esc(item.Name)}</div>
                ${item.ProductionYear ? `<div class="item-year">Released: ${item.ProductionYear}</div>` : ''}
                ${item.CommunityRating ? `<div class="item-rating"><i class="fas fa-star"></i> ${item.CommunityRating}/10</div>` : ''}
                ${item.Genres && item.Genres.length ? `<div class="item-genres">${esc(item.Genres.join(', '))}</div>` : ''}
                <div class="item-type">${typeLabel(item)}${lib ? `<span class="lib-chip">${esc(lib)}</span>` : ''}</div>
            </div>
        </div>`;
}

function refreshResultCards() {
    resultsContainer.querySelectorAll('.item-card').forEach(card => {
        const inList = playlist.some(p => p.Id === card.dataset.id);
        card.classList.toggle('in-playlist', inList);
        const btn = card.querySelector('.add-btn i');
        if (btn) btn.className = `fas ${inList ? 'fa-check' : 'fa-plus'}`;
    });
}

// ---------- Playlist ----------
function togglePlaylist(item) {
    const idx = playlist.findIndex(p => p.Id === item.Id);
    if (idx >= 0) {
        playlist.splice(idx, 1);
    } else {
        playlist.push(item);
    }
    renderPlaylist();
    refreshResultCards();
}

function renderPlaylist() {
    const n = playlist.length;
    playlistCount.textContent = n;
    tabPlaylistCount.textContent = n;
    savePlaylistBtn.disabled = n === 0;
    clearPlaylistBtn.disabled = n === 0;

    if (n === 0) {
        playlistContainer.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-list fa-2x mb-2"></i>
                <p class="mb-0">Your playlist is empty — add titles from the results</p>
            </div>`;
        return;
    }

    playlistContainer.innerHTML = playlist.map((item, idx) => {
        const thumb = item.ImageTags && item.ImageTags.Primary
            ? `<img src="${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=90" alt="" class="pl-thumb" loading="lazy">`
            : `<div class="pl-thumb pl-placeholder"><i class="fas fa-film"></i></div>`;
        const sub = [item.ProductionYear || '', typeLabel(item), libraryName(item)].filter(Boolean).join(' · ');
        return `
            <div class="pl-row" data-id="${item.Id}">
                ${thumb}
                <div class="pl-meta">
                    <div class="pl-title">${esc(item.Name)}</div>
                    <div class="pl-sub">${esc(sub)}</div>
                </div>
                <div class="pl-tools">
                    <button type="button" class="pl-tool pl-detail" title="Details"><i class="fas fa-circle-info"></i></button>
                    <button type="button" class="pl-tool pl-up" title="Move up" ${idx === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                    <button type="button" class="pl-tool pl-down" title="Move down" ${idx === n - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    <button type="button" class="pl-tool pl-remove" title="Remove"><i class="fas fa-xmark"></i></button>
                </div>
            </div>`;
    }).join('');
}

function sortPlaylist(mode) {
    if (playlist.length === 0 || mode === 'none') return;

    switch (mode) {
        case 'alphabetical':
            playlist.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
            break;
        case 'alphabeticalDesc':
            playlist.sort((a, b) => (b.Name || '').localeCompare(a.Name || ''));
            break;
        case 'releaseDate':
            playlist.sort((a, b) => (b.ProductionYear || 0) - (a.ProductionYear || 0));
            break;
        case 'oldest':
            playlist.sort((a, b) => (a.ProductionYear || 0) - (b.ProductionYear || 0));
            break;
        case 'rating':
            playlist.sort((a, b) => (b.CommunityRating || 0) - (a.CommunityRating || 0));
            break;
        case 'random':
            for (let i = playlist.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
            }
            break;
    }
    renderPlaylist();
}

// ---------- Save ----------
async function savePlaylist() {
    if (playlist.length === 0) {
        showStatusMessage('Your playlist is empty', 'warning');
        return;
    }
    const name = playlistName.value.trim();
    if (!name) {
        showStatusMessage('Give your playlist a name first', 'warning');
        return;
    }
    if (!userId) {
        showStatusMessage('Select a playlist owner in the Owner dropdown first', 'warning');
        return;
    }

    savePlaylistBtn.disabled = true;
    savePlaylistBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const playlistData = {
            Name: name,
            UserId: userId,
            Users: [{ UserId: userId, CanEdit: true }],
            IsPublic: isPublicCheckbox.checked,
            MediaType: mediaTypeSelect.value,
            Ids: playlist.map(item => item.Id)
        };

        const response = await fetch(`${serverUrlInput.value.trim()}/Playlists`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader(),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(playlistData)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        showStatusMessage(`Playlist "${esc(name)}" created on your server (${result.Id})`, 'success');
    } catch (error) {
        console.error('Error saving playlist:', error);
        showStatusMessage(`Error creating playlist: ${error.message}`, 'danger');
    } finally {
        savePlaylistBtn.disabled = false;
        updateSaveButtonLabel();
    }
}

// ---------- Details modal ----------
function showItemDetails(item) {
    document.getElementById('detailTitle').textContent = item.Name || '';
    document.getElementById('detailType').textContent = typeLabel(item);

    let studio = '';
    if (item.Studios && item.Studios.length > 0) {
        studio = typeof item.Studios[0] === 'string' ? item.Studios[0] : (item.Studios[0].Name || '');
    }
    document.getElementById('detailStudio').textContent = studio || 'N/A';
    document.getElementById('detailCriticRating').textContent = item.CriticRating != null ? item.CriticRating.toFixed(1) : 'N/A';
    document.getElementById('detailCommunityRating').textContent = item.CommunityRating != null ? item.CommunityRating.toFixed(1) : 'N/A';
    document.getElementById('detailYear').textContent = item.ProductionYear || 'N/A';
    document.getElementById('detailOverview').textContent = item.Overview || 'No overview available.';

    const taglineSection = document.getElementById('taglineSection');
    if (item.Taglines && item.Taglines.length > 0) {
        document.getElementById('detailTagline').textContent = item.Taglines[0];
        taglineSection.style.display = 'block';
    } else {
        taglineSection.style.display = 'none';
    }

    const detailImage = document.getElementById('detailImage');
    if (item.ImageTags && item.ImageTags.Primary) {
        detailImage.src = `${serverUrlInput.value.trim()}/Items/${item.Id}/Images/Primary?width=300&height=450`;
        detailImage.alt = item.Name;
    } else {
        detailImage.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"%3E%3Crect fill="%23e9ecef" width="300" height="450"/%3E%3Ctext fill="%236c757d" font-family="Verdana" font-size="24" x="150" y="225" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
        detailImage.alt = 'No image available';
    }

    new bootstrap.Modal(document.getElementById('itemDetailModal')).show();
}

// ---------- Guided tour ----------
const TOUR_STEPS = [
    { text: 'Enter your Jellyfin server address & API key', targets: ['#serverUrl', '#apiKey'] },
    { text: 'Select the user who will own the playlist', targets: ['#userSelect'] },
    { text: 'Pick the media types you want, then type a search phrase', targets: ['.type-chips', '.search-main'] },
    { text: 'Hit Search — matching titles appear in this pane', targets: ['#searchBtn', '#resultsContainer'] },
    { text: 'Refine What You See — dial in years, rating, genres, studios', targets: ['#refineBtn', '#refinePopover'] },
    { text: 'Click the + on any card — it lands in your playlist over here', targets: ['.playlist-pane'] },
    { text: 'Name it, tweak the order, and save it to Jellyfin', targets: ['.pl-form'] }
];

let tourIndex = 0;
let tourTimer = null;
let tourOpenedRefine = false;

function fakeDemoCards() {
    return `
        <div class="item-card tour-fake" aria-hidden="true">
            <div class="card-actions"><span class="card-btn add-btn"><i class="fas fa-plus"></i></span></div>
            <div class="item-image item-placeholder tour-poster tour-poster-a"><span class="tour-poster-title">★ Five Star Movie ★</span></div>
            <div class="item-body">
                <div class="item-title">Five Star Movie</div>
                <div class="item-rating"><i class="fas fa-star"></i> 9.5/10</div>
                <div class="item-type">Movie<span class="lib-chip">Movies</span></div>
            </div>
        </div>
        <div class="item-card tour-fake" aria-hidden="true">
            <div class="card-actions"><span class="card-btn add-btn"><i class="fas fa-plus"></i></span></div>
            <div class="item-image item-placeholder tour-poster tour-poster-b"><span class="tour-poster-title"><i class="fas fa-magnifying-glass fa-2x"></i></span></div>
            <div class="item-body">
                <div class="item-title">The Show I'm Looking For</div>
                <div class="item-year">Released: 2026</div>
                <div class="item-type">TV Series<span class="lib-chip">TV Shows</span></div>
            </div>
        </div>`;
}

function startTour() {
    tourIndex = 0;
    tourBanner.hidden = false;
    showTourStep();
}

function showTourStep() {
    document.querySelectorAll('.tour-flash').forEach(el => el.classList.remove('tour-flash'));
    if (tourIndex > 4) {
        document.querySelectorAll('.tour-fake').forEach(el => el.remove());
    }

    const step = TOUR_STEPS[tourIndex];
    tourStepEl.textContent = `${tourIndex + 1}/${TOUR_STEPS.length}`;
    tourTextEl.textContent = step.text;
    tourBanner.classList.remove('tour-in');
    void tourBanner.offsetWidth;
    tourBanner.classList.add('tour-in');
    tourPrevBtn.disabled = tourIndex === 0;
    tourNextBtn.textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

    if (tourIndex === 3) {
        if (!resultsContainer.querySelector('.tour-fake')) {
            resultsContainer.insertAdjacentHTML('afterbegin', fakeDemoCards());
        }
        document.querySelectorAll('.tour-fake.static').forEach(el => el.classList.remove('static'));
    } else if (tourIndex === 4) {
        if (!resultsContainer.querySelector('.tour-fake')) {
            resultsContainer.insertAdjacentHTML('afterbegin', fakeDemoCards());
        }
        document.querySelectorAll('.tour-fake').forEach(el => el.classList.add('static'));
    }

    if (tourIndex === 4) {
        refinePopover.hidden = false;
        tourOpenedRefine = true;
    } else if (tourOpenedRefine) {
        refinePopover.hidden = true;
        tourOpenedRefine = false;
    }

    step.targets.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.classList.remove('tour-flash');
            void el.offsetWidth;
            el.classList.add('tour-flash');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });

    clearTimeout(tourTimer);
    tourTimer = setTimeout(nextTourStep, 3200);
}

function nextTourStep() {
    if (tourIndex < TOUR_STEPS.length - 1) {
        tourIndex++;
        showTourStep();
    } else {
        endTour();
    }
}

function prevTourStep() {
    if (tourIndex > 0) {
        tourIndex--;
        showTourStep();
    }
}

function endTour() {
    clearTimeout(tourTimer);
    tourTimer = null;
    document.querySelectorAll('.tour-flash').forEach(el => el.classList.remove('tour-flash'));
    document.querySelectorAll('.tour-fake').forEach(el => el.remove());
    if (tourOpenedRefine) {
        refinePopover.hidden = true;
        tourOpenedRefine = false;
    }
    tourBanner.hidden = true;
}

// ---------- Status ----------
function showStatusMessage(message, type) {
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.setAttribute('role', 'alert');
    wrapper.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    statusMessages.insertAdjacentHTML('afterbegin', wrapper.outerHTML);

    setTimeout(() => {
        const first = statusMessages.querySelector('.alert');
        if (first) first.remove();
    }, 5000);
}
