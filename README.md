<h2 align="center">Otto: Teaching Parametric Design in Digital Fabrication Education</h2>
<p align="center">
  <picture>
<img width="400" height="330" alt="Screenshot 2025-10-22 at 08 27 11" src="https://github.com/user-attachments/assets/3e74c99f-4148-467d-b288-0fc239c42a01" />
  </picture>
</p>
<p align="center">
  <b>A graphical programming language for parametric design education</b>
</p>
<p align="center">
  <a href="https://github.com/HisarCS/Aqui/tree/main/Docs">Documentation</a> •
  <a href="https://github.com/HisarCS/Aqui/blob/main/LICENSE">License</a> 
</p>


---
Graphical programming language mainly created for teaching Parametric designing in digital fabrication education while promoting computational thinking skills as well. It is completely **OPEN SOURCE!** contact EmreDay1 if you want to contribute send an email to emre.dayangac@hisarschool.k12.tr, emreday01@gmail.com, sedat.yalcin@hisarschool.k12.tr and if you want to contact the organization you may email hisarcs@hisarschool.k12.tr


The AQUI language for Otto was mainly built to create a more engaging environment for the Parametrix project. The language's main goal is to provide a more in-depth editing capability for users, trying to learn Parametric designing with Parametrix, the language was completely written in JavaScript, and is a graphical language to create Parametrix designs. AQUI is an interpreted language. If you want to learn how to use it, it's inner workings here is the documentation link: https://github.com/HisarCS/Aqui/tree/main/Docs

---

### 2.5D parametric design

Otto is a **2.5D** environment: every shape carries two extra bindable properties in addition to its 2D geometry —

- **`depth`** — extrusion thickness in mm (default `3`)
- **`z`** — elevation off the work plane in mm (default `0`)

Both behave like any other parametric property: bind them to a parameter, drive them from an expression, or set them literally in AQUI:

```
param t = 4
shape circle c1 { radius: 30 depth: t z: 10 }
```

The 2D canvas paints shapes z-sorted (higher pieces on top, with a subtle elevation shadow) and the embedded **live 3D viewport** (toggle the **3D** toolbar button) extrudes each shape by its `depth` and lifts it by its `z`, updating in real time as you edit.

### Architecture

Otto follows an explicit **MVC** structure — schema-driven shape models, a per-tab command/undo history, dumb render passes driven by controllers, and a lazy `SceneContext` that keeps everything pointed at the active tab. See [`src/ARCHITECTURE.md`](src/ARCHITECTURE.md) for the full picture and [`docs/SMOKE_CHECKLIST.md`](docs/SMOKE_CHECKLIST.md) for the manual test pass. Unit tests run headlessly with `node tests/run-node.js` or in the browser via `tests/run-tests.html`.

