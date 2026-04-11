# Project Workflow

## Agent Routing

This project uses specialized agents for each phase of the workflow. When executing a task, follow the agent routing below. Reference the agent file in `.qwen/agents/<agent>.md` for role-specific context, style rules, and constraints.

| Workflow Step | Agent | Notes |
|---|---|---|
| **Task Selection & Test Design** (Steps 1-2) | **planner-agent** | `.qwen/agents/planner-agent.md` — Read `plan.md`, identify next task, design test cases |
| **Write Failing Tests** (Step 3 — Red Phase) | **planner-agent** → **test-suite-executor** | planner-agent designs tests; test-suite-executor verifies test structure before implementation |
| **Implement Code** (Steps 4-5 — Green/Refactor) | **python-tdd-implementer** (backend) or **typescript-implementer** (frontend/Electron) | `.qwen/agents/python-tdd-implementer.md` for backend Python. `.qwen/agents/typescript-implementer.md` for frontend (React/TSX) and Electron (TS). |
| **Verify Coverage & Types** (Step 6) | **test-suite-executor** | `.qwen/agents/test-suite-executor.md` — Run `pnpm backend:test`, `pnpm typecheck`, verify >80% backend coverage |
| **Commit & Document** (Steps 8-11) | **phase-checkpoint-reviewer** | `.qwen/agents/phase-checkpoint-reviewer.md` — Verify commit message format, git notes, plan updates |
| **Phase Checkpoint** (Phase Completion Protocol) | **test-suite-executor** → **phase-checkpoint-reviewer** | test-suite-executor runs full suite + creates missing tests; phase-checkpoint-reviewer generates manual verification plan and manages checkpoint commit |

**Routing Decision Logic:**
- If the task modifies **backend Python files** (`backend/**/*.py`): use **python-tdd-implementer**
- If the task modifies **frontend TypeScript/TSX files** (`frontend/**/*.ts`, `frontend/**/*.tsx`): use **typescript-implementer** (follows React Context, Tailwind, component reuse priority conventions)
- If the task modifies **Electron TypeScript files** (`electron/**/*.ts`): use **typescript-implementer** (follows IPC via preload, CommonJS preload script conventions)
- If the task modifies **both layers**: sequence backend first (API contract), then frontend (consumer)
- All testing, coverage verification, and review steps use their respective agents regardless of layer

---

## Guiding Principles

1. **The Plan is the Source of Truth:** All work must be tracked in `plan.md`
2. **The Tech Stack is Deliberate:** Changes to the tech stack must be documented in `tech-stack.md` *before* implementation
3. **Test-Driven Development:** Write unit tests before implementing functionality
4. **High Code Coverage:** Aim for >80% code coverage for all modules
5. **User Experience First:** Every decision should prioritize user experience
6. **Non-Interactive & CI-Aware:** Prefer non-interactive commands. Use `CI=true` for watch-mode tools (tests, linters) to ensure single execution.

## Task Workflow

All tasks follow a strict lifecycle:

### Track Branch Management

**At the Start of a Track:**
- Create a dedicated branch for the track using the naming convention: `track/<track_id>`
- Command: `git checkout -b track/<track_id>`
- All work for this track must be committed to this branch
- This isolates track work from the main branch and enables clean PR reviews

**At Track Completion:**
- Once all phases of a track are complete and the final checkpoint is created, the agent must:
  1. Push the track branch to the remote: `git push -u origin track/<track_id>`
  2. Create a Pull Request targeting the `main` branch
  3. Present the PR link and summary to the user
  4. **Ask for explicit confirmation before merging:** "The track `<track_id>` is complete. A PR has been created at `<PR_URL>`. Would you like me to merge this PR into `main`? Please confirm with yes or provide feedback."
  5. Only merge after receiving explicit user approval

### Standard Task Workflow

> **Agent: planner-agent** — Execute Steps 1-2. Read `plan.md`, select next task, mark as `[~]`. Design test cases per `.qwen/agents/planner-agent.md`.

1. **Select Task:** Choose the next available task from `plan.md` in sequential order

2. **Mark In Progress:** Before beginning work, edit `plan.md` and change the task from `[ ]` to `[~]`

> **Agent: planner-agent** → **test-suite-executor** — Step 3. planner-agent designs test cases; implement them following test-suite-executor agent conventions.

3. **Write Failing Tests (Red Phase):**
   - Create a new test file for the feature or bug fix.
   - Write one or more unit tests that clearly define the expected behavior and acceptance criteria for the task.
   - **CRITICAL:** Run the tests and confirm that they fail as expected. This is the "Red" phase of TDD. Do not proceed until you have failing tests.

> **Agent: go-implementer** or **python-tdd-implementer** — Steps 4-5. Route by file extension. Follow the agent's style guide from `.qwen/agents/`.

4. **Implement to Pass Tests (Green Phase):**
   - Write the minimum amount of application code necessary to make the failing tests pass.
   - Run the test suite again and confirm that all tests now pass. This is the "Green" phase.

5. **Refactor (Optional but Recommended):**
   - With the safety of passing tests, refactor the implementation code and the test code to improve clarity, remove duplication, and enhance performance without changing the external behavior.
   - Rerun tests to ensure they still pass after refactoring.

> **Agent: test-suite-executor** — Step 6. Execute coverage verification per `.qwen/agents/test-suite-executor.md`.

6. **Verify Coverage:** Run coverage reports using the project's chosen tools. For example, in a Python project, this might look like:
   ```bash
   pytest --cov=app --cov-report=html
   ```
   Target: >80% coverage for new code. The specific tools and commands will vary by language and framework.

> **Agent: phase-checkpoint-reviewer** — Steps 8-11. Verify commit format, git notes, and plan updates per `.qwen/agents/phase-checkpoint-reviewer.md`.

7. **Document Deviations:** If implementation differs from tech stack:
   - **STOP** implementation
   - Update `tech-stack.md` with new design
   - Add dated note explaining the change
   - Resume implementation

8. **Commit Code Changes:**
   - Stage all code changes related to the task.
   - Propose a clear, concise commit message e.g, `feat(ui): Create basic HTML structure for calculator`.
   - Perform the commit.

9. **Attach Task Summary with Git Notes:**
   - **Step 9.1: Get Commit Hash:** Obtain the hash of the *just-completed commit* (`git log -1 --format="%H"`).
   - **Step 9.2: Draft Note Content:** Create a detailed summary for the completed task. This should include the task name, a summary of changes, a list of all created/modified files, and the core "why" for the change.
   - **Step 9.3: Attach Note:** Use the `git notes` command to attach the summary to the commit.
     ```bash
     # The note content from the previous step is passed via the -m flag.
     git notes add -m "<note content>" <commit_hash>
     ```

10. **Get and Record Task Commit SHA:**
    - **Step 10.1: Update Plan:** Read `plan.md`, find the line for the completed task, update its status from `[~]` to `[x]`, and append the first 7 characters of the *just-completed commit's* commit hash.
    - **Step 10.2: Write Plan:** Write the updated content back to `plan.md`.

11. **Commit Plan Update:**
    - **Action:** Stage the modified `plan.md` file.
    - **Action:** Commit this change with a descriptive message (e.g., `conductor(plan): Mark task 'Create user model' as complete`).

### Phase Completion Verification and Checkpointing Protocol

> **Agent: test-suite-executor** → **phase-checkpoint-reviewer** — test-suite-executor executes Steps 2-3 (test coverage, debugging); phase-checkpoint-reviewer executes Steps 4-10 (manual verification plan, checkpoint commit, git notes).

**Trigger:** This protocol is executed immediately after a task is completed that also concludes a phase in `plan.md`.

**Track Completion:** When the final phase of a track is complete, follow the [Track Branch Management](#track-branch-management) workflow to create a PR and await user confirmation before merging.

1.  **Announce Protocol Start:** Inform the user that the phase is complete and the verification and checkpointing protocol has begun.

2.  **Ensure Test Coverage for Phase Changes:**
    -   **Step 2.1: Determine Phase Scope:** To identify the files changed in this phase, you must first find the starting point. Read `plan.md` to find the Git commit SHA of the *previous* phase's checkpoint. If no previous checkpoint exists, the scope is all changes since the first commit.
    -   **Step 2.2: List Changed Files:** Execute `git diff --name-only <previous_checkpoint_sha> HEAD` to get a precise list of all files modified during this phase.
    -   **Step 2.3: Verify and Create Tests:** For each file in the list:
        -   **CRITICAL:** First, check its extension. Exclude non-code files (e.g., `.json`, `.md`, `.yaml`).
        -   For each remaining code file, verify a corresponding test file exists.
        -   If a test file is missing, you **must** create one. Before writing the test, **first, analyze other test files in the repository to determine the correct naming convention and testing style.** The new tests **must** validate the functionality described in this phase's tasks (`plan.md`).

3.  **Execute Automated Tests with Proactive Debugging:**
    -   Before execution, you **must** announce the exact shell command you will use to run the tests.
    -   **Example Announcement:** "I will now run the automated test suite to verify the phase. **Command:** `CI=true npm test`"
    -   Execute the announced command.
    -   If tests fail, you **must** inform the user and begin debugging. You may attempt to propose a fix a **maximum of two times**. If the tests still fail after your second proposed fix, you **must stop**, report the persistent failure, and ask the user for guidance.

4.  **Determine if Human End-to-End Testing is Required:**
    -   **CRITICAL — DEFER UNTIL FINAL PHASE:** User manual / end-to-end verification **MUST NOT** be performed for intermediate phases of a multi-phase track. It is **only** permitted during the **final phase** of a track, unless the planner explicitly documents a justification for why earlier phases *cannot* be verified through automated tests alone.
    -   **For intermediate phases:** The agent MUST auto-approve this step and proceed directly to Step 6 (Create Checkpoint Commit). Inform the user: "This is an intermediate phase. User manual verification is deferred until the final phase per workflow policy. All changes are verified through automated tests. Auto-approving and proceeding to checkpoint."
    -   **For the final phase only:** Analyze the completed phase to determine whether a human needs to manually run the application and verify behavior end-to-end through the LTX Desktop app.
    -   **Human E2E Testing IS Required When (Final Phase Only):**
        -   New or significantly altered user workflows in the running application (e.g., video generation flows, project management, settings)
        -   Changes where automated tests cannot fully validate the user experience (e.g., layout feel, color readability, interaction smoothness)
        -   First integration of a major feature where the agent cannot verify correctness through unit/integration tests alone
    -   **Human E2E Testing is NOT Required (All Phases):**
        -   The feature is fully covered by automated tests (unit + integration) and the agent has verified all tests pass
        -   Backend-only changes (API endpoints, handlers, services, state management)
        -   Refactoring without behavioral changes
        -   Test-only additions
        -   Documentation updates
        -   Configuration changes with no user-visible impact
        -   Any change where the agent can confidently verify correctness through automated means
    -   **If Human E2E Testing is NOT Required:** The agent MUST auto-approve this step and proceed directly to Step 6 (Create Checkpoint Commit). Inform the user: "This phase does not require human end-to-end testing. All changes are verified through automated tests. Auto-approving and proceeding to checkpoint."

5.  **Propose a Detailed, Actionable Manual Verification Plan (Human E2E Testing Required Only):**
    -   **CRITICAL:** To generate the plan, first analyze `product.md`, `product-guidelines.md`, and `plan.md` to determine the user-facing goals of the completed phase.
    -   **Before presenting the plan to the user, you MUST build the application:**
        -   Run `pnpm build:frontend` to ensure the frontend builds successfully.
        -   Run `pnpm typecheck` to verify no type errors exist.
        -   If the build fails, debug and fix before proceeding.
    -   You **must** generate a step-by-step plan that walks the user through running the app (`pnpm dev`) and verifying the completed work end-to-end, including specific expected outcomes.
    -   The plan you present to the user **must** follow this format:

        **For a Frontend/Application Change:**
        ```
        The automated tests have passed and the frontend has been built. For manual end-to-end verification, please follow these steps:

        **Manual Verification Steps:**
        1.  **Start the app:** `pnpm dev`
        2.  **Confirm that you see:** <expected visual behavior in the app>
        3.  **Interact with <feature> and confirm:** <expected response>
        ```

        **For a Backend-Only Change (when human testing is still requested):**
        ```
        The automated tests have passed. For manual verification, please follow these steps:

        **Manual Verification Steps:**
        1.  **Start the dev environment:** `pnpm dev` (includes backend)
        2.  **Trigger the endpoint via:** <method — UI action or API call>
        3.  **Confirm that you receive:** <expected output/state change>
        ```

6.  **Await Explicit User Feedback (Human E2E Testing Required Only):**
    -   After presenting the detailed plan, ask the user for confirmation: "**Does this meet your expectations? Please confirm with yes or provide feedback on what needs to be changed.**"
    -   **PAUSE** and await the user's response. Do not proceed without an explicit yes or confirmation.
    -   **If human E2E testing was auto-approved (Step 4):** Skip this step entirely and proceed to Step 7.

7.  **Create Checkpoint Commit:**
    -   Stage all changes. If no changes occurred in this step, proceed with an empty commit.
    -   Perform the commit with a clear and concise message (e.g., `conductor(checkpoint): Checkpoint end of Phase X`).

8.  **Attach Auditable Verification Report using Git Notes:**
    -   **Step 8.1: Draft Note Content:** Create a detailed verification report including the automated test command, the manual verification steps (if applicable), and the user's confirmation (or auto-approval note).
    -   **Step 8.2: Attach Note:** Use the `git notes` command and the full commit hash from the previous step to attach the full report to the checkpoint commit.

9.  **Get and Record Phase Checkpoint SHA:**
    -   **Step 9.1: Get Commit Hash:** Obtain the hash of the *just-created checkpoint commit* (`git log -1 --format="%H"`).
    -   **Step 9.2: Update Plan:** Read `plan.md`, find the heading for the completed phase, and append the first 7 characters of the commit hash in the format `[checkpoint: <sha>]`.
    -   **Step 9.3: Write Plan:** Write the updated content back to `plan.md`.

10. **Commit Plan Update:**
    - **Action:** Stage the modified `plan.md` file.
    - **Action:** Commit this change with a descriptive message following the format `conductor(plan): Mark phase '<PHASE NAME>' as complete`.

11.  **Announce Completion:** Inform the user that the phase is complete and the checkpoint has been created, with the detailed verification report attached as a git note.

### Quality Gates

Before marking any task complete, verify:

- [ ] All tests pass
- [ ] Code coverage meets requirements (>80%)
- [ ] Code follows project's code style guidelines (as defined in `code_styleguides/`)
- [ ] All public functions/methods are documented (e.g., docstrings, JSDoc, GoDoc)
- [ ] Type safety is enforced (e.g., type hints, TypeScript types, Go types)
- [ ] No linting or static analysis errors (using the project's configured tools)
- [ ] Works correctly on mobile (if applicable)
- [ ] Documentation updated if needed
- [ ] No security vulnerabilities introduced

## Development Commands

### Setup
```bash
# One-time dev environment setup (auto-detects platform)
pnpm setup:dev

# Install Node.js dependencies
pnpm install

# Install Python dependencies (via uv)
cd backend && uv sync
```

### Daily Development
```bash
# Run the full dev environment (Vite + Electron + Python backend)
pnpm dev

# Run with debug mode (Electron inspector + Python debugpy)
pnpm dev:debug

# Run backend tests
pnpm backend:test

# Run single test file
pnpm backend:test -- tests/test_generation.py

# Run type checks (both TypeScript and Python)
pnpm typecheck

# TypeScript only
pnpm typecheck:ts

# Python pyright only
pnpm typecheck:py
```

### Before Committing
```bash
# Run all type checks
pnpm typecheck

# Run all backend tests
pnpm backend:test

# Build frontend (if making UI changes)
pnpm build:frontend
```

## Testing Requirements

### Backend Unit & Integration Testing
- All backend modules must have corresponding integration tests using Starlette `TestClient`
- No mocks — use fake service implementations via `ServiceBundle` only
- Test both success and failure cases (HTTP errors with `from exc` chaining)
- Fakes live in `backend/tests/fakes/`, wired via `conftest.py`
- Test coverage target: >80% for all backend code

### Frontend Testing
- Note: No frontend tests currently exist in the project
- When implementing frontend features, design test specifications following TDD methodology
- Test component behavior, props contracts, and user interactions
- Cover state changes via React Context and IPC interactions via `window.electronAPI`

### End-to-End Testing
- Test complete video generation workflows (text-to-video, image-to-video, etc.)
- Verify file I/O operations (project saves, video exports)
- Test GPU fallback to API mode for unsupported hardware
- Verify ffmpeg export pipeline

## Code Review Process

### Self-Review Checklist
Before requesting review:

1. **Functionality**
   - Feature works as specified
   - Edge cases handled (GPU unavailable, file not found, network errors)
   - Error messages are user-friendly

2. **Code Quality**
   - Backend: Routes are thin, handlers use lock correctly, services have Protocol + fake
   - Frontend: Component reuse priority followed, no raw `fetch` for backend calls
   - TypeScript: Strict mode, no `any`, no unused locals/parameters
   - Python: Pyright strict mode, type annotations on all public APIs
   - DRY principle applied
   - Clear variable/function names

3. **Testing**
   - Backend: Integration tests pass with fakes (no mocks)
   - Backend: Coverage adequate (>80%)
   - Backend: `test_no_mock_usage.py` still passes

4. **Security**
   - No hardcoded secrets or API keys
   - Input validation present
   - IPC surface is minimal and sandboxed

5. **Performance**
   - GPU operations don't block the RLock
   - Large video files handled efficiently
   - Progress indicators for long-running operations

6. **Desktop Experience**
   - Native file dialogs work correctly
   - Video export via ffmpeg produces expected output
   - App handles shutdown gracefully during generation

## Commit Guidelines

### Message Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests
- `chore`: Maintenance tasks

### Examples
```bash
git commit -m "feat(auth): Add remember me functionality"
git commit -m "fix(posts): Correct excerpt generation for short posts"
git commit -m "test(comments): Add tests for emoji reaction limits"
git commit -m "style(mobile): Improve button touch targets"
```

## Definition of Done

A task is complete when:

1. All code implemented to specification
2. Backend tests written and passing (for backend changes)
3. Test specifications designed (for frontend changes, until test infrastructure exists)
4. Code coverage meets project requirements (>80% backend)
5. `pnpm typecheck` passes (TypeScript + Python pyright)
6. `pnpm backend:test` passes (for backend changes)
7. `pnpm build:frontend` succeeds (for frontend changes)
8. Changes committed with proper message
9. Git note with task summary attached to the commit
10. Implementation notes added to `plan.md`

## Emergency Procedures

### Critical Bug in Production
1. Create hotfix branch from main
2. Write failing test for bug
3. Implement minimal fix
4. Test thoroughly including mobile
5. Deploy immediately
6. Document in plan.md

### Data Loss
1. Stop all write operations
2. Restore from latest backup
3. Verify data integrity
4. Document incident
5. Update backup procedures

### Security Breach
1. Rotate all secrets immediately
2. Review access logs
3. Patch vulnerability
4. Notify affected users (if any)
5. Document and update security procedures

## Deployment Workflow

### Pre-Deployment Checklist
- [ ] All tests passing (`pnpm backend:test`)
- [ ] Coverage >80% (backend)
- [ ] No type errors (`pnpm typecheck`)
- [ ] Frontend build succeeds (`pnpm build:frontend`)
- [ ] Platform-specific builds tested (Windows/macOS/Linux)
- [ ] GPU and API mode both verified
- [ ] ffmpeg export tested on target platform
- [ ] Auto-update mechanism verified

### Deployment Steps
1. Merge feature branch to main
2. Run `pnpm build` for target platform(s)
3. Test installer on clean machine (or VM)
4. Verify app launches and connects to backend
5. Test video generation (local GPU or API mode)
6. Publish release via electron-builder
7. Monitor for crash reports and errors

### Post-Deployment
1. Monitor analytics
2. Check error logs
3. Gather user feedback
4. Plan next iteration

## Continuous Improvement

- Review workflow weekly
- Update based on pain points
- Document lessons learned
- Optimize for user happiness
- Keep things simple and maintainable
