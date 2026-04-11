# Tracks Registry - LTX Desktop

This file tracks all active and completed feature tracks in the LTX Desktop project.

## Registry Format

| Track ID | Title | Status | Folder Link |
|----------|-------|--------|-------------|
| *(track_id)* | *(Title)* | *(active/completed/cancelled)* | *[Link](./tracks/<track_id>/)* |

## Active Tracks

*No active tracks yet.*

## Completed Tracks

*No completed tracks yet.*

## Cancelled Tracks

*No cancelled tracks yet.*

## Adding a New Track

1. Create a new directory: `conductor/tracks/<track_id>/`
2. Create `spec.md` with the track specification
3. Create `plan.md` with the implementation plan
4. Create `metadata.json` with track metadata
5. Add entry to this registry

## Track Structure

Each track folder should contain:
- `spec.md` - Track specification and requirements
- `plan.md` - Implementation plan
- `metadata.json` - Track metadata (status, dates, etc.)
- `index.md` - Track index (optional, links to other track documents)
