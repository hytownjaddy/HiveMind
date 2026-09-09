---
name: stage
description: Execute a HiveMind development stage end to end. Use when Jacob says "do stage NN", "go do stage NN", "start stage NN", or runs /stage NN.
---

# /stage NN

Execute `STAGES/STAGE_NN.md` following the "Starting a stage" protocol in `AGENTS.md`.

## Steps

1. Resolve `NN` from the argument (`/stage 03`, `/stage 3`, "stage three"). If missing,
   list `STAGES/README.md` status and ask which stage.
2. Read, in order: `DECISIONS.md`, `ARCHITECTURE.md`, `STAGES/README.md`,
   `STAGES/STAGE_NN.md`, the "Definition of done" of every prerequisite stage,
   `docs/ui/UI-SYSTEM.md`, and each companion spec under the stage's "UI specifications".
3. Run pre-flight: clean `git status` on `main`; prerequisites marked done; open questions
   answered; toolchains install.
4. Post the plan (work breakdown, first three commits, conflicts with the tree). Continue
   unless the plan changes scope.
5. Execute the work breakdown with one coherent commit per task, verification before each
   commit, no acceptance criterion weakened, out-of-scope items proposed in `DECISIONS.md`.
6. Close: acceptance criteria demonstrated, docs updated, definition-of-done ticked,
   `STAGES/README.md` status updated, milestone commit and tag, push, closing report.

## Rules that override anything you infer from the code or the mockups

- `DECISIONS.md` > `docs/ui/UI-SYSTEM.md` > companion spec > stage file > mockup image (D-041).
- The 17 invariants in `AGENTS.md`.
- Mockup images are reference only.
- AI runs as External Work Orders by default; never build a server-side agent (D-009).
