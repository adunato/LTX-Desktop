# Design: Fix ComfyUI Mapping Modal Dropdown

## Problem Summary
The node mapping dropdown in `ComfyUIMappingModal.tsx` fails to function correctly. Specifically:
1.  **Auto-closing**: The dropdown closes immediately upon opening because the `onValueChange` event in the `cmdk` `<Command>` component triggers a state change that closes the menu before the user can interact with it.
2.  **Selection Logic**: The `value` passed to the dropdown and the `id` used in the options list are mismatched, causing the dropdown to always display "Not Mapped" even when a selection exists.
3.  **UX Issues**: The dropdown lacks "click outside" detection and proper blur handling, which is especially problematic since it is rendered in a Portal.

## Affected Modules
- `frontend/components/ComfyUIMappingModal.tsx`

## Design Decisions
1.  **Decouple Selection from Auto-close**:
    - Remove `onValueChange` from the root `<Command>` component.
    - Implement `onSelect` on each `<CommandItem>` to handle the actual selection and closing of the menu.
2.  **Unify Identifiers**:
    - Ensure both the `value` prop in `NodeSelect` and the `id` in `selectOptions` use the consistent format `${node}:${field}`.
    - Update `ComfyUIMappingModal` to use the same logic for generating and resolving these IDs.
3.  **Implement Click-Outside Listener**:
    - Use a `useEffect` hook in `NodeSelect` to add a global `mousedown` listener that closes the dropdown if a click occurs outside the container.
4.  **Refine Portal Positioning**:
    - Ensure the portal uses a safe z-index and handle cleanup properly on unmount.

## Verification Plan
1.  **Manual Testing**:
    - Open the ComfyUI Mapping Modal.
    - Verify the "Target Pipeline" buttons still work.
    - Click a node mapping dropdown and ensure it stays open.
    - Search for a node and verify the list filters correctly.
    - Select a node and verify the dropdown closes and the label updates to the selected node.
    - Verify that clicking outside the dropdown closes it without saving a change.
    - Save the configuration and verify the mapping persists in the state.
2.  **Automated Testing**:
    - None planned for this UI fix, but will verify no regressions in build/lint.
