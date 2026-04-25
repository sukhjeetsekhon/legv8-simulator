import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Cpu,
  Layers,
  LayoutList,
  Play,
  RotateCcw,
  StepForward,
} from 'lucide-react';
import './App.css';

const DEFAULT_CODE = `// LEGv8 Recursive Factorial
// Demonstrates stack frames, SP, FP, and BL/BR

MOV SP, #1024     // Init SP (Stack Pointer)
MOV FP, #1024     // Init FP (Frame Pointer)
MOV X0, #4         // Calculate 4!

BL factorial
B done

factorial:
SUBI SP, SP, #16 // Allocate 16 bytes on stack
STUR LR, [SP, #8] // Save LR (Return Address)
STUR X0, [SP, #0]  // Save N

CMP X0, #1         // Compare N with 1
B.GT recurse       // If N > 1, recurse

// Base case: return 1
MOV X1, #1
B return

recurse:
SUBI X0, X0, #1    // N = N - 1
BL factorial       // Recursive call
LDUR X0, [SP, #0]  // Restore N
MUL X1, X1, X0      // X1 = Result * N

return:
LDUR LR, [SP, #8] // Restore LR
ADDI SP, SP, #16  // Deallocate stack space
BR LR              // Return to caller

done:
// Final result is in X1
`;

const STACK_BASE = 1024;
const DATA_BASE = 2048;
const ROW_HEIGHT = 32;
const VALUE_FORMATS = ['decimal', 'hexadecimal', 'binary'];
const DEFAULT_DATA = `.long
a: -20, 0, 1, 10, 100
b: 120, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15`;

function splitArgs(argsStr) {
  const args = [];
  let current = '';
  let bracketDepth = 0;

  for (const char of argsStr) {
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === ',' && bracketDepth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function normalizeToken(token) {
  return token.replace(/[\[\]]/g, '').trim();
}

function parseRegisterImmediateOperand(operand) {
  const normalized = operand.trim();
  const bracketMatch = normalized.match(/^\[\s*([A-Za-z0-9]+)\s*,\s*(#-?\d+)\s*\]$/i);

  if (bracketMatch) {
    return {
      register: normalizeToken(bracketMatch[1]),
      immediate: normalizeToken(bracketMatch[2]),
    };
  }

  return null;
}

function highlightSource(code) {
  const lines = code.split('\n');
  return lines.map((line, index) => {
    const commentIndex = line.search(/\/\/|;/);
    const codePart = commentIndex === -1 ? line : line.slice(0, commentIndex);
    const commentPart = commentIndex === -1 ? '' : line.slice(commentIndex);

    const labelMatch = codePart.match(/^(\s*[A-Za-z_]\w*:)(.*)$/);
    let highlightedCode = codePart;

    if (labelMatch) {
      highlightedCode = `${labelMatch[1]}${labelMatch[2].replace(
        /\b([A-Za-z]+(?:\.[A-Za-z]+)?)\b/g,
        '<span class="token-opcode">$1</span>',
      )}`;
      highlightedCode = highlightedCode.replace(
        /^(\s*[A-Za-z_]\w*:)/,
        '<span class="token-label">$1</span>',
      );
    } else {
      highlightedCode = codePart.replace(
        /\b([A-Za-z]+(?:\.[A-Za-z]+)?)\b/g,
        '<span class="token-opcode">$1</span>',
      );
    }

    highlightedCode = highlightedCode
      .replace(/\b(X(?:[12]?\d|3[01]|ZR)|SP|FP|LR)\b/gi, '<span class="token-register">$1</span>')
      .replace(/#-?\d+\b/g, '<span class="token-immediate">$&</span>');

    const highlightedComment = commentPart
      ? `<span class="token-comment">${commentPart}</span>`
      : '';

    return `${highlightedCode}${highlightedComment}${index < lines.length - 1 ? '\n' : ''}`;
  }).join('');
}

function getInitialState() {
  const regs = new Array(32).fill(0);
  regs[28] = STACK_BASE;
  regs[29] = STACK_BASE;

  return {
    pc: 0,
    regs,
    flags: { N: 0, Z: 0, C: 0, V: 0 },
    memory: {},
    consoleOutput: [],
    halted: false,
  };
}

function parseDataSection(dataInput) {
  const trimmedInput = dataInput.trim();
  if (!trimmedInput) {
    return { memory: {}, labels: {} };
  }

  const lines = dataInput
    .split('\n')
    .map((line) => line.split('//')[0].split(';')[0].trim())
    .filter(Boolean);

  if (!lines.length) {
    return { memory: {}, labels: {} };
  }

  if (lines[0].toLowerCase() !== '.long') {
    throw new Error('Data must start with .long');
  }

  const memory = {};
  const labels = {};
  let nextAddress = DATA_BASE;

  for (let i = 1; i < lines.length; i += 1) {
    const entry = lines[i];
    const match = entry.match(/^([A-Za-z_]\w*):\s*(.+)$/);
    if (!match) {
      throw new Error(`Invalid data declaration: ${entry}`);
    }

    const [, label, valuesStr] = match;
    if (labels[label] !== undefined) {
      throw new Error(`Duplicate data label: ${label}`);
    }

    const rawValues = valuesStr.split(',').map((value) => value.trim()).filter(Boolean);
    if (!rawValues.length) {
      throw new Error(`Data label ${label} must define at least one value`);
    }

    labels[label] = nextAddress;

    rawValues.forEach((rawValue) => {
      if (!/^-?\d+$/.test(rawValue)) {
        throw new Error(`Invalid .long value "${rawValue}" for label ${label}`);
      }
      memory[nextAddress] = Number.parseInt(rawValue, 10);
      nextAddress += 8;
    });
  }

  return { memory, labels };
}

function formatValue(value, format) {
  switch (format) {
    case 'hexadecimal':
      return `0x${(value >>> 0).toString(16).toUpperCase()}`;
    case 'binary':
      return `0b${(value >>> 0).toString(2)}`;
    case 'decimal':
    default:
      return `${value}`;
  }
}

function getStackOffsetPointer(inst, regs) {
  if (!inst?.argsStr) return null;
  const match = inst.argsStr.match(/\[\s*([A-Z0-9]+)\s*,\s*#(-?\d+)\s*\]/i);
  if (!match) return null;

  const registerName = match[1].toUpperCase();
  const offset = Number.parseInt(match[2], 10);
  const aliasMap = { SP: 28, FP: 29, LR: 30 };
  const registerIndex =
    aliasMap[registerName] ?? Number.parseInt(registerName.replace('X', ''), 10);

  if (Number.isNaN(registerIndex) || registerIndex < 0 || registerIndex > 30) return null;
  const baseAddress = regs[registerIndex];
  const address = baseAddress + offset;

  return {
    registerName,
    offset,
    address,
  };
}

function getStackFinalPointer(inst, regs, memory) {
  if (!inst?.opcode) return null;
  const opcode = inst.opcode.toUpperCase();
  if (opcode === 'LDUR' || opcode === 'LDURB') {
    const args = splitArgs(inst.argsStr).map(normalizeToken);
    if (args.length < 2) return null;

    const bracketOperand = parseRegisterImmediateOperand(splitArgs(inst.argsStr)[1]);
    if (!bracketOperand) return null;

    const aliasMap = { SP: 28, FP: 29, LR: 30 };
    const toIndex = (name) =>
      aliasMap[name.toUpperCase()] ?? Number.parseInt(name.toUpperCase().replace('X', ''), 10);

    const destIndex = toIndex(args[0]);
    const sourceIndex = toIndex(bracketOperand.register);
    if ([destIndex, sourceIndex].some((index) => Number.isNaN(index) || index < 0 || index > 30)) {
      return null;
    }

    const destIsNamedPointer = [28, 29].includes(destIndex);
    if (!destIsNamedPointer) return null;

    const effectiveAddress =
      regs[sourceIndex] + Number.parseInt(bracketOperand.immediate.replace('#', ''), 10);
    const loadedValue = opcode === 'LDURB' ? ((memory[effectiveAddress] || 0) & 0xff) : (memory[effectiveAddress] || 0);

    return {
      registerName: args[0].toUpperCase(),
      address: loadedValue,
    };
  }

  if (opcode !== 'ADDI' && opcode !== 'SUBI') return null;

  const args = splitArgs(inst.argsStr).map(normalizeToken);
  if (args.length < 3 || !args[2].startsWith('#')) return null;

  const aliasMap = { SP: 28, FP: 29, LR: 30 };
  const toIndex = (name) =>
    aliasMap[name.toUpperCase()] ?? Number.parseInt(name.toUpperCase().replace('X', ''), 10);

  const destIndex = toIndex(args[0]);
  const sourceIndex = toIndex(args[1]);
  if ([destIndex, sourceIndex].some((index) => Number.isNaN(index) || index < 0 || index > 30)) {
    return null;
  }

  const sourceValue = regs[sourceIndex];
  const sourceIsStackPointerLike =
    sourceValue >= STACK_BASE - 4096 && sourceValue <= STACK_BASE + 4096;
  const destIsNamedPointer = [28, 29].includes(destIndex);

  if (!sourceIsStackPointerLike && !destIsNamedPointer) return null;

  const immediate = Number.parseInt(args[2].replace('#', ''), 10);
  const finalAddress = opcode === 'ADDI' ? sourceValue + immediate : sourceValue - immediate;

  return {
    registerName: args[0].toUpperCase(),
    address: finalAddress,
  };
}

function getLrFinalPc(inst, regs, memory) {
  if (!inst?.opcode) return null;
  const opcode = inst.opcode.toUpperCase();
  const aliasMap = { SP: 28, FP: 29, LR: 30 };
  const toIndex = (name) =>
    aliasMap[name.toUpperCase()] ?? Number.parseInt(name.toUpperCase().replace('X', ''), 10);

  // BL writes inst.pc + 4 into LR — show that as the "LR final" return target
  if (opcode === 'BL') {
    return inst.pc + 4;
  }

  if (opcode === 'LDUR' || opcode === 'LDURB') {
    const args = splitArgs(inst.argsStr).map(normalizeToken);
    if (args[0]?.toUpperCase() !== 'LR' && args[0]?.toUpperCase() !== 'X30') return null;
    const bracketOperand = parseRegisterImmediateOperand(splitArgs(inst.argsStr)[1]);
    if (!bracketOperand) return null;
    const sourceIndex = toIndex(bracketOperand.register);
    if (Number.isNaN(sourceIndex) || sourceIndex < 0 || sourceIndex > 30) return null;
    const effectiveAddress =
      regs[sourceIndex] + Number.parseInt(bracketOperand.immediate.replace('#', ''), 10);
    return opcode === 'LDURB' ? ((memory[effectiveAddress] || 0) & 0xff) : (memory[effectiveAddress] || 0);
  }

  if (opcode === 'ADDI' || opcode === 'SUBI') {
    const args = splitArgs(inst.argsStr).map(normalizeToken);
    if (args[0]?.toUpperCase() !== 'LR' && args[0]?.toUpperCase() !== 'X30') return null;
    const sourceIndex = toIndex(args[1]);
    if (Number.isNaN(sourceIndex) || sourceIndex < 0 || sourceIndex > 30 || !args[2]?.startsWith('#')) return null;
    const immediate = Number.parseInt(args[2].replace('#', ''), 10);
    return opcode === 'ADDI' ? regs[sourceIndex] + immediate : regs[sourceIndex] - immediate;
  }

  return null;
}

export default function App() {
  const [sourceCode, setSourceCode] = useState(DEFAULT_CODE);
  const [dataInput, setDataInput] = useState(DEFAULT_DATA);
  const [assembled, setAssembled] = useState(false);
  const [program, setProgram] = useState([]);
  const [labels, setLabels] = useState({});
  const [breakpoints, setBreakpoints] = useState([]);
  const [error, setError] = useState('');
  const [machineState, setMachineState] = useState(getInitialState());
  const [registerFormat, setRegisterFormat] = useState('decimal');
  const [stackFormat, setStackFormat] = useState('decimal');
  const traceListRef = useRef(null);
  const sourceEditorRef = useRef(null);
  const sourceHighlightRef = useRef(null);
  const sourceLineNumbersRef = useRef(null);

  useEffect(() => {
    if (traceListRef.current) {
      const container = traceListRef.current;
      const row = container.querySelector(`[data-pc="${machineState.pc}"]`);
      if (!row) return;
      const targetTop = Math.max(0, row.offsetTop - container.offsetTop);
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }, [machineState.pc]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!event.altKey || event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        handleAssemble();
      } else if (key === 'r' && assembled && !machineState.halted) {
        event.preventDefault();
        handleRun();
      } else if (key === 's' && assembled && !machineState.halted) {
        event.preventDefault();
        handleStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assembled, machineState.halted, sourceCode, program, labels, machineState, breakpoints]);

  const syncSourceScroll = () => {
    if (!sourceEditorRef.current || !sourceHighlightRef.current || !sourceLineNumbersRef.current) return;
    sourceHighlightRef.current.scrollTop = sourceEditorRef.current.scrollTop;
    sourceHighlightRef.current.scrollLeft = sourceEditorRef.current.scrollLeft;
    sourceLineNumbersRef.current.scrollTop = sourceEditorRef.current.scrollTop;
  };

  const handleAssemble = () => {
    try {
      const lines = sourceCode.split('\n');
      const nextProgram = [];
      const nextCodeLabels = {};
      let instIndex = 0;

      for (let i = 0; i < lines.length; i += 1) {
        let line = lines[i].split('//')[0].split(';')[0].trim();
        if (!line) continue;

        const labelMatch = line.match(/^([a-zA-Z_]\w*):(.*)/);
        if (labelMatch) {
          nextCodeLabels[labelMatch[1]] = instIndex * 4;
          line = labelMatch[2].trim();
        }

        if (!line) continue;
        if (/^S\s+T\s+O\s+P$/i.test(line)) {
          line = 'STOP';
        }

        const instMatch = line.match(/^(\S+)(?:\s+(.*))?$/);
        if (!instMatch) throw new Error(`Unable to parse instruction: ${line}`);
        const opcode = instMatch[1].toUpperCase();
        const argsStr = instMatch[2]?.trim() ?? '';

        nextProgram.push({
          opcode,
          argsStr,
          original: lines[i].trim(),
          lineNum: i + 1,
          pc: instIndex * 4,
        });
        instIndex += 1;
      }

      const { memory: dataMemory, labels: dataLabels } = parseDataSection(dataInput);
      const duplicateLabels = Object.keys(dataLabels).filter((label) => nextCodeLabels[label] !== undefined);
      if (duplicateLabels.length) {
        throw new Error(`Duplicate label name used in code and data: ${duplicateLabels[0]}`);
      }

      const nextLabels = { ...nextCodeLabels, ...dataLabels };
      const nextState = {
        ...getInitialState(),
        memory: dataMemory,
      };

      setProgram(nextProgram);
      setLabels(nextLabels);
      setBreakpoints([]);
      setAssembled(true);
      setMachineState(nextState);
      setError('');
    } catch (err) {
      setError(`Assembly Error: ${err.message}`);
      setAssembled(false);
    }
  };

  const executeStep = (prog, labelMap, state) => {
    if (state.pc / 4 >= prog.length || state.halted) {
      return { ...state, halted: true };
    }

    const inst = prog[state.pc / 4];
    const { pc, regs, flags, memory, consoleOutput } = state;
    let nextPc = pc + 4;
    const newRegs = [...regs];
    const newFlags = { ...flags };
    const newMem = { ...memory };
    const newConsoleOutput = [...consoleOutput];

    const writeReg = (registerName, value) => {
      const normalizedName = normalizeToken(registerName).toUpperCase();
      const aliasMap = { SP: 28, FP: 29, LR: 30, XZR: 31 };
      const register =
        aliasMap[normalizedName] ?? Number.parseInt(normalizedName.replace('X', ''), 10);
      if (!Number.isNaN(register) && register >= 0 && register < 31) {
        // Preserve sign; guard against NaN propagation from bad arithmetic
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new Error(`Computed NaN for ${registerName} — check immediate or operand syntax`);
        }
        newRegs[register] = Math.trunc(value);
      }
    };

    const readReg = (registerName) => {
      const normalizedName = normalizeToken(registerName).toUpperCase();
      if (normalizedName === 'XZR') return 0;
      const aliasMap = { SP: 28, FP: 29, LR: 30 };
      const register =
        aliasMap[normalizedName] ?? Number.parseInt(normalizedName.replace('X', ''), 10);
      if (Number.isNaN(register) || register < 0 || register > 31) {
        throw new Error(`Invalid register ${registerName}`);
      }
      if (register === 31) return 0;
      const val = newRegs[register];
      // Guard: NaN in the register array should never spread silently
      return (typeof val === 'number' && !Number.isNaN(val)) ? val : 0;
    };

    const parseImm = (immediate) => {
      if (!immediate) throw new Error('Missing immediate value');
      const parsed = Number.parseInt(normalizeToken(immediate).replace('#', ''), 10);
      if (Number.isNaN(parsed)) throw new Error(`Invalid immediate value: ${immediate}`);
      return parsed;
    };

    const readOperand = (operand) => (
      normalizeToken(operand).startsWith('#') ? parseImm(operand) : readReg(operand)
    );

    const rawArgs = splitArgs(inst.argsStr);
    const args = rawArgs.map(normalizeToken);

    try {
      switch (inst.opcode) {
        case 'ADD':
          writeReg(args[0], readReg(args[1]) + readReg(args[2]));
          break;
        case 'SUB':
          writeReg(args[0], readReg(args[1]) - readReg(args[2]));
          break;
        case 'ADDI': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          if (args.length === 2 && bracketOperand) {
            writeReg(args[0], readReg(bracketOperand.register) + parseImm(bracketOperand.immediate));
            break;
          }
          writeReg(args[0], readReg(args[1]) + readOperand(args[2]));
          break;
        }
        case 'SUBI': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          if (args.length === 2 && bracketOperand) {
            writeReg(args[0], readReg(bracketOperand.register) - parseImm(bracketOperand.immediate));
            break;
          }
          writeReg(args[0], readReg(args[1]) - readOperand(args[2]));
          break;
        }
        case 'MUL':
          writeReg(args[0], readReg(args[1]) * readReg(args[2]));
          break;
        case 'AND':
          writeReg(args[0], readReg(args[1]) & readReg(args[2]));
          break;
        case 'ORR':
          writeReg(args[0], readReg(args[1]) | readReg(args[2]));
          break;
        case 'EOR':
          writeReg(args[0], readReg(args[1]) ^ readReg(args[2]));
          break;
        case 'ANDI':
          writeReg(args[0], readReg(args[1]) & parseImm(args[2]));
          break;
        case 'ORRI':
          writeReg(args[0], readReg(args[1]) | parseImm(args[2]));
          break;
        case 'EORI':
          writeReg(args[0], readReg(args[1]) ^ parseImm(args[2]));
          break;
        case 'LSL':
          writeReg(args[0], readReg(args[1]) << parseImm(args[2]));
          break;
        case 'LSR':
          writeReg(args[0], readReg(args[1]) >>> parseImm(args[2]));
          break;
        case 'SUBS': {
          const result = readReg(args[1]) - readReg(args[2]);
          writeReg(args[0], result);
          newFlags.Z = result === 0 ? 1 : 0;
          newFlags.N = result < 0 ? 1 : 0;
          break;
        }
        case 'SUBIS': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          const result = args.length === 2 && bracketOperand
            ? readReg(bracketOperand.register) - parseImm(bracketOperand.immediate)
            : readReg(args[1]) - readOperand(args[2]);
          writeReg(args[0], result);
          newFlags.Z = result === 0 ? 1 : 0;
          newFlags.N = result < 0 ? 1 : 0;
          break;
        }
        case 'CMP': {
          const operand2 = args[1].includes('#') ? parseImm(args[1]) : readReg(args[1]);
          const result = readReg(args[0]) - operand2;
          newFlags.Z = result === 0 ? 1 : 0;
          newFlags.N = result < 0 ? 1 : 0;
          break;
        }
        case 'CMPI': {
          const result = readReg(args[0]) - parseImm(args[1]);
          newFlags.Z = result === 0 ? 1 : 0;
          newFlags.N = result < 0 ? 1 : 0;
          break;
        }
        case 'B':
          if (labelMap[args[0]] === undefined) throw new Error(`Label ${args[0]} not found`);
          nextPc = labelMap[args[0]];
          break;
        case 'BL':
          if (labelMap[args[0]] === undefined) throw new Error(`Label ${args[0]} not found`);
          writeReg('X30', pc + 4);
          nextPc = labelMap[args[0]];
          break;
        case 'BR':
          nextPc = readReg(args[0]);
          break;
        case 'B.EQ':
          if (flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.NE':
          if (!flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.LT':
          if (flags.N) nextPc = labelMap[args[0]];
          break;
        case 'B.LE':
          if (flags.N || flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.GT':
          if (!flags.N && !flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.GE':
          if (!flags.N) nextPc = labelMap[args[0]];
          break;
        case 'CBZ':
          if (readReg(args[0]) === 0) nextPc = labelMap[args[1]];
          break;
        case 'CBNZ':
          if (readReg(args[0]) !== 0) nextPc = labelMap[args[1]];
          break;
        case 'MOV':
          if (args[1].startsWith('#')) writeReg(args[0], parseImm(args[1]));
          else writeReg(args[0], readReg(args[1]));
          break;
        case 'LDA':
          if (args[1].startsWith('#')) writeReg(args[0], parseImm(args[1]));
          else {
            if (labelMap[args[1]] === undefined) throw new Error(`Label ${args[1]} not found`);
            writeReg(args[0], labelMap[args[1]]);
          }
          break;
        case 'PUTINT':
          newConsoleOutput.push(`${readReg(args[0])}`);
          break;
        case 'STOP':
          return {
            pc,
            regs: newRegs,
            flags: newFlags,
            memory: newMem,
            consoleOutput: newConsoleOutput,
            halted: true,
          };
        case 'LDUR':
        case 'LDURB':
        case 'STUR': {
          const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
          if (!match) throw new Error('Invalid syntax. Expected: OP Xt, [Xn, #offset]');
          const rt = match[1];
          const rn = match[2];
          const offset = match[3] ? Number.parseInt(match[3], 10) : 0;
          const addr = readReg(rn) + offset;

          if (inst.opcode === 'LDUR') {
            writeReg(rt, newMem[addr] ?? 0);
          } else if (inst.opcode === 'LDURB') {
            writeReg(rt, (newMem[addr] || 0) & 0xff);
          } else {
            newMem[addr] = readReg(rt);
          }
          break;
        }
        case 'STURB': {
          const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
          if (!match) throw new Error('Invalid syntax. Expected: OP Xt, [Xn, #offset]');
          const rt = match[1];
          const rn = match[2];
          const offset = match[3] ? Number.parseInt(match[3], 10) : 0;
          const addr = readReg(rn) + offset;
          newMem[addr] = readReg(rt) & 0xff;
          break;
        }
        default:
          throw new Error(`Unsupported instruction: ${inst.opcode}`);
      }

      if (nextPc === undefined) throw new Error('Jump label not found');
    } catch (err) {
      throw new Error(`Line ${inst.lineNum}: ${err.message}`);
    }

    return {
      pc: nextPc,
      regs: newRegs,
      flags: newFlags,
      memory: newMem,
      consoleOutput: newConsoleOutput,
      halted: false,
    };
  };

  const handleStep = () => {
    try {
      const newState = executeStep(program, labels, machineState);
      setMachineState(newState);
      setError('');
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
      setMachineState((state) => ({ ...state, halted: true }));
    }
  };

  const handleRun = () => {
    try {
      let state = machineState;
      let count = 0;
      const maxSteps = 5000;
      // If execution is already sitting on a breakpoint (e.g. after a previous Run
      // paused here), skip it on the first iteration so we can always make progress.
      let skipFirst = breakpoints.includes(state.pc);

      while (!state.halted && count < maxSteps) {
        if (!skipFirst && breakpoints.includes(state.pc)) {
          setError(`Execution paused at breakpoint on PC ${state.pc}.`);
          setMachineState(state);
          return;
        }
        skipFirst = false;
        state = executeStep(program, labels, state);
        count += 1;
      }

      setMachineState(state);
      if (count >= maxSteps) {
        setError(`Execution paused: Reached safety limit of ${maxSteps} instructions.`);
      } else {
        setError('');
      }
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
    }
  };

  const handleReset = () => {
    const clearedState = getInitialState();
    setMachineState(clearedState);
    setDataInput('');
    setError('');
  };

  const handleClearData = () => {
    const clearedState = {
      ...machineState,
      memory: {},
    };
    setDataInput('');
    setMachineState(clearedState);
    setError('');
  };

  const toggleBreakpoint = (pc) => {
    setBreakpoints((current) =>
      current.includes(pc) ? current.filter((value) => value !== pc) : [...current, pc].sort((a, b) => a - b),
    );
  };

  const getRegAlias = (index) => {
    if (index === 28) return ' (SP)';
    if (index === 29) return ' (FP)';
    if (index === 30) return ' (LR)';
    return '';
  };

  let minMem = Math.min(...Object.keys(machineState.memory).map(Number).filter((n) => !Number.isNaN(n)));
  if (minMem === Infinity) minMem = STACK_BASE;
  let maxMem = Math.max(...Object.keys(machineState.memory).map(Number).filter((n) => !Number.isNaN(n)));
  if (maxMem === -Infinity) maxMem = STACK_BASE;

  let dynamicTop = Math.max(STACK_BASE + 16, machineState.regs[28] + 16, machineState.regs[29] + 16, maxMem + 16);
  dynamicTop = Math.ceil(dynamicTop / 8) * 8;

  let bottomAddr = Math.min(minMem, machineState.regs[28], machineState.regs[29]) - 40;
  bottomAddr = Math.floor(bottomAddr / 8) * 8;

  const stackAddresses = [];
  for (let addr = dynamicTop; addr >= bottomAddr; addr -= 8) {
    stackAddresses.push(addr);
  }

  const spAligned = Math.floor(machineState.regs[28] / 8) * 8;
  const fpAligned = Math.floor(machineState.regs[29] / 8) * 8;
  const lrPc = machineState.regs[30];
  const lrInst = program.find((inst) => inst.pc === lrPc);
  const spIdx = stackAddresses.indexOf(spAligned);
  const fpIdx = stackAddresses.indexOf(fpAligned);
  const frameTop = Math.max(spAligned, fpAligned);
  const frameBottom = Math.min(spAligned, fpAligned);
  const currentInst = assembled && !machineState.halted ? program[machineState.pc / 4] : null;
  const stackOffsetPointer = getStackOffsetPointer(currentInst, machineState.regs);
  const stackFinalPointer = getStackFinalPointer(currentInst, machineState.regs, machineState.memory);
  const lrFinalPc = getLrFinalPc(currentInst, machineState.regs, machineState.memory);
  const offsetPointerAligned =
    stackOffsetPointer ? Math.floor(stackOffsetPointer.address / 8) * 8 : null;
  const offsetPointerIdx =
    offsetPointerAligned === null ? -1 : stackAddresses.indexOf(offsetPointerAligned);
  const finalPointerAligned =
    stackFinalPointer ? Math.floor(stackFinalPointer.address / 8) * 8 : null;
  const finalPointerIdx =
    finalPointerAligned === null ? -1 : stackAddresses.indexOf(finalPointerAligned);
  const offsetSharesSp = offsetPointerIdx !== -1 && offsetPointerIdx === spIdx;
  const offsetSharesFp = offsetPointerIdx !== -1 && offsetPointerIdx === fpIdx;
  const finalSharesSp = finalPointerIdx !== -1 && finalPointerIdx === spIdx;
  const finalSharesFp = finalPointerIdx !== -1 && finalPointerIdx === fpIdx;
  const finalSharesOffset = finalPointerIdx !== -1 && finalPointerIdx === offsetPointerIdx;
  const lrFinalInst = program.find((inst) => inst.pc === lrFinalPc);
  const sourceLineNumbers = sourceCode.split('\n').map((_, index) => `${index + 1}`).join('\n');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="title-wrap">
          <div className="title-icon">
            <Cpu size={30} />
          </div>
          <div>
            <h1>LEGv8 Simulator</h1>
            <p>Interactive ARM assembly environment</p>
          </div>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={handleAssemble} title="Alt + A">
            <LayoutList size={16} /> Assemble
          </button>
          <button type="button" className="btn btn-success" onClick={handleRun} disabled={!assembled || machineState.halted} title="Alt + R">
            <Play size={16} /> Run
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleStep} disabled={!assembled || machineState.halted} title="Alt + S">
            <StepForward size={16} /> Step
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={!assembled}>
            <RotateCcw size={16} /> Reset
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleClearData}>
            <Layers size={16} /> Clear Data
          </button>
        </div>
      </header>

      {error ? (
        <div className="status-banner error-banner">
          <AlertCircle size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {assembled && machineState.halted && !error ? (
        <div className="status-banner success-banner">
          <CheckCircle size={18} />
          <p>Program execution completed successfully.</p>
        </div>
      ) : null}

      <main className="panel-grid">
        <section className="panel panel-source">
          <div className="panel-header">
            <span>Source Code</span>
            {!assembled ? <span className="panel-tag">Unassembled</span> : null}
          </div>
          <div className="source-editor-shell">
            <pre ref={sourceLineNumbersRef} className="source-line-numbers" aria-hidden="true">
              {sourceLineNumbers}
            </pre>
            <pre
              ref={sourceHighlightRef}
              className="source-highlight custom-scrollbar"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlightSource(sourceCode) }}
            />
            <textarea
              ref={sourceEditorRef}
              className="source-editor custom-scrollbar"
              value={sourceCode}
              onChange={(event) => {
                setSourceCode(event.target.value);
                setAssembled(false);
              }}
              onScroll={syncSourceScroll}
              spellCheck="false"
              wrap="off"
            />
          </div>
        </section>

        <section className="panel panel-data">
          <div className="panel-header">
            <span>Data</span>
            <span className="panel-tag">.long (8 bytes each)</span>
          </div>
          <div className="data-editor-shell">
            <textarea
              className="data-editor custom-scrollbar"
              value={dataInput}
              onChange={(event) => setDataInput(event.target.value)}
              spellCheck="false"
              wrap="off"
              placeholder={[".long", "arr1: 1, 2, 3", "arr2: 4, 5, 6"].join('\n')}
            />
          </div>
        </section>

        <section className="panel panel-trace">
          <div className="panel-header">
            <span>Execution View</span>
            <div className="panel-header-controls">
              <span className="pc-badge">PC: {machineState.pc}</span>
              <span className="lr-badge">LR: {lrInst ? lrInst.pc : 'None'}</span>
            </div>
          </div>
          {assembled && currentInst && !machineState.halted ? (
            <div className="current-inst-bar">
              <span className="current-inst-arrow">▶</span>
              <span className="current-inst-text">{currentInst.original}</span>
              <span className="current-inst-pc">:{currentInst.pc.toString().padStart(4, '0')}</span>
            </div>
          ) : assembled && machineState.halted ? (
            <div className="current-inst-bar current-inst-bar-halted">
              <span className="current-inst-arrow">■</span>
              <span className="current-inst-text">Program halted</span>
            </div>
          ) : null}
          <div ref={traceListRef} className="trace-list custom-scrollbar">
            {!assembled ? (
              <div className="empty-state">Assemble the code to view execution</div>
            ) : (
              program.map((inst, index) => {
                const isActive = machineState.pc === inst.pc && !machineState.halted;
                const isLinkTarget = machineState.regs[30] === inst.pc;
                const isLrFinalTarget = lrFinalInst?.pc === inst.pc;
                const hasBreakpoint = breakpoints.includes(inst.pc);
                return (
                  <div
                    key={`${inst.pc}-${index}`}
                    data-pc={inst.pc}
                    className={`trace-row${isActive ? ' trace-row-active' : ''}${isLinkTarget ? ' trace-row-lr' : ''}${isLrFinalTarget ? ' trace-row-lr-final' : ''}${hasBreakpoint ? ' trace-row-breakpoint' : ''}`}
                  >
                    <button
                      type="button"
                      className={`trace-breakpoint-gutter${hasBreakpoint ? ' trace-breakpoint-gutter-active' : ''}`}
                      onDoubleClick={() => toggleBreakpoint(inst.pc)}
                      title={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
                      aria-label={hasBreakpoint ? `Remove breakpoint at PC ${inst.pc}` : `Add breakpoint at PC ${inst.pc}`}
                    >
                      <span className="trace-breakpoint-dot" />
                    </button>
                    <span className="trace-pc">{inst.pc.toString().padStart(4, '0')}</span>
                    <span className="trace-code">{inst.original}</span>
                    {isLinkTarget ? <span className="trace-marker trace-marker-lr">LR -&gt;</span> : null}
                    {isLrFinalTarget ? <span className="trace-marker trace-marker-lr-final">LR final -&gt;</span> : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="console-shell">
            <div className="console-header">Mini Console</div>
            <div className="console-output custom-scrollbar">
              {machineState.consoleOutput.length ? (
                machineState.consoleOutput.map((line, index) => (
                  <div key={`${line}-${index}`} className="console-line">
                    {line}
                  </div>
                ))
              ) : (
                <div className="console-empty">No output yet</div>
              )}
            </div>
          </div>
        </section>

        <section className="panel panel-flags">
          <div className="panel-header">Flags</div>
          <div className="flag-grid">
            {Object.entries(machineState.flags).map(([flag, value]) => (
              <div key={flag} className="flag-card">
                <span className="flag-name">{flag}</span>
                <span className={`flag-value${value ? ' flag-value-active' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-registers">
          <div className="panel-header">
            <span>Registers</span>
            <select
              className="value-format-select"
              value={registerFormat}
              onChange={(event) => setRegisterFormat(event.target.value)}
            >
              {VALUE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </div>
          <div className="register-grid custom-scrollbar">
            {machineState.regs.map((value, index) => {
              if (index === 31) return null;
              return (
                <div key={index} className="register-card">
                  <span className="register-name">
                    X{index}
                    <span className="register-alias">{getRegAlias(index)}</span>
                  </span>
                  <span className="register-value">{formatValue(value, registerFormat)}</span>
                </div>
              );
            })}
            <div className="register-card">
              <span className="register-name">XZR</span>
              <span className="register-value">{formatValue(0, registerFormat)}</span>
            </div>
          </div>
        </section>

        <section className="panel panel-stack">
          <div className="panel-header panel-header-icon">
            <span className="panel-header-controls">
              <span className="panel-header-icon-text"><Layers size={16} /> Stack Memory</span>
              <select
                className="value-format-select"
                value={stackFormat}
                onChange={(event) => setStackFormat(event.target.value)}
              >
                {VALUE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="stack-wrap custom-scrollbar">
            <div className="stack-layout">
              <div className="stack-pointer-column">
                {spIdx !== -1 ? (
                  <div
                    className={`stack-pointer${offsetSharesSp ? ' stack-pointer-shared' : ''}`}
                    style={{ top: spIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <span className="stack-pointer-sp">SP -&gt;</span>
                    {spIdx === fpIdx ? <span className="stack-pointer-fp">FP -&gt;</span> : null}
                    {offsetSharesSp ? (
                      <span className="stack-pointer-offset-label">
                        {stackOffsetPointer.registerName}
                        {stackOffsetPointer.offset >= 0 ? '+' : ''}
                        {stackOffsetPointer.offset}
                        {' ->'}
                      </span>
                    ) : null}
                    {finalSharesSp ? (
                      <span className="stack-pointer-final-label">
                        {stackFinalPointer.registerName} final -&gt;
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {fpIdx !== -1 && spIdx !== fpIdx ? (
                  <div
                    className={`stack-pointer${offsetSharesFp ? ' stack-pointer-shared' : ''}`}
                    style={{ top: fpIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <span className="stack-pointer-fp">FP -&gt;</span>
                    {offsetSharesFp ? (
                      <span className="stack-pointer-offset-label">
                        {stackOffsetPointer.registerName}
                        {stackOffsetPointer.offset >= 0 ? '+' : ''}
                        {stackOffsetPointer.offset}
                        {' ->'}
                      </span>
                    ) : null}
                    {finalSharesFp ? (
                      <span className="stack-pointer-final-label">
                        {stackFinalPointer.registerName} final -&gt;
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {offsetPointerIdx !== -1 && !offsetSharesSp && !offsetSharesFp ? (
                  <div className="stack-pointer stack-pointer-offset" style={{ top: offsetPointerIdx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    <span className="stack-pointer-offset-label">
                      {stackOffsetPointer.registerName}
                      {stackOffsetPointer.offset >= 0 ? '+' : ''}
                      {stackOffsetPointer.offset}
                      {' ->'}
                    </span>
                    {finalSharesOffset ? (
                      <span className="stack-pointer-final-label">
                        {stackFinalPointer.registerName} final -&gt;
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {finalPointerIdx !== -1 && !finalSharesSp && !finalSharesFp && !finalSharesOffset ? (
                  <div className="stack-pointer stack-pointer-final" style={{ top: finalPointerIdx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    <span className="stack-pointer-final-label">
                      {stackFinalPointer.registerName} final -&gt;
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="stack-grid">
                {stackAddresses.map((addr) => {
                  const value = machineState.memory[addr];
                  const hasValue = value !== undefined;
                  const isInFrame = addr <= frameTop && addr >= frameBottom;
                  const isOffsetTarget = offsetPointerAligned !== null && addr === offsetPointerAligned;

                  return (
                    <div
                      key={addr}
                      className={`stack-row${hasValue ? ' stack-row-filled' : ''}${isInFrame ? ' stack-row-frame' : ''}${isOffsetTarget ? ' stack-row-offset-target' : ''}`}
                    >
                      <span className="stack-address">[{formatValue(addr, stackFormat)}]</span>
                      <span className={`stack-value${hasValue ? ' stack-value-filled' : ''}`}>
                        {formatValue(hasValue ? value : 0, stackFormat)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
