# Product Guidelines - LTX Desktop

## Design Principles

### 1. Local-First, API-Fallback
- Prioritize local generation when hardware supports it
- API mode should be seamless fallback, not second-class experience
- Clear user communication about which mode is active

### 2. Progressive Disclosure
- Start simple, reveal complexity as needed
- Default settings should work for most users
- Advanced options available but not overwhelming

### 3. Transparency
- Show users what's happening (model downloads, generation progress)
- Clear indication of local vs API operations
- Visible system requirements and limitations upfront

### 4. Performance Awareness
- Heavy operations should not block UI
- Progress indicators for all long-running tasks
- Graceful degradation when resources are constrained

## User Experience Guidelines

### First-Run Experience
- Clear, guided setup process
- Explain local vs API mode requirements
- API key setup should be straightforward
- Model license review when applicable

### Generation Workflow
- Prompt input should be primary focus
- Clear parameter controls with sensible defaults
- Preview capabilities before committing to generation
- Progress feedback throughout process

### Video Editor
- Timeline-based editing with gap fill
- Project-based workflow for organization
- Non-destructive editing principles
- Clear export options

### Settings & Configuration
- Group related settings logically
- Clear descriptions for each setting
- Default values that work out of the box
- Easy access to API key management

## Technical Guidelines

### Component Reuse
- Always prefer existing components before building new ones
- Follow priority: UI primitives -> Shared components -> Installed libraries -> New dependencies
- Never hand-roll complex interaction patterns when vetted library exists

### State Management
- React Context only - no external state libraries
- Keep state as local as possible
- Lift state only when necessary for sharing

### Backend Communication
- Always use `backendFetch` - never direct `fetch` to backend
- Centralize API calls in frontend/lib/backend.ts
- Attach auth/session details automatically

### Testing Strategy
- Integration-first for backend
- No mocks in backend tests - use fakes
- No frontend tests currently (future consideration)

## Privacy & Security

### Data Handling
- API keys stored locally only - treat as secrets
- No personal information collected in telemetry
- Generated content never leaves device unless using API

### Telemetry
- Minimal, anonymous usage analytics
- Random installation ID only
- Easy opt-out in Settings > General > Anonymous Analytics

### Sandboxing
- Renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`)
- All IPC through controlled preload bridge
- Security boundaries clearly maintained

## Platform Considerations

### Windows/Linux (Local Mode)
- Full local generation capabilities
- Model weights downloaded locally
- Requires significant disk space (160GB+)
- >=32GB VRAM requirement clearly communicated

### macOS/API Mode
- API-only operation
- Clear indication that API key is required
- Resolution/duration limitations communicated
- Paid usage clearly indicated

### Cross-Platform Consistency
- Same core experience across platforms
- Platform-specific limitations clearly communicated
- Installer process appropriate for each platform

## Contributing Guidelines

### Beta Status Awareness
- Frontend under active refactor
- Large UI PRs may be declined
- Check CONTRIBUTING.md before submitting

### Code Quality Standards
- TypeScript strict mode
- Python Pyright strict mode
- All CI checks must pass

### Change Request Process
- Use formal change request workflow
- `/change_request <title>` before implementation
- HLD and implementation plan required
- User approval gating
