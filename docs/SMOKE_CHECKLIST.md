# Otto Manual Smoke Checklist

Run after every refactor phase (and every Phase-2 sub-step). Serve the repo
root over HTTP (`npm run serve` → http://localhost:8080) — ES modules do not
load from `file://`.

For each item: perform the action, then **undo (Ctrl/Cmd+Z) and redo
(Ctrl/Cmd+Y)** and confirm the scene returns to the expected state.

## Shape creation
- [ ] Drag each of the 18 shapes from the Shape Library onto the canvas:
      circle, line, rectangle, path (via free-draw), polygon, star, triangle,
      ellipse, arc, roundedrectangle, donut, cross, gear, spiral, wave, slot,
      arrow, chamferrectangle
- [ ] Each renders at the drop position and appears in the Properties panel layer list

## Selection
- [ ] Click selects a single shape (brackets + dimension labels appear)
- [ ] Shift-click adds/removes from selection
- [ ] Marquee (drag on empty canvas) selects contained shapes
- [ ] Ctrl/Cmd+A selects all; Escape / empty click deselects
- [ ] Properties panel follows the selection

## Manipulation
- [ ] Drag moves a shape (and a multi-selection moves together)
- [ ] Arrow keys nudge the selection
- [ ] Corner handles resize each shape type sensibly
- [ ] Rotation handle rotates; angle shows during drag
- [ ] Ctrl/Cmd+D duplicates; Delete removes
- [ ] Path tool: click to add points, drag for curves, close the path, then
      edit bezier handles on the finished path

## Edges & joinery
- [ ] Edge selection mode: hovering highlights individual edges
- [ ] Right-click an edge opens the joinery menu
- [ ] Apply finger male/female (thickness + finger count); preview draws on the edge
- [ ] Joinery survives save/reload

## Viewport
- [ ] Mouse wheel zooms around the cursor; right-drag pans
- [ ] Zoom controls (+/−/reset) work; rulers and grid stay aligned in mm

## Parameters & bindings
- [ ] Add a parameter; slider changes propagate to bound shapes live
- [ ] Bind a shape property to a parameter from the Properties panel
- [ ] Expression binding (e.g. `size * 2`) evaluates and updates
- [ ] Rename a parameter / change min/max/step — bindings keep working

## Tabs
- [ ] New tab creates an empty scene; shapes/params are per-tab
- [ ] Switch tabs — canvas, panels, and editors all follow
- [ ] Rename and close tabs

## Persistence
- [ ] Ctrl/Cmd+S saves; reload restores everything (shapes, bindings, joinery, viewport, tabs)
- [ ] Export `.pds`, clear, re-import — scene identical
- [ ] Autosave restores after a hard reload without manual save
- [ ] **STL** button → pick an ASCII or binary `.stl` → a prompt shows the
      auto-picked view + size and accepts `<scale> [view]` (Enter accepts;
      `10 top`, `1 side`, etc.). The outline appears centered + framed;
      `depth` = the extent along the view's perpendicular axis; the toast
      reports the view + mm size. Undo removes it.
- [ ] Import a *house* STL → it comes in as the gabled **front** silhouette
      (peak up), not a flat square (the top view). Overriding `... top` gives
      the square footprint instead.
- [ ] Import a *concave* part (L-bracket, gear, letter) → the outline follows
      the real (concave) silhouette, not a convex bounding shape; slanted edges
      are clean lines, not staircases.
- [ ] Import a part with a *hole* (washer/frame) → outer outline is correct and
      the toast notes "N interior hole(s) not represented".

## Code & blocks editors
- [ ] Run an AQUI script (params + shapes + transform + boolean op + for-loop + draw/turtle)
- [ ] Canvas shows results; shapes appear in the panel
- [ ] Blocks editor: build a shape with prop blocks, run — canvas updates
- [ ] Code → Blocks sync (edit code, blocks rebuild) and Blocks → Code
- [ ] Adding a shape on canvas adds a block

## Undo/redo (global)
- [ ] Undo/redo across a mixed session (create → move → bind → param change →
      code run → delete) behaves predictably at every step

## 3D view (embedded, live)
- [ ] Click the "3D" toolbar button — the panel opens beside the canvas and
      every shape appears extruded (canvas refits to the narrower space)
- [ ] Joinery: male tabs and female holes visible on jointed edges
- [ ] Orbit (drag) works; clicking a 3D piece selects the shape (panel updates)
- [ ] Selecting a shape on the canvas highlights its 3D piece
- [ ] Drag a shape on the canvas → its mesh follows after the debounce
- [ ] Bind depth to a parameter, scrub the slider → extrusion thickness updates live
- [ ] Change z → the piece elevates off the table
- [ ] Set tilt=90 on a panel → it stands upright in 3D (badge shows the tilt)
- [ ] Change **Face plane** (Properties dropdown) xz/xy/yz → the piece's flat
      face reorients in 3D (flat / front-vertical / side-vertical)
- [ ] On a piece with female joinery, set **cutDepth** < depth → the slot
      becomes a blind pocket (doesn't go all the way through) in 3D
- [ ] Run examples/house.aqui → walls/roof fold up into a standing house
- [ ] Edit joinery → teeth rebuild in 3D
- [ ] Switch tabs → the 3D scene swaps to the new tab's shapes
- [ ] 50-shape scene + slider scrub stays smooth (transform-only fast path)
- [ ] Donut still renders with its hole
- [ ] Toggle "3D" off → panel hides, canvas expands, render loop stops
- [ ] Old bookmark to assemble.html redirects to the editor

## Accessibility (post-Phase 7)
- [ ] Complete the core flow keyboard-only (no mouse)
- [ ] Focus rings visible on every interactive element
- [ ] VoiceOver announces toolbar buttons, tabs, shape library items, selection changes
