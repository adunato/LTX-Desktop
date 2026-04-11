# Development Workflow - LTX Desktop

## Getting Started

### Prerequisites
- Node.js
- `uv` (Python package manager)
- Python 3.12+
- Git

### Initial Setup
```bash
pnpm setup:dev
```

### Development
```bash
pnpm dev          # Start dev server (Vite + Electron + Python backend)
pnpm dev:debug    # Dev with Electron inspector + Python debugpy
```

## Code Quality

### Type Checking
```bash
pnpm typecheck         # Run both TypeScript and Python type checks
pnpm typecheck:ts      # TypeScript only (tsc --noEmit)
pnpm typecheck:py      # Python pyright only
```

### Testing
```bash
pnpm backend:test      # Run Python pytest tests
pnpm backend:test -- tests/test_specific.py  # Run specific test file
```

### CI Requirements
All PRs must pass:
1. `pnpm typecheck`
2. `pnpm backend:test`
3. Frontend Vite build

## Change Control Process

This project uses a formal change request workflow:

1. **Start any new task**: Invoke `/change_request <title>` before writing implementation code
2. **Change request handling**: Creates numbered folder, HLD drafting, implementation plan, git branch setup
3. **Active change requests**: Live in `change-requests/` directory
4. **Implementation guidance**: Consult `IMPLEMENTATION_PLAN.md` of the active CR

### Git Workflow
- Commit after each meaningful change
- Use `git status && git diff HEAD && git log -n 3` to review changes
- Propose commit message, commit once change is verified
- Do not leave uncommitted working tree state between tasks

## Backend Development

### Adding a Backend Feature
1. Define request/response models in `api_types.py`
2. Add endpoint in `_routes/<domain>.py` delegating to handler
3. Implement logic in `handlers/<domain>_handler.py` with lock-aware state transitions
4. If new heavy side effect needed, add service in `services/` with Protocol + real + fake implementations
5. Add integration test in `tests/` using fake services

### Testing Strategy
- Integration-first using Starlette `TestClient` against real FastAPI app
- **No mocks**: `test_no_mock_usage.py` enforces no `unittest.mock`
- Swap services via `ServiceBundle` fakes only
- Fakes live in `tests/fakes/`
- `conftest.py` wires fresh `AppHandler` per test

### Concurrency Pattern
- Thread pool with shared `RLock`
- Pattern: `lock -> read/validate -> unlock -> heavy work -> lock -> write`
- Never hold lock during heavy compute/IO

### Exception Handling
- Boundary-owned traceback policy
- Handlers raise `HTTPError` with `from exc` chaining
- `app_factory.py` owns logging
- Don't `logger.exception()` then rethrow

## Frontend Development

### Component Reuse Priority
When implementing UI features, follow this priority:
1. **Project UI components** (`frontend/components/ui/`) - Check first
2. **Shared project components** (`frontend/components/`) - Reuse existing
3. **Installed libraries** - Use already-installed packages
4. **New library proposals** - Only if first three options insufficient

### State Management
- React Context only - No Redux/Zustand
- `ProjectContext`, `AppSettingsContext`, `KeyboardShortcutsContext`

### Backend Communication
- Always use `backendFetch` from `frontend/lib/backend.ts`
- Do NOT call `fetch` directly for backend endpoints

## Building

### Full Build
```bash
pnpm build           # Auto-detects platform
pnpm build:fast      # Unpack + skip Python for faster iteration
pnpm build:skip-python  # Skip Python entirely
```

### Frontend Only
```bash
pnpm build:frontend  # Vite frontend build only
```

### Installer Building
- See `docs/INSTALLER.md` for installer-specific instructions

## Debugging

### Development Debug
```bash
pnpm dev:debug
```
- Starts Electron with inspector enabled
- Starts Python backend with `debugpy`

### Data Locations for Debugging
- **Windows**: `%LOCALAPPDATA%\LTXDesktop\`
- **macOS**: `~/Library/Application Support/LTXDesktop/`
- **Linux**: `$XDG_DATA_HOME/LTXDesktop/`
