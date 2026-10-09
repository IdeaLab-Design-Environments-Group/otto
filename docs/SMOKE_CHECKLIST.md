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
- [ ] Touch: one-finger drag pans; two-finger pinch zooms around the midpoint
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

## Code & blocks editors
- [ ] Run an AQUI script (params + shapes + transform + boolean op + for-loop + draw/turtle)
- [ ] Canvas shows results; shapes appear in the panel
- [ ] Blocks editor: build a shape with prop blocks, run — canvas updates
- [ ] Code → Blocks sync (edit code, blocks rebuild) and Blocks → Code
- [ ] Adding a shape on canvas adds a block
- [ ] `join finger base.top wall.bottom { count: 7 }` + `ground base`: both panels show matching teeth; output says "Joints: 1"
- [ ] A bad edge name (`base.middle`) still runs and the output lists the valid edges
- [ ] Code → Blocks shows a `join finger` block (Joints category) and a `ground` block
- [ ] Moving a jointed shape on the canvas regenerates code that keeps the `join` line
- [ ] Changing a parameter used as `count: n` re-cuts the teeth; undo restores
- [ ] A five-panel box with one wall 6 mm too wide: the run output warns that two joints do not close by 3.0 mm
- [ ] One scene with tab_slot (lock: wedge), cross_lap, splice (knob), bolt and hinge: slots, wedge holes, T-slots, knobs and hinge slits all draw
- [ ] Run code while the Code tab is open: the app stays responsive; opening the Blocks tab then shows the blocks
- [ ] Join tool (toolbar or J): click an edge of one shape, then an edge of another → popover offers finger / splice / hinge / cross lap; Finger adds the joint (dashed link + teeth); Ctrl+Z removes it
- [ ] Join tool: an edge, then a click inside another shape's face → tab and slot / bolt; the face gets slots
- [ ] Select a jointed shape: the Joints section shows each joint; changing Teeth re-cuts; × removes; "stand on the floor" sets ground
- [ ] Examples tab: each card loads its program into the Code tab and runs it; with your own code in the editor you are asked before it is replaced
- [ ] Cut files: settings change the sheets live (undoable); previews show teeth/slots; Download all saves one SVG per sheet (opens in a laser driver/Inkscape at true mm size)
- [ ] Cut files: a part larger than the bed is listed with the usable area and a splice suggestion; the stool example lists M5 bolts and nuts
- [ ] 3D button: the joined parts appear folded up; orbit with the mouse; a box with a 6 mm too-wide wall shows red parts and two reasons

## Jev (build-up guide, on the canvas)
- [ ] On load: the plan strip at the top of the canvas and the "Ask Jev" bar at the bottom, with starter chips; no Jev toolbar button
- [ ] "Build a shelf with 3 boards": the first panel appears as a blue dashed ghost, the card pinned under it; the view fits ghost + card
- [ ] ⏎ (focus on the canvas) or Apply places the block; Ctrl+Z removes the whole block and un-dots the plan step
- [ ] Board 1: the ghost shows the board with tabs and the new slots in both sides; Other joint switches to plain tabs, then bolts
- [ ] Skip moves to the next block; ✕ asks what to change
- [ ] Build a block by hand (e.g. add the next panel yourself): Jev proposes only the missing joint
- [ ] Finish a recipe: "All N blocks are in. No problems"; 3D shows it standing up
- [ ] Clicks on empty canvas still select/pan; typing in the Code tab and pressing ⏎ never applies a block
- [ ] – hides Jev to a pill; the pill brings it back; ⋯ → policy "Autopilot" builds a stool without asking; Export session log downloads a .jsonl

## Undo/redo (global)
- [ ] Undo/redo across a mixed session (create → move → bind → param change →
      code run → delete) behaves predictably at every step

## Accessibility (post-Phase 7)
- [ ] Complete the core flow keyboard-only (no mouse)
- [ ] Focus rings visible on every interactive element
- [ ] VoiceOver announces toolbar buttons, tabs, shape library items, selection changes
