# LEGv8 Simulator

An interactive browser-based simulator for the LEGv8 instruction set, a teaching subset of ARMv8 used in *Computer Organization and Design* (Patterson & Hennessy). Write assembly, step through execution, inspect registers and flags, and watch stack/data memory update live.

---

## Getting Started

```bash
npm install
npm run dev
```

Open the URL shown in your terminal, typically `http://localhost:5173`.

You can also create a desktop shortcut that points to `run-sim.bat` to launch the simulator directly in Chrome.

---

## Interface Overview

The UI is split into five panels:

| Panel | Purpose |
|---|---|
| **Source Code** | Write or paste LEGv8 assembly with syntax highlighting, whitespace markers, and mutation hints |
| **Data** | Define `.byte`, `.half`, `.word`, `.long`, or `.quad` values loaded into memory before execution |
| **Execution View** | See every instruction and the current PC |
| **Registers / Flags** | Inspect the live register file and NZCV state |
| **Stack Memory** | Visual stack and memory view with SP / FP / computed pointer overlays |

---

## Workflow

### 1. Write code

Type directly in the **Source Code** panel. Labels, opcodes, registers, immediates, line comments, and block comments are highlighted as you type.

- Click **Shortcuts** to open the editor help card.
- Press `Tab` to indent the current line or selected lines by 3 spaces.
- Press `Shift + Tab` to outdent the current line or selected lines.
- Press `Ctrl + X` to cut the current source line.
- Press `Ctrl + Z` / `Ctrl + Shift + Z` to undo and redo source edits.
- Click **Format** to normalize source spacing while preserving comments.
- Turn on **Whitespace** to show spaces and tabs with subtle markers.
- Turn on **Mutations** to highlight register references touched by the most recent step.
- Add register notes with inline comments such as `MOV X0, #4  // @X0 current loop counter`; hovering a highlighted register reference shows the note.

### 2. Add data

Use the **Data** panel to define numeric values preloaded into memory before execution.

```asm
.long
arr1: -20, 0, 1, 10, 100
arr2: 120, 2, 3, 4, 5
```

Supported directives:

- `.byte` = 1 byte
- `.half` = 2 bytes
- `.word` = 4 bytes
- `.long` = 8 bytes
- `.quad` = 8 bytes

The stack/memory panel adapts its visible address stride to the active data width.

### 3. Assemble

Click **Assemble** or press `Alt + A`. The assembler:

- Strips `//`, `;`, `/* ... */`, and `/** ... */` comments
- Resolves code labels to byte addresses
- Resolves data labels to memory addresses
- Loads data values into memory before the first instruction runs
- Resets the machine to its initial state
- Clears existing breakpoints

If there is a syntax error, a red banner shows the line number and message.

### 4. Run / Step / Reset

| Control | Keyboard | Description |
|---|---|---|
| **Run** | `Alt + R` | Execute until halt, error, or breakpoint |
| **Step** | `Alt + S` | Execute exactly one instruction |
| **Undo Step** | `Alt + Z` | Restore the previous execution snapshot |
| **Reset** | — | Reset registers, flags, and PC and clear the Data editor plus memory |
| **Clear Data** | — | Clear the Data editor and memory without changing source code |

A green banner appears when the program reaches `STOP` or runs off the end of the program.

---

## Breakpoints

Double-click the gutter dot to the left of any instruction in the Execution View to toggle a breakpoint.

- **Run** pauses when execution reaches a breakpointed instruction.
- If execution is already sitting on a breakpoint, **Run** advances past it and continues.
- Breakpoints are cleared whenever you assemble again.

---

## Register Display Formats

Use the dropdown in the **Registers** panel to view values as:

- `decimal`
- `hexadecimal`
- `binary`

The most recently mutated registers are highlighted in the register panel, and the source editor can optionally highlight matching register references.
The current instruction also previews register usage in the register panel: destination writes use one highlight color, while source operands use a second color.

---

## Stack Memory

The stack panel shows addresses from just below the current SP/FP down to the highest address that has been written. The rendered range expands when needed so computed offsets and final pointer targets remain visible.

Pointer overlays:

| Label | Meaning |
|---|---|
| `SP ->` | X28, Stack Pointer |
| `FP ->` | X29, Frame Pointer |
| `Xn+offset ->` | Address computed by the current `STUR` / `LDUR` instruction |
| `Xn final ->` | Address SP/FP will hold after the current `ADDI` / `SUBI` completes |
| `LR final ->` | PC that will be written into LR by `BL`, or loaded into LR by `LDUR X30, ...` |

---

## Supported Instructions

### Arithmetic / Logic

| Instruction | Syntax | Operation |
|---|---|---|
| `ADD` | `ADD Xd, Xn, Xm` | Xd = Xn + Xm |
| `SUB` | `SUB Xd, Xn, Xm` | Xd = Xn - Xm |
| `ADDI` | `ADDI Xd, Xn, #imm` | Xd = Xn + imm |
| `SUBI` | `SUBI Xd, Xn, #imm` | Xd = Xn - imm |
| `MUL` | `MUL Xd, Xn, Xm` | Xd = Xn * Xm |
| `AND` | `AND Xd, Xn, Xm` | Xd = Xn & Xm |
| `ORR` | `ORR Xd, Xn, Xm` | Xd = Xn \| Xm |
| `EOR` | `EOR Xd, Xn, Xm` | Xd = Xn ^ Xm |
| `ANDI` | `ANDI Xd, Xn, #imm` | Xd = Xn & imm |
| `ORRI` | `ORRI Xd, Xn, #imm` | Xd = Xn \| imm |
| `EORI` | `EORI Xd, Xn, #imm` | Xd = Xn ^ imm |
| `LSL` | `LSL Xd, Xn, #shamt` | Xd = Xn << shamt |
| `LSR` | `LSR Xd, Xn, #shamt` | Xd = Xn >> shamt |

### Flags-setting

| Instruction | Syntax | Flags updated |
|---|---|---|
| `SUBS` | `SUBS Xd, Xn, Xm` | Sets N, Z |
| `SUBIS` | `SUBIS Xd, Xn, #imm` | Sets N, Z |
| `CMP` | `CMP Xn, Xm` or `CMP Xn, #imm` | Sets N, Z |
| `CMPI` | `CMPI Xn, #imm` | Sets N, Z |

### Memory

| Instruction | Syntax | Operation |
|---|---|---|
| `LDUR` | `LDUR Xt, [Xn, #offset]` | Xt = Mem[Xn + offset] |
| `STUR` | `STUR Xt, [Xn, #offset]` | Mem[Xn + offset] = Xt |
| `LDURB` | `LDURB Xt, [Xn, #offset]` | Xt = Mem[Xn + offset] & 0xFF |
| `STURB` | `STURB Xt, [Xn, #offset]` | Mem[Xn + offset] = Xt & 0xFF |

### Branches

| Instruction | Syntax | Condition |
|---|---|---|
| `B` | `B label` | Unconditional |
| `BL` | `BL label` | Branch-and-Link |
| `BR` | `BR Xn` | Jump to address in register |
| `B.EQ` | `B.EQ label` | Z = 1 |
| `B.NE` | `B.NE label` | Z = 0 |
| `B.LT` | `B.LT label` | N = 1 |
| `B.LE` | `B.LE label` | N = 1 or Z = 1 |
| `B.GT` | `B.GT label` | N = 0 and Z = 0 |
| `B.GE` | `B.GE label` | N = 0 |
| `CBZ` | `CBZ Xn, label` | Xn = 0 |
| `CBNZ` | `CBNZ Xn, label` | Xn != 0 |

### Pseudo / Utility

| Instruction | Syntax | Description |
|---|---|---|
| `MOV` | `MOV Xd, #imm` or `MOV Xd, Xn` | Move immediate or register |
| `LDA` | `LDA Xd, #imm` or `LDA Xd, label` | Load an immediate address or data-label address |
| `PUTINT` | `PUTINT Xn` | Print Xn to the Mini Console |
| `STOP` | `STOP` | Halt execution |

---

## Register Aliases

| Alias | Register | Conventional use |
|---|---|---|
| `SP` | X28 | Stack Pointer |
| `FP` | X29 | Frame Pointer |
| `LR` | X30 | Link Register |
| `XZR` | — | Always-zero register |

Both alias names and numbered forms are accepted.

---

## Data Labels with `LDA`

`LDA` can load the base address of a label defined in the **Data** panel:

```asm
LDA X0, arr1
LDA X1, arr2
```

---

## Example Program

The default program computes `4!` recursively and demonstrates stack allocation, LR save/restore, and branching.
