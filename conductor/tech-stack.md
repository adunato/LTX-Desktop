# Tech Stack - LTX Desktop

## Architecture Overview

LTX Desktop uses a three-layer architecture:

```
Renderer (React + TS) --> Backend (FastAPI + Python) --> Local models + GPU / External APIs
       |
       v
Electron main (TS) --> OS integration (files, dialogs, ffmpeg, process mgmt)
```

## Layer 1: Frontend (Renderer)

**Location**: `frontend/`

### Core Stack
- **React 18** - UI framework
- **TypeScript** - Type-safe development (strict mode)
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS + Autoprefixer** - CSS processing

### State Management
- **React Context** only - No Redux/Zustand
  - `ProjectContext` - Project state and view routing
  - `AppSettingsContext` - Application settings
  - `KeyboardShortcutsContext` - Keyboard shortcut handling

### Routing
- View-based routing via `ProjectContext`
- Views: `home`, `project`, `playground`

### Key Dependencies
| Package | Purpose |
|---------|---------|
| `class-variance-authority` | Component variant management |
| `clsx` + `tailwind-merge` | Conditional className utilities |
| `cmdk` | Command palette / searchable combobox |
| `lucide-react` | Icon library |
| `react-dropzone` | File drag-and-drop |
| `electron-updater` | Auto-update functionality |

### Path Aliases
- `@/*` maps to `frontend/*`

### Component Structure
- `frontend/components/ui/` - Reusable UI primitives (button, select, textarea, etc.)
- `frontend/components/` - Shared project components (modals, dialogs, panels)
- `frontend/views/` - Page-level view components
- `frontend/lib/` - Utilities and shared logic
- `frontend/types/` - TypeScript type definitions

### Communication
- **Backend**: HTTP calls to `http://localhost:8000` via `backendFetch` from `frontend/lib/backend.ts`
- **Electron**: IPC via `window.electronAPI` (defined in `electron/preload.ts`)

## Layer 2: Electron (Main Process)

**Location**: `electron/`

### Stack
- **Electron 41+** - Desktop app framework
- **TypeScript** - Compiled to `dist-electron/`
- **Vite Plugin Electron** - Integration with Vite

### Responsibilities
- App lifecycle management
- IPC bridge between renderer and OS
- Python backend process management
- Native file dialogs
- Video export via ffmpeg
- OS integration (dock, tray, notifications)

### Security
- `contextIsolation: true`
- `nodeIntegration: false`
- Sandboxed renderer with preload script (CommonJS)

### Key Files
- `electron/main.ts` - Main process entry point
- `electron/preload.ts` - Preload script exposing `window.electronAPI`

## Layer 3: Backend (Python)

**Location**: `backend/`

### Stack
- **Python 3.13+** - Runtime (managed with `uv`)
- **FastAPI** - Web framework
- **Pyright** - Type checking (strict mode)

### Architecture
Request flow: `_routes/* (thin) -> AppHandler -> handlers/* (logic) -> services/* (side effects) + state/* (mutations)`

### Key Patterns
- **Routes** (`_routes/`): Thin plumbing - parse input, call handler, return typed output
- **AppHandler** (`app_handler.py`): Single composition root owning all sub-handlers, state, and lock
- **State** (`state/`): Centralized `AppState` with discriminated union types for state machines
- **Services** (`services/`): Protocol interfaces with real and fake test implementations
- **Concurrency**: Thread pool with shared `RLock` - pattern: lock->read/validate->unlock->heavy work->lock->write

### Key Dependencies
- FastAPI + Starlette
- PyTorch (for GPU operations)
- Various ML libraries (see `backend/pyproject.toml`)

### Testing
- Integration-first using Starlette `TestClient`
- No mocks - fakes via `ServiceBundle` only
- Fakes in `tests/fakes/`, wired via `conftest.py`
- Pyright strict mode enforced as test (`test_pyright.py`)

## Build & DevOps

### Package Manager
- **pnpm 10.30.3** - Node.js package manager

### Development Scripts
| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start dev server (Vite + Electron + Python backend) |
| `pnpm dev:debug` | Dev with Electron inspector + Python debugpy |
| `pnpm typecheck` | Run TypeScript and Python type checks |
| `pnpm backend:test` | Run Python pytest tests |
| `pnpm build` | Full platform build (auto-detects platform) |
| `pnpm setup:dev` | One-time dev environment setup |

### CI Checks (PR Requirements)
- `pnpm typecheck`
- `pnpm backend:test`
- Frontend Vite build

### Distribution
- **electron-builder** - Packaging and installer creation
- Platform-specific installers (Windows, macOS, Linux)
