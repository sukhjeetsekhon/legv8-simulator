# LEGv8 Simulator

An interactive browser-based simulator for the **LEGv8** instruction set — a teaching subset of ARMv8 used in *Computer Organization and Design* (Patterson & Hennessy). Write assembly, step through execution, inspect registers, flags, and live stack memory all in one view.

---

## Getting Started

```bash
npm install
npm run dev
```

Open the URL shown in your terminal (typically `http://localhost:5173`).

You can also create a desktop shortcut and set the path to the `run-sim.bat` file. This way you can run the .bat file by double-clicking the shortcut and it will automatically run the simulator into Google Chrome.

---

## Interface Overview

The UI is split into four panels:

| Panel | Purpose |
|---|---|
| **Source Code** | Write or paste LEGv8 assembly |
| **Execution View** | See every instruction; highlights the current PC |
| **Registers / Flags** | Live register file and NZCV flag state |
| **Stack Memory** | Visual stack with SP / FP / offset / LR-final pointers |

---

## Workflow

### 1 — Write code
Type directly in the **Source Code** panel. Syntax highlighting updates as you type. Labels, opcodes, registers, immediates, and comments are all coloured.

### 2 — Assemble
Click **Assemble** (or press `Alt + A`). The assembler:
- Strips comments (`//` or `;`)
- Resolves labels to byte-addresses (PC increments by 4 per instruction)
- Resets the machine to its initial state (SP = FP = 1024, all other registers = 0)
- Clears any existing breakpoints

If there is a syntax error you will see a red banner with the line number and message.

### 3 — Run / Step / Reset

| Control | Keyboard | Description |
|---|---|---|
| **Run** | `Alt + R` | Execute until halt, error, or breakpoint |
| **Step** | `Alt + S` | Execute exactly one instruction |
| **Reset** | — | Restore machine to post-assemble initial state |

A green banner appears when the program reaches a `STOP` instruction or runs off the end of the program.

---

## Breakpoints

Double-click the **gutter dot** to the left of any instruction in the Execution View to toggle a breakpoint (shown as a red dot).

- **Run** will pause execution when it reaches a breakpointed instruction and display the PC in the status banner.
- If execution is **already sitting on a breakpoint**, clicking Run advances past it and continues — no need to Step or Reset first.
- Breakpoints are cleared whenever you **Assemble** again.

---

## Register Display Formats

Use the dropdown in the **Registers** panel to view values as:

- `decimal` — signed decimal (negative values display as `-n`)
- `hexadecimal` — 32-bit unsigned hex (`0xFFFFFFxx`)
- `binary` — 32-bit unsigned binary (`0b111…`)

---

## Stack Memory

The stack panel shows addresses from just below the current SP/FP down to the highest address that has been written. Columns show the byte address and stored value.

**Pointer overlays** (left sidebar of the stack):

| Label | Meaning |
|---|---|
| `SP ->` | X28 — Stack Pointer |
| `FP ->` | X29 — Frame Pointer |
| `Xn+offset ->` | Address computed by the **current** `STUR`/`LDUR` instruction |
| `Xn final ->` | Address that SP/FP **will** hold after the current `ADDI`/`SUBI` completes |
| `LR final ->` | PC that will be written into **X30 (LR)** by the current `BL` instruction, or loaded into LR by `LDUR X30, …` |

---

## Execution View — Current Instruction Bar

A **banner above the instruction list** always shows the instruction currently about to execute, its mnemonic, and its byte address. This updates every step and every breakpoint pause.

---

## Supported Instructions

### Arithmetic / Logic

| Instruction | Syntax | Operation |
|---|---|---|
| `ADD` | `ADD Xd, Xn, Xm` | Xd = Xn + Xm |
| `SUB` | `SUB Xd, Xn, Xm` | Xd = Xn − Xm |
| `ADDI` | `ADDI Xd, Xn, #imm` | Xd = Xn + imm |
| `SUBI` | `SUBI Xd, Xn, #imm` | Xd = Xn − imm |
| `MUL` | `MUL Xd, Xn, Xm` | Xd = Xn × Xm |
| `AND` | `AND Xd, Xn, Xm` | Xd = Xn & Xm |
| `ORR` | `ORR Xd, Xn, Xm` | Xd = Xn \| Xm |
| `EOR` | `EOR Xd, Xn, Xm` | Xd = Xn ^ Xm |
| `ANDI` | `ANDI Xd, Xn, #imm` | Xd = Xn & imm |
| `ORRI` | `ORRI Xd, Xn, #imm` | Xd = Xn \| imm |
| `EORI` | `EORI Xd, Xn, #imm` | Xd = Xn ^ imm |
| `LSL` | `LSL Xd, Xn, #shamt` | Xd = Xn << shamt |
| `LSR` | `LSR Xd, Xn, #shamt` | Xd = Xn >> shamt (logical) |

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
| `BL` | `BL label` | Branch-and-Link: LR = PC+4, jump to label |
| `BR` | `BR Xn` | Jump to address in register |
| `B.EQ` | `B.EQ label` | Z = 1 |
| `B.NE` | `B.NE label` | Z = 0 |
| `B.LT` | `B.LT label` | N = 1 |
| `B.LE` | `B.LE label` | N = 1 or Z = 1 |
| `B.GT` | `B.GT label` | N = 0 and Z = 0 |
| `B.GE` | `B.GE label` | N = 0 |
| `CBZ` | `CBZ Xn, label` | Xn = 0 |
| `CBNZ` | `CBNZ Xn, label` | Xn ≠ 0 |

### Pseudo / Utility

| Instruction | Syntax | Description |
|---|---|---|
| `MOV` | `MOV Xd, #imm` or `MOV Xd, Xn` | Move immediate or register |
| `LDA` | `LDA Xd, #imm` | Load immediate address |
| `PUTINT` | `PUTINT Xn` | Print Xn to the Mini Console |
| `STOP` | `STOP` | Halt execution |

---

## Register Aliases

| Alias | Register | Conventional use |
|---|---|---|
| `SP` | X28 | Stack Pointer |
| `FP` | X29 | Frame Pointer |
| `LR` | X30 | Link Register (return address) |
| `XZR` | — | Always-zero register |

Both the alias (`SP`, `LR`, etc.) and the numbered form (`X28`, `X30`) are accepted everywhere.

---

## Negative (Signed) Values

Registers hold **signed** integers. You can use negative immediates freely:

```asm
MOV X0, #-10
ADDI X1, X0, #3    // X1 = -7
CMP X1, #0
B.LT negative      // branches because -7 < 0
```

The decimal display shows the signed value. Hex and binary displays show the standard 32-bit two's-complement bit pattern.

---

## Example Program — Recursive Factorial

The default program loaded on startup computes **4!** recursively:

```asm
MOV X28, #1024     // Init SP
MOV X29, #1024     // Init FP
MOV X0, #4        // n = 4

BL factorial
B done

factorial:
SUBI X28, X28, #16
STUR X30, [X28, #8]  // Save LR
STUR X0,  [X28, #0]  // Save n
CMP X0, #1
B.GT recurse
MOV X1, #1
B return

recurse:
SUBI X0, X0, #1
BL factorial
LDUR X0, [X28, #0]   // Restore n
MUL X1, X1, X0       // X1 *= n

return:
LDUR X30, [X28, #8]  // Restore LR
ADDI X28, X28, #16
BR X30               // Return

done:
// X1 holds the result (24)
```

Step through this program to see the stack frame being built and torn down on each recursive call. The **LR final →** pointer in the stack view shows exactly where each `BL` will store its return address before jumping.

---

## Execution Limits

To prevent infinite loops, **Run** stops automatically after **5 000 instructions** and displays a safety-limit warning. Use **Step** to continue manually, or fix your loop termination condition and re-assemble.