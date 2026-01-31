# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cerebr is a browser extension (Chrome/Firefox/Edge) that provides an AI assistant sidebar for chatting with Claude, OpenAI, and other OpenAI-compatible APIs. It supports webpage Q&A, PDF document analysis, YouTube transcript extraction, and image analysis. The same codebase also works as a standalone web application deployable to Vercel, Cloudflare Pages, or GitHub Pages.

**Tech Stack:** Vanilla JavaScript (no build step), Chrome Extension Manifest V3, PDF.js, KaTeX, Marked.js

**Current Version:** 2.4.5

## Development Commands

This project has no build step. To test changes:

1. **Chrome/Edge:**
   - Navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked" and select the repository root directory
   - Reload the extension after making changes

2. **Firefox:**
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.firefox.json` from the repository root
   - Note: Firefox uses a separate manifest file with different permissions

3. **Web Version (Local):**
   - Open `index.html` directly in a browser
   - Or serve via any static file server (e.g., `python -m http.server`)

## Architecture Overview

### Three-Layer Extension Architecture

1. **Background Script (`background.js`)** - Service Worker
   - Central message router between content scripts and sidebar
   - Manages PDF.js injection on-demand (only when needed to avoid loading 300KB+ on every page)
   - Caches YouTube timedtext URLs from webRequest API (10-minute TTL, max 200 entries)
   - Handles PDF downloads with chunked transfer (4MB chunks) to avoid Chrome's 77MB limit
   - Provides cross-tab communication via `chrome.tabs.sendMessage`

2. **Content Script (`content.js`)** - Injected into every page
   - Creates isolated sidebar using Shadow DOM (closed mode)
   - Manages sidebar state (visibility, width) with per-site persistence (eTLD+2 granularity)
   - Implements drag-to-resize (300-800px range, double-click to reset)
   - Extracts page content on-demand (PDF, YouTube transcripts, general web pages)
   - Handles drag-and-drop images into sidebar
   - Uses MutationObserver to prevent sidebar removal by page scripts

3. **Sidebar UI (`index.html` + `src/main.js`)** - iframe inside Shadow DOM
   - Full-featured chat interface with message history, input, settings
   - Communicates with content script via `window.postMessage`
   - Manages chat state, API configurations, and user preferences

### Message Flow

**Three Communication Channels:**

1. **Background ↔ Content Script** (`chrome.runtime.sendMessage`)
   - `ENSURE_PDFJS` - Inject PDF.js library
   - `GET_PAGE_CONTENT_FROM_SIDEBAR` - Request page content extraction
   - `FETCH_YOUTUBE_TIMEDTEXT` - Fetch YouTube captions
   - `TOGGLE_SIDEBAR_*` - Toggle sidebar visibility
   - `NEW_CHAT` - Create new chat (keyboard shortcut)
   - `PING/PONG` - Health check

2. **Content Script ↔ Sidebar iframe** (`window.postMessage`)
   - `FOCUS_INPUT` - Focus input when sidebar opens
   - `DROP_IMAGE` - Handle drag-and-drop images
   - `UPDATE_PLACEHOLDER` - Update input placeholder during PDF processing
   - `NEW_CHAT` - Trigger new chat from keyboard shortcut

3. **Sidebar ↔ Background** (via content script relay)
   - API calls routed through background for CORS bypass
   - Tab management queries
   - Storage operations for large data

### Storage Architecture

**Dual Storage Strategy:**
- **IndexedDB** (`idbGetMany`, `idbSetMany`): Chat history, reading progress, YouTube transcripts
- **chrome.storage.local**: Small metadata (current chat ID, webpage switches, drafts)
- **chrome.storage.sync**: API configs, theme, font scale, sidebar width (cross-device sync, 8KB quota)

**V2 Sharded Chat Storage:**
- Each chat stored separately as `cerebr_chat_v2_{chatId}` to avoid 77MB monolithic writes
- Index stored as `cerebr_chats_index_v2` (array of chat IDs)
- Incremental persistence using `requestIdleCallback` (saves one dirty chat per tick)
- Auto-migrates from legacy `cerebr_chats` (all chats in one key) to V2 format

**Tab-Scoped Current Chat:**
- Each browser tab remembers its own active chat: `cerebr_current_chat_id_v1_tab_{tabId}`
- Fallback chain: Tab-scoped → Last active (cross-tab) → Most recent (by updatedAt) → Legacy global key

### Content Extraction

**Three Content Types:**

1. **General Web Pages** (`content.js:extractPageContent`)
   - Clones `document.body`, removes scripts/styles/nav/footer
   - Syncs form element values to cloned nodes
   - Extracts iframe content (same-origin only)
   - 15-second cache to avoid re-extraction on rapid queries

2. **PDF Files** (`content.js:extractTextFromPDF`)
   - Detects PDF via `document.contentType` or URL pattern
   - Downloads via background script (chunked transfer)
   - Uses PDF.js with dedicated worker per extraction
   - Validates PDF header (`%PDF-`) to catch HTML redirects
   - Caches extracted text (3 entries, max 1M chars)

3. **YouTube Transcripts** (`content.js:extractYouTubeTranscriptText`)
   - Captures timedtext URL from webRequest (background script)
   - Parses JSON3 format (events → segs → utf8)
   - Caches per video+language: `cerebr_youtube_transcript_v1_{videoId}_{lang}`
   - Garbage collection: removes transcripts when all referencing chats are deleted

### Chat Functionality

**API Call Flow** (`src/services/chat.js`):
- Supports OpenAI-compatible streaming APIs
- Normalizes messages (removes internal fields like `reasoning_content`, `updating`)
- Injects system prompt with webpage context (if enabled)
- Handles streaming with 100ms throttled UI updates
- Implements retry logic for empty responses and Gemini "misfiled reasoning" detection
- AbortController for cancellation (exposed before fetch starts)

**Message Rendering** (`src/handlers/message-handler.js`):
- Incremental rendering with `processMathAndMarkdown()` (marked.js + KaTeX)
- Auto-scroll with user pause detection (scrolling up pauses, scrolling to bottom resumes)
- Typing indicator for "first token" delay
- Code block enhancement with hover-to-copy
- Reasoning content (o1-style thinking) with collapsible UI

## Key Design Patterns

1. **Shadow DOM Isolation**: Sidebar uses closed Shadow DOM to prevent page scripts from interfering. Custom elements with frozen `remove()` method and MutationObserver to auto-restore if removed.

2. **Site-Specific Overrides**: Sidebar width and font scale stored per-site using eTLD+2 granularity (e.g., `github.com` → `github.com`). Handles multi-part TLDs (`.co.uk`, `.com.au`, `.co.jp`).

3. **Webpage Content Switches**: Each chat remembers which tabs' content to include. Stored as `cerebr_webpage_switches_v1_{chatId}` → `{ [tabId]: boolean }`. UI shows tab groups with indeterminate checkboxes.

4. **Lazy PDF.js Injection**: Background script only injects 300KB library when user opens a PDF. Tracks injected tabs and cleans up on tab close/reload.

5. **Incremental Persistence**: Saves one dirty chat per `requestIdleCallback` tick to avoid blocking UI with large writes.

6. **Auto-Scroll with User Pause Detection**: Tracks scroll direction (upward = pause, bottom = resume). Uses `requestAnimationFrame` for smooth scrolling.

## File Organization

```
K:\Cerebr/
├── manifest.json              # Extension manifest (Chrome/Edge, MV3)
├── manifest.firefox.json      # Firefox-specific manifest
├── background.js              # Service worker (message router, PDF handler)
├── content.js                 # Content script (sidebar, page extraction)
├── index.html                 # Sidebar UI shell
├── src/
│   ├── main.js                # Sidebar app entry point
│   ├── components/            # UI components
│   │   ├── chat-container.js  # Message list management
│   │   ├── chat-list.js       # Chat history sidebar
│   │   ├── message-input.js   # Input box with image support
│   │   ├── webpage-menu.js    # Tab selection UI
│   │   ├── api-card.js        # API config cards
│   │   └── context-menu.js    # Right-click menu
│   ├── handlers/
│   │   └── message-handler.js # Message rendering (markdown, LaTeX, code)
│   ├── services/
│   │   └── chat.js            # API call logic (streaming, retry)
│   └── utils/
│       ├── chat-manager.js    # Chat CRUD + persistence
│       ├── storage-adapter.js # IndexedDB + chrome.storage abstraction
│       ├── webpage-switches.js# Per-chat tab selection state
│       ├── reading-progress.js# Scroll position tracking
│       ├── i18n.js            # Internationalization
│       └── ...                # Theme, UI helpers, etc.
├── lib/
│   ├── pdf.js                 # PDF.js library
│   └── pdf.worker.js          # PDF.js worker
├── htmd/                      # Markdown/LaTeX rendering
│   ├── marked.min.js
│   ├── highlight.min.js
│   └── ...
├── _locales/                  # i18n translations
│   ├── en/messages.json
│   ├── zh_CN/messages.json
│   └── zh_TW/messages.json
└── styles/                    # CSS files
```

## Important Notes

- **No Build Step**: Pure JavaScript/CSS for easy debugging and contribution. All changes are immediately testable by reloading the extension.

- **Extension + Web Dual Mode**: Same codebase works as extension and standalone web app. Use `isExtensionEnvironment` flag to detect mode.

- **Storage Limits**: Chrome has a 77MB write limit for `chrome.storage.local`. This is why chats are sharded into separate keys.

- **Manifest V3**: Uses service worker instead of background page. No persistent background context.

- **i18n**: All user-facing strings should use the translation system (`t('key')` in sidebar, `__MSG_key__` in manifest). Translation files are in `_locales/`.

- **Version Bumping**: Update version in both `manifest.json` and `manifest.firefox.json` when releasing.

- **Streaming**: All API calls use SSE streaming. The UI throttles updates to 100ms intervals to avoid excessive DOM manipulation.

- **Content Extraction**: Never auto-extract on page load. Wait for user to enable webpage Q&A switch or explicitly query the page.

- **PDF Handling**: Always validate PDF header (`%PDF-`) before parsing. Some servers return HTML error pages with PDF MIME type.

- **YouTube Transcripts**: Rely on background script's webRequest cache for signed URLs. Don't try to construct timedtext URLs manually (they require signatures).
