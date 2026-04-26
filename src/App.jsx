import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Cpu,
  Eye,
  HelpCircle,
  History,
  Layers,
  LayoutList,
  Play,
  RotateCcw,
  StepBack,
  StepForward,
} from 'lucide-react';
import './App.css';

const DEFAULT_CODE = `// LEGv8 Recursive Factorial
// Demonstrates stack frames, SP, FP, and BL/BR

MOV SP, #1024     // @SP stack top before the first call
MOV FP, #1024     // @FP current stack frame base
MOV X0, #4        // @X0 current N argument

BL factorial
B done

factorial:
SUBI SP, SP, #16  // Allocate 16 bytes on stack
STUR LR, [SP, #8] // @LR return address; save LR
STUR X0, [SP, #0] // Save N

CMP X0, #1        // Compare N with 1
B.GT recurse      // If N > 1, recurse

/* Base case: return 1 */
MOV X1, #1        // @X1 factorial result
B return

recurse:
SUBI X0, X0, #1   // N = N - 1
BL factorial      // Recursive call
LDUR X0, [SP, #0] // Restore N
MUL X1, X1, X0    // X1 = Result * N

return:
LDUR LR, [SP, #8] // Restore LR
ADDI SP, SP, #16  // Deallocate stack space
BR LR             // Return to caller

done:
/** Final result is in X1 */
`;

const STACK_BASE = 1024;
const DATA_BASE = 1032;
const ROW_HEIGHT = 32;
const VALUE_FORMATS = ['decimal', 'hexadecimal', 'binary'];
const DATA_DIRECTIVES = {
  '.byte': 1,
  '.half': 2,
  '.word': 4,
  '.long': 8,
  '.quad': 8,
};
const DEFAULT_DATA = `.long
a: -20, 0, 1, 10, 100
b: 120, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15`;
const TAB_SPACES = '   ';
const MAX_HISTORY = 200;
const REGISTER_PATTERN = /\b(X(?:[12]?\d|3[01]|ZR)|SP|FP|LR)\b/gi;

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

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getRegisterMatches(text) {
  return [...text.matchAll(REGISTER_PATTERN)].map((match) => match[1].toUpperCase());
}

function pushHistoryEntry(historyRef, entry) {
  const history = historyRef.current;
  const last = history[history.length - 1];

  if (
    last
    && last.value === entry.value
    && last.selectionStart === entry.selectionStart
    && last.selectionEnd === entry.selectionEnd
  ) {
    return;
  }

  history.push(entry);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function getEditorSnapshot(element, value) {
  return {
    value,
    selectionStart: element?.selectionStart ?? 0,
    selectionEnd: element?.selectionEnd ?? 0,
  };
}

function queueSelectionRestore(ref, start, end = start) {
  window.requestAnimationFrame(() => {
    if (!ref.current) return;
    ref.current.focus();
    ref.current.selectionStart = start;
    ref.current.selectionEnd = end;
  });
}

function stripComments(text) {
  let output = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const current = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false;
        output += '\n';
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      } else if (current === '\n') {
        output += '\n';
      }
      continue;
    }

    if (current === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (current === ';') {
      inLineComment = true;
      continue;
    }

    if (current === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function splitLineIntoCodeAndComment(line, initialInBlockComment = false) {
  let inBlockComment = initialInBlockComment;

  if (initialInBlockComment) {
    const endIdx = line.indexOf('*/');
    if (endIdx === -1) {
      return { codePart: '', commentPart: line, inBlockComment: true };
    }

    const commentPart = line.slice(0, endIdx + 2);
    const remainder = line.slice(endIdx + 2);
    if (!remainder.trim()) {
      return { codePart: '', commentPart, inBlockComment: false };
    }
  }

  for (let i = 0; i < line.length; i += 1) {
    const current = line[i];
    const next = line[i + 1];

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (current === '/' && next === '/') {
      return {
        codePart: line.slice(0, i),
        commentPart: line.slice(i),
        inBlockComment,
      };
    }

    if (current === ';') {
      return {
        codePart: line.slice(0, i),
        commentPart: line.slice(i),
        inBlockComment,
      };
    }

    if (current === '/' && next === '*') {
      return {
        codePart: line.slice(0, i),
        commentPart: line.slice(i),
        inBlockComment: !line.slice(i + 2).includes('*/'),
      };
    }
  }

  return {
    codePart: line,
    commentPart: '',
    inBlockComment,
  };
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

function parseRegisterReference(name) {
  const normalized = normalizeToken(name).toUpperCase();
  if (normalized === 'SP') return { index: 28, canonical: 'SP' };
  if (normalized === 'FP') return { index: 29, canonical: 'FP' };
  if (normalized === 'LR' || normalized === 'X30') return { index: 30, canonical: 'LR' };
  if (normalized === 'XZR') return { index: 31, canonical: 'XZR' };
  if (!/^X\d+$/.test(normalized)) return null;

  const index = Number.parseInt(normalized.slice(1), 10);
  if (Number.isNaN(index) || index < 0 || index > 31) return null;
  return { index, canonical: index === 31 ? 'XZR' : `X${index}` };
}

function applyWhitespaceMarkers(content, showWhitespace) {
  if (!showWhitespace) return content;

  return content
    .replace(/ /g, '<span class="token-whitespace">·</span>')
    .replace(/\t/g, '<span class="token-whitespace">→</span>');
}

function decorateWhitespaceInHtml(content, showWhitespace) {
  if (!showWhitespace) return content;

  return content
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : applyWhitespaceMarkers(part, showWhitespace)))
    .join('');
}

function collectRegisterNotes(code) {
  const notes = {};
  let inBlockComment = false;

  code.split('\n').forEach((line) => {
    const { codePart, commentPart, inBlockComment: nextInBlockComment } =
      splitLineIntoCodeAndComment(line, inBlockComment);
    inBlockComment = nextInBlockComment;
    if (!commentPart.trim()) return;

    for (const match of commentPart.matchAll(/@((?:X(?:[12]?\d|3[01]|ZR)|SP|FP|LR))\s*:?\s*([^@]+)/gi)) {
      const registerName = match[1].toUpperCase();
      const note = match[2]
        .replace(/\*\/$/, '')
        .trim();
      if (!note) continue;
      if (!notes[registerName]) notes[registerName] = [];
      notes[registerName].push(note);
    }
  });

  return notes;
}

function highlightCodeSegment(segment, mutatedRegisters, showMutationHints, showWhitespace, registerNotes) {
  const escapedSegment = escapeHtml(segment);
  const labelMatch = escapedSegment.match(/^(\s*[A-Za-z_]\w*:)(.*)$/);
  const labelPrefix = labelMatch ? `<span class="token-label">${labelMatch[1]}</span>` : '';
  const codeBody = labelMatch ? labelMatch[2] : escapedSegment;

  const highlightedBody = codeBody.replace(
    /\b(X(?:[12]?\d|3[01]|ZR)|SP|FP|LR)\b|#-?\d+\b|\b([A-Za-z]+(?:\.[A-Za-z]+)?)\b/gi,
    (match, registerMatch, opcodeMatch) => {
      if (registerMatch) {
        const normalized = registerMatch.toUpperCase();
        const isMutated = showMutationHints && mutatedRegisters.has(normalized);
        const note = registerNotes[normalized];
        const title = note?.length ? ` title="${escapeHtml(note.join('\n'))}"` : '';
        return `<span class="token-register${isMutated ? ' token-register-mutated' : ''}"${title}>${match}</span>`;
      }

      if (match.startsWith('#')) {
        return `<span class="token-immediate">${match}</span>`;
      }

      return `<span class="token-opcode">${opcodeMatch}</span>`;
    },
  );

  return decorateWhitespaceInHtml(`${labelPrefix}${highlightedBody}`, showWhitespace);
}

function highlightSource(code, options = {}) {
  const {
    mutatedRegisters = new Set(),
    showMutationHints = false,
    showWhitespace = false,
    registerNotes = {},
  } = options;
  let html = '';
  let buffer = '';
  let inLineComment = false;
  let inBlockComment = false;

  const flushCodeBuffer = () => {
    if (!buffer) return;
    html += highlightCodeSegment(
      buffer,
      mutatedRegisters,
      showMutationHints,
      showWhitespace,
      registerNotes,
    );
    buffer = '';
  };

  for (let i = 0; i < code.length; i += 1) {
    const current = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (current === '\n') {
        html += '</span>\n';
        inLineComment = false;
      } else {
        html += decorateWhitespaceInHtml(escapeHtml(current), showWhitespace);
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        html += '*/</span>';
        inBlockComment = false;
        i += 1;
      } else if (current === '\n') {
        html += '\n';
      } else {
        html += decorateWhitespaceInHtml(escapeHtml(current), showWhitespace);
      }
      continue;
    }

    if (current === '/' && next === '/') {
      flushCodeBuffer();
      html += '<span class="token-comment">//';
      inLineComment = true;
      i += 1;
      continue;
    }

    if (current === ';') {
      flushCodeBuffer();
      html += '<span class="token-comment">;';
      inLineComment = true;
      continue;
    }

    if (current === '/' && next === '*') {
      flushCodeBuffer();
      html += '<span class="token-comment">/*';
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (current === '\n') {
      flushCodeBuffer();
      html += '\n';
      continue;
    }

    buffer += current;
  }

  flushCodeBuffer();
  if (inLineComment || inBlockComment) {
    html += '</span>';
  }

  return html;
}

function formatAssembly(code) {
  let inBlockComment = false;

  return code
    .split('\n')
    .map((line) => {
      const withoutTrailingWhitespace = line.replace(/\s+$/g, '');
      const { codePart, commentPart, inBlockComment: nextInBlockComment } =
        splitLineIntoCodeAndComment(withoutTrailingWhitespace, inBlockComment);
      inBlockComment = nextInBlockComment;

      const trimmedCode = codePart.trim();
      if (!trimmedCode) {
        return commentPart ? commentPart.trimStart() : '';
      }

      const labelWithBodyMatch = trimmedCode.match(/^([A-Za-z_]\w*:)(.*)$/);
      const formattedCode = labelWithBodyMatch
        ? (() => {
          const [, label, remainder] = labelWithBodyMatch;
          const trimmedRemainder = remainder.trim().replace(/\s+/g, ' ');
          return trimmedRemainder ? `${label}   ${trimmedRemainder}` : label;
        })()
        : `   ${trimmedCode.replace(/\s+/g, ' ')}`;

      return commentPart ? `${formattedCode} ${commentPart.trimStart()}` : formattedCode;
    })
    .join('\n');
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
    lastMutatedRegisters: [],
  };
}

function parseDataSection(dataInput) {
  const strippedInput = stripComments(dataInput).trim();
  if (!strippedInput) {
    return { memory: {}, labels: {}, directive: '.long', stride: 8 };
  }

  const lines = strippedInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { memory: {}, labels: {}, directive: '.long', stride: 8 };
  }

  const directive = lines[0].toLowerCase();
  const stride = DATA_DIRECTIVES[directive];
  if (!stride) {
    throw new Error(`Data must start with one of ${Object.keys(DATA_DIRECTIVES).join(', ')}`);
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
        throw new Error(`Invalid ${directive} value "${rawValue}" for label ${label}`);
      }
      memory[nextAddress] = Number.parseInt(rawValue, 10);
      nextAddress += stride;
    });
  }

  return { memory, labels, directive, stride };
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

  const registerRef = parseRegisterReference(match[1]);
  if (!registerRef || registerRef.index > 30) return null;

  const offset = Number.parseInt(match[2], 10);
  const baseAddress = regs[registerRef.index];
  return {
    registerName: registerRef.canonical,
    offset,
    address: baseAddress + offset,
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

    const destRef = parseRegisterReference(args[0]);
    const sourceRef = parseRegisterReference(bracketOperand.register);
    if (!destRef || !sourceRef || destRef.index > 30 || sourceRef.index > 30) return null;
    if (![28, 29].includes(destRef.index)) return null;

    const effectiveAddress =
      regs[sourceRef.index] + Number.parseInt(bracketOperand.immediate.replace('#', ''), 10);
    const loadedValue = opcode === 'LDURB'
      ? ((memory[effectiveAddress] || 0) & 0xff)
      : (memory[effectiveAddress] || 0);

    return {
      registerName: destRef.canonical,
      address: loadedValue,
    };
  }

  if (opcode !== 'ADDI' && opcode !== 'SUBI') return null;

  const args = splitArgs(inst.argsStr).map(normalizeToken);
  if (args.length < 3 || !args[2].startsWith('#')) return null;

  const destRef = parseRegisterReference(args[0]);
  const sourceRef = parseRegisterReference(args[1]);
  if (!destRef || !sourceRef || destRef.index > 30 || sourceRef.index > 30) return null;

  const sourceValue = regs[sourceRef.index];
  const sourceIsStackPointerLike =
    sourceValue >= STACK_BASE - 4096 && sourceValue <= STACK_BASE + 4096;
  const destIsNamedPointer = [28, 29].includes(destRef.index);

  if (!sourceIsStackPointerLike && !destIsNamedPointer) return null;

  const immediate = Number.parseInt(args[2].replace('#', ''), 10);
  const finalAddress = opcode === 'ADDI' ? sourceValue + immediate : sourceValue - immediate;

  return {
    registerName: destRef.canonical,
    address: finalAddress,
  };
}

function getLrFinalPc(inst, regs, memory) {
  if (!inst?.opcode) return null;
  const opcode = inst.opcode.toUpperCase();

  if (opcode === 'BL') {
    return inst.pc + 4;
  }

  if (opcode === 'LDUR' || opcode === 'LDURB') {
    const args = splitArgs(inst.argsStr).map(normalizeToken);
    const destRef = parseRegisterReference(args[0] ?? '');
    if (!destRef || destRef.index !== 30) return null;
    const bracketOperand = parseRegisterImmediateOperand(splitArgs(inst.argsStr)[1] ?? '');
    if (!bracketOperand) return null;
    const sourceRef = parseRegisterReference(bracketOperand.register);
    if (!sourceRef || sourceRef.index > 30) return null;

    const effectiveAddress =
      regs[sourceRef.index] + Number.parseInt(bracketOperand.immediate.replace('#', ''), 10);
    return opcode === 'LDURB' ? ((memory[effectiveAddress] || 0) & 0xff) : (memory[effectiveAddress] || 0);
  }

  if (opcode === 'ADDI' || opcode === 'SUBI') {
    const args = splitArgs(inst.argsStr).map(normalizeToken);
    const destRef = parseRegisterReference(args[0] ?? '');
    const sourceRef = parseRegisterReference(args[1] ?? '');
    if (!destRef || !sourceRef || destRef.index !== 30 || sourceRef.index > 30 || !args[2]?.startsWith('#')) return null;
    const immediate = Number.parseInt(args[2].replace('#', ''), 10);
    return opcode === 'ADDI' ? regs[sourceRef.index] + immediate : regs[sourceRef.index] - immediate;
  }

  return null;
}

function getMutatedRegisters(previousRegs, nextRegs) {
  const mutated = [];
  for (let i = 0; i < 31; i += 1) {
    if (previousRegs[i] !== nextRegs[i]) mutated.push(i);
  }
  return mutated;
}

function getRegisterNames(indexes) {
  return new Set(indexes.map((index) => {
    if (index === 28) return 'SP';
    if (index === 29) return 'FP';
    if (index === 30) return 'LR';
    return `X${index}`;
  }));
}

function getSelectionLineRange(value, start, end) {
  const normalizedEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndBreak = value.indexOf('\n', normalizedEnd);
  const lineEnd = lineEndBreak === -1 ? value.length : lineEndBreak;
  return { lineStart, lineEnd };
}

function indentSelectedLines(value, start, end, shouldOutdent = false) {
  const { lineStart, lineEnd } = getSelectionLineRange(value, start, end);
  const selectedBlock = value.slice(lineStart, lineEnd);
  const lines = selectedBlock.split('\n');

  let nextSelectionStart = start;
  let nextSelectionEnd = end;
  const updatedLines = lines.map((line, index) => {
    if (!shouldOutdent) {
      if (index === 0) nextSelectionStart += TAB_SPACES.length;
      nextSelectionEnd += TAB_SPACES.length;
      return `${TAB_SPACES}${line}`;
    }

    let removed = 0;
    if (line.startsWith(TAB_SPACES)) removed = TAB_SPACES.length;
    else {
      const leadingSpaces = line.match(/^ +/)?.[0].length ?? 0;
      removed = Math.min(leadingSpaces, TAB_SPACES.length);
    }
    if (removed > 0 && index === 0) nextSelectionStart = Math.max(lineStart, nextSelectionStart - removed);
    nextSelectionEnd = Math.max(lineStart, nextSelectionEnd - removed);
    return line.slice(removed);
  });

  return {
    value: `${value.slice(0, lineStart)}${updatedLines.join('\n')}${value.slice(lineEnd)}`,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

function cutCurrentLine(value, start, end) {
  const { lineStart, lineEnd } = getSelectionLineRange(value, start, end);
  const removeEnd = value[lineEnd] === '\n' ? lineEnd + 1 : lineEnd;
  const nextValue = `${value.slice(0, lineStart)}${value.slice(removeEnd)}`;
  const nextSelection = Math.min(lineStart, nextValue.length);

  return {
    value: nextValue,
    selectionStart: nextSelection,
    selectionEnd: nextSelection,
  };
}

function getRegisterNoteAtSelection(value, selectionStart, selectionEnd, registerNotes) {
  if (!Object.keys(registerNotes).length) return null;

  const selectedText = value.slice(selectionStart, selectionEnd).trim().toUpperCase();
  if (selectedText && registerNotes[selectedText]) {
    return { register: selectedText, notes: registerNotes[selectedText] };
  }

  const scanStart = Math.max(0, selectionStart - 6);
  const scanEnd = Math.min(value.length, Math.max(selectionEnd, selectionStart) + 6);
  const nearbyText = value.slice(scanStart, scanEnd);

  for (const match of nearbyText.matchAll(REGISTER_PATTERN)) {
    const absoluteStart = scanStart + (match.index ?? 0);
    const absoluteEnd = absoluteStart + match[0].length;
    const cursorInside = selectionStart >= absoluteStart && selectionStart <= absoluteEnd;
    const selectionTouches = selectionEnd > absoluteStart && selectionStart < absoluteEnd;

    if (cursorInside || selectionTouches) {
      const normalized = match[0].toUpperCase();
      if (registerNotes[normalized]) {
        return { register: normalized, notes: registerNotes[normalized] };
      }
    }
  }

  return null;
}

function getInstructionRegisterUsage(inst) {
  const usage = { destination: new Set(), source: new Set() };
  if (!inst?.opcode) return usage;

  const opcode = inst.opcode.toUpperCase();
  const rawArgs = splitArgs(inst.argsStr ?? '');
  const args = rawArgs.map(normalizeToken);
  const addRef = (bucket, token) => {
    if (!token) return;
    const ref = parseRegisterReference(token);
    if (!ref || ref.index === 31) return;
    bucket.add(ref.index);
  };

  switch (opcode) {
    case 'ADD':
    case 'SUB':
    case 'MUL':
    case 'AND':
    case 'ORR':
    case 'EOR':
    case 'LSL':
    case 'LSR':
      addRef(usage.destination, args[0]);
      addRef(usage.source, args[1]);
      addRef(usage.source, args[2]);
      break;
    case 'ADDI':
    case 'SUBI':
    case 'ANDI':
    case 'ORRI':
    case 'EORI':
    case 'MOV':
    case 'LDA':
      addRef(usage.destination, args[0]);
      if (args[1] && !args[1].startsWith('#')) addRef(usage.source, args[1]);
      break;
    case 'SUBS':
      addRef(usage.destination, args[0]);
      addRef(usage.source, args[1]);
      addRef(usage.source, args[2]);
      break;
    case 'SUBIS':
      addRef(usage.destination, args[0]);
      addRef(usage.source, args[1]);
      break;
    case 'CMP':
    case 'CMPI':
    case 'PUTINT':
    case 'CBZ':
    case 'CBNZ':
    case 'BR':
      addRef(usage.source, args[0]);
      if (opcode === 'CMP' && args[1] && !args[1].startsWith('#')) addRef(usage.source, args[1]);
      break;
    case 'BL':
      usage.destination.add(30);
      break;
    case 'LDUR':
    case 'LDURB': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.destination, match[1]);
        addRef(usage.source, match[2]);
      }
      break;
    }
    case 'STUR':
    case 'STURB': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.source, match[1]);
        addRef(usage.source, match[2]);
      }
      break;
    }
    default:
      break;
  }

  return usage;
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
  const [dataDirective, setDataDirective] = useState('.long');
  const [dataStride, setDataStride] = useState(8);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [showMutationHints, setShowMutationHints] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [activeRegisterNote, setActiveRegisterNote] = useState(null);
  const traceListRef = useRef(null);
  const sourceEditorRef = useRef(null);
  const dataEditorRef = useRef(null);
  const sourceHighlightRef = useRef(null);
  const sourceLineNumbersRef = useRef(null);
  const sourceHistoryRef = useRef([]);
  const sourceRedoRef = useRef([]);
  const dataHistoryRef = useRef([]);
  const dataRedoRef = useRef([]);
  const executionHistoryRef = useRef([]);

  useEffect(() => {
    if (!traceListRef.current) return;
    const container = traceListRef.current;
    const row = container.querySelector(`[data-pc="${machineState.pc}"]`);
    if (!row) return;
    const targetTop = Math.max(0, row.offsetTop - container.offsetTop);
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [machineState.pc]);

  const handleExecutionUndo = () => {
    const previousState = executionHistoryRef.current.pop();
    if (!previousState) return;
    setMachineState(previousState);
    setError('');
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || !event.altKey) return;
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
      } else if (key === 'z' && executionHistoryRef.current.length) {
        event.preventDefault();
        handleExecutionUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assembled, machineState.halted, machineState]);

  const syncSourceScroll = () => {
    if (!sourceEditorRef.current || !sourceHighlightRef.current || !sourceLineNumbersRef.current) return;
    sourceHighlightRef.current.scrollTop = sourceEditorRef.current.scrollTop;
    sourceHighlightRef.current.scrollLeft = sourceEditorRef.current.scrollLeft;
    sourceLineNumbersRef.current.scrollTop = sourceEditorRef.current.scrollTop;
  };

  const updateActiveRegisterNote = (element, nextValue = sourceCode) => {
    if (!element) {
      setActiveRegisterNote(null);
      return;
    }

    const nextRegisterNotes = collectRegisterNotes(nextValue);
    setActiveRegisterNote(
      getRegisterNoteAtSelection(
        nextValue,
        element.selectionStart ?? 0,
        element.selectionEnd ?? 0,
        nextRegisterNotes,
      ),
    );
  };

  const commitSourceChange = (nextValue, options = {}) => {
    const { snapshot, selectionStart, selectionEnd } = options;
    pushHistoryEntry(sourceHistoryRef, snapshot ?? getEditorSnapshot(sourceEditorRef.current, sourceCode));
    sourceRedoRef.current = [];
    setSourceCode(nextValue);
    setAssembled(false);
    setActiveRegisterNote(null);
    if (typeof selectionStart === 'number') {
      queueSelectionRestore(sourceEditorRef, selectionStart, selectionEnd ?? selectionStart);
      window.requestAnimationFrame(() => updateActiveRegisterNote(sourceEditorRef.current, nextValue));
    }
  };

  const commitDataChange = (nextValue, options = {}) => {
    const { snapshot, selectionStart, selectionEnd } = options;
    pushHistoryEntry(dataHistoryRef, snapshot ?? getEditorSnapshot(dataEditorRef.current, dataInput));
    dataRedoRef.current = [];
    setDataInput(nextValue);
    if (typeof selectionStart === 'number') {
      queueSelectionRestore(dataEditorRef, selectionStart, selectionEnd ?? selectionStart);
    }
  };

  const undoEditorChange = (kind) => {
    const isSource = kind === 'source';
    const historyRef = isSource ? sourceHistoryRef : dataHistoryRef;
    const redoRef = isSource ? sourceRedoRef : dataRedoRef;
    const editorRef = isSource ? sourceEditorRef : dataEditorRef;
    const currentValue = isSource ? sourceCode : dataInput;
    const setValue = isSource ? setSourceCode : setDataInput;
    const previous = historyRef.current.pop();
    if (!previous) return;

    pushHistoryEntry(redoRef, getEditorSnapshot(editorRef.current, currentValue));
    setValue(previous.value);
    if (isSource) setAssembled(false);
    queueSelectionRestore(editorRef, previous.selectionStart, previous.selectionEnd);
    if (isSource) {
      window.requestAnimationFrame(() => updateActiveRegisterNote(editorRef.current, previous.value));
    }
  };

  const redoEditorChange = (kind) => {
    const isSource = kind === 'source';
    const historyRef = isSource ? sourceHistoryRef : dataHistoryRef;
    const redoRef = isSource ? sourceRedoRef : dataRedoRef;
    const editorRef = isSource ? sourceEditorRef : dataEditorRef;
    const currentValue = isSource ? sourceCode : dataInput;
    const setValue = isSource ? setSourceCode : setDataInput;
    const next = redoRef.current.pop();
    if (!next) return;

    pushHistoryEntry(historyRef, getEditorSnapshot(editorRef.current, currentValue));
    setValue(next.value);
    if (isSource) setAssembled(false);
    queueSelectionRestore(editorRef, next.selectionStart, next.selectionEnd);
    if (isSource) {
      window.requestAnimationFrame(() => updateActiveRegisterNote(editorRef.current, next.value));
    }
  };

  const handleFormatSource = () => {
    commitSourceChange(formatAssembly(sourceCode));
  };

  const handleSourceKeyDown = (event) => {
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoEditorChange('source');
      else undoEditorChange('source');
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      const result = cutCurrentLine(sourceCode, start, end);
      commitSourceChange(result.value, result);
      return;
    }

    if (event.key !== 'Tab') return;

    event.preventDefault();
    const result = indentSelectedLines(sourceCode, start, end, event.shiftKey);
    commitSourceChange(result.value, result);
  };

  const handleDataKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) redoEditorChange('data');
    else undoEditorChange('data');
  };

  const handleAssemble = () => {
    try {
      const originalLines = sourceCode.split('\n');
      const lines = stripComments(sourceCode).split('\n');
      const nextProgram = [];
      const nextCodeLabels = {};
      let instIndex = 0;

      for (let i = 0; i < lines.length; i += 1) {
        let line = lines[i].trim();
        if (!line) continue;

        const labelMatch = line.match(/^([a-zA-Z_]\w*):(.*)/);
        if (labelMatch) {
          nextCodeLabels[labelMatch[1]] = instIndex * 4;
          line = labelMatch[2].trim();
        }

        if (!line) continue;
        if (/^S\s+T\s+O\s+P$/i.test(line)) line = 'STOP';

        const instMatch = line.match(/^(\S+)(?:\s+(.*))?$/);
        if (!instMatch) throw new Error(`Unable to parse instruction: ${line}`);

        nextProgram.push({
          opcode: instMatch[1].toUpperCase(),
          argsStr: instMatch[2]?.trim() ?? '',
          original: originalLines[i].trim(),
          lineNum: i + 1,
          pc: instIndex * 4,
        });
        instIndex += 1;
      }

      const { memory: dataMemory, labels: dataLabels, directive, stride } = parseDataSection(dataInput);
      const duplicateLabels = Object.keys(dataLabels).filter((label) => nextCodeLabels[label] !== undefined);
      if (duplicateLabels.length) {
        throw new Error(`Duplicate label name used in code and data: ${duplicateLabels[0]}`);
      }

      executionHistoryRef.current = [];
      setProgram(nextProgram);
      setLabels({ ...nextCodeLabels, ...dataLabels });
      setBreakpoints([]);
      setAssembled(true);
      setMachineState({ ...getInitialState(), memory: dataMemory });
      setDataDirective(directive);
      setDataStride(stride);
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
      const ref = parseRegisterReference(registerName);
      if (!ref || ref.index >= 31) return;
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Computed NaN for ${registerName} - check immediate or operand syntax`);
      }
      newRegs[ref.index] = Math.trunc(value);
    };

    const readReg = (registerName) => {
      const ref = parseRegisterReference(registerName);
      if (!ref) throw new Error(`Invalid register ${registerName}`);
      if (ref.index === 31) return 0;
      const value = newRegs[ref.index];
      return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
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
          if (args.length === 2 && bracketOperand) writeReg(args[0], readReg(bracketOperand.register) + parseImm(bracketOperand.immediate));
          else writeReg(args[0], readReg(args[1]) + readOperand(args[2]));
          break;
        }
        case 'SUBI': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          if (args.length === 2 && bracketOperand) writeReg(args[0], readReg(bracketOperand.register) - parseImm(bracketOperand.immediate));
          else writeReg(args[0], readReg(args[1]) - readOperand(args[2]));
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
          writeReg('LR', pc + 4);
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
          writeReg(args[0], args[1].startsWith('#') ? parseImm(args[1]) : readReg(args[1]));
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
            lastMutatedRegisters: getMutatedRegisters(regs, newRegs),
          };
        case 'LDUR':
        case 'LDURB':
        case 'STUR': {
          const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
          if (!match) throw new Error('Invalid syntax. Expected: OP Xt, [Xn, #offset]');
          const addr = readReg(match[2]) + (match[3] ? Number.parseInt(match[3], 10) : 0);
          if (inst.opcode === 'LDUR') writeReg(match[1], newMem[addr] ?? 0);
          else if (inst.opcode === 'LDURB') writeReg(match[1], (newMem[addr] || 0) & 0xff);
          else newMem[addr] = readReg(match[1]);
          break;
        }
        case 'STURB': {
          const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
          if (!match) throw new Error('Invalid syntax. Expected: OP Xt, [Xn, #offset]');
          const addr = readReg(match[2]) + (match[3] ? Number.parseInt(match[3], 10) : 0);
          newMem[addr] = readReg(match[1]) & 0xff;
          break;
        }
        default:
          throw new Error(`Unsupported instruction: ${inst.opcode}`);
      }
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
      lastMutatedRegisters: getMutatedRegisters(regs, newRegs),
    };
  };

  const handleStep = () => {
    try {
      executionHistoryRef.current.push(machineState);
      setMachineState(executeStep(program, labels, machineState));
      setError('');
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
      setMachineState((state) => ({ ...state, halted: true }));
    }
  };

  const handleRun = () => {
    try {
      executionHistoryRef.current.push(machineState);
      let state = machineState;
      let count = 0;
      let skipFirst = breakpoints.includes(state.pc);
      const maxSteps = 5000;

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
      setError(count >= maxSteps ? `Execution paused: Reached safety limit of ${maxSteps} instructions.` : '');
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
    }
  };

  const handleReset = () => {
    executionHistoryRef.current = [];
    setMachineState(getInitialState());
    setDataInput('');
    setError('');
  };

  const handleClearData = () => {
    setDataInput('');
    setMachineState((state) => ({ ...state, memory: {} }));
    setError('');
  };

  const toggleBreakpoint = (pc) => {
    setBreakpoints((current) => (
      current.includes(pc)
        ? current.filter((value) => value !== pc)
        : [...current, pc].sort((a, b) => a - b)
    ));
  };

  const getRegAlias = (index) => {
    if (index === 28) return ' (SP)';
    if (index === 29) return ' (FP)';
    if (index === 30) return ' (LR)';
    return '';
  };

  const spAligned = machineState.regs[28];
  const fpAligned = machineState.regs[29];
  const lrPc = machineState.regs[30];
  const lrInst = program.find((inst) => inst.pc === lrPc);
  const currentInst = assembled && !machineState.halted ? program[machineState.pc / 4] : null;
  const currentRegisterUsage = getInstructionRegisterUsage(currentInst);
  const stackOffsetPointer = getStackOffsetPointer(currentInst, machineState.regs);
  const stackFinalPointer = getStackFinalPointer(currentInst, machineState.regs, machineState.memory);
  const lrFinalPc = getLrFinalPc(currentInst, machineState.regs, machineState.memory);
  const memoryAddresses = Object.keys(machineState.memory).map(Number).filter((value) => !Number.isNaN(value));
  const addressStride = Math.min(
    8,
    ...memoryAddresses
      .map((address, index) => (index === 0 ? Infinity : Math.abs(address - memoryAddresses[index - 1])))
      .filter((value) => Number.isFinite(value) && value > 0),
    dataStride,
  );
  const stackStep = Number.isFinite(addressStride) && addressStride > 0 ? addressStride : 8;
  const visibleAnchors = [
    ...memoryAddresses,
    spAligned,
    fpAligned,
    stackOffsetPointer?.address,
    stackFinalPointer?.address,
  ].filter((value) => value !== null && value !== undefined);
  const minMem = visibleAnchors.length ? Math.min(...visibleAnchors) : STACK_BASE;
  const maxMem = visibleAnchors.length ? Math.max(...visibleAnchors) : STACK_BASE;

  let dynamicTop = Math.max(STACK_BASE + 16, spAligned + 16, fpAligned + 16, maxMem + 16);
  dynamicTop = Math.ceil(dynamicTop / stackStep) * stackStep;
  let bottomAddr = Math.min(minMem, spAligned, fpAligned) - (5 * stackStep);
  bottomAddr = Math.floor(bottomAddr / stackStep) * stackStep;

  const stackAddresses = [];
  for (let addr = dynamicTop; addr >= bottomAddr; addr -= stackStep) stackAddresses.push(addr);

  const spIdx = stackAddresses.indexOf(spAligned);
  const fpIdx = stackAddresses.indexOf(fpAligned);
  const frameTop = Math.max(spAligned, fpAligned);
  const frameBottom = Math.min(spAligned, fpAligned);
  const offsetPointerIdx = stackOffsetPointer?.address === undefined ? -1 : stackAddresses.indexOf(stackOffsetPointer.address);
  const finalPointerIdx = stackFinalPointer?.address === undefined ? -1 : stackAddresses.indexOf(stackFinalPointer.address);
  const offsetSharesSp = offsetPointerIdx !== -1 && offsetPointerIdx === spIdx;
  const offsetSharesFp = offsetPointerIdx !== -1 && offsetPointerIdx === fpIdx;
  const finalSharesSp = finalPointerIdx !== -1 && finalPointerIdx === spIdx;
  const finalSharesFp = finalPointerIdx !== -1 && finalPointerIdx === fpIdx;
  const finalSharesOffset = finalPointerIdx !== -1 && finalPointerIdx === offsetPointerIdx;
  const lrFinalInst = program.find((inst) => inst.pc === lrFinalPc);
  const sourceLineNumbers = sourceCode.split('\n').map((_, index) => `${index + 1}`).join('\n');
  const mutatedRegisterNames = getRegisterNames(machineState.lastMutatedRegisters);
  const registerNotes = collectRegisterNotes(sourceCode);

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
          <button type="button" className="btn btn-secondary" onClick={handleExecutionUndo} disabled={!executionHistoryRef.current.length} title="Alt + Z">
            <StepBack size={16} /> Undo Step
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
            <div className="panel-header-controls">
              <button
                type="button"
                className={`btn btn-small btn-ghost${showShortcutHelp ? ' btn-toggle-active' : ''}`}
                onClick={() => setShowShortcutHelp((current) => !current)}
              >
                <HelpCircle size={14} /> Shortcuts
              </button>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={showWhitespace}
                  onChange={(event) => setShowWhitespace(event.target.checked)}
                />
                <Eye size={14} /> Whitespace
              </label>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={showMutationHints}
                  onChange={(event) => setShowMutationHints(event.target.checked)}
                />
                <History size={14} /> Mutations
              </label>
              <button type="button" className="btn btn-small btn-ghost" onClick={handleFormatSource}>
                Format
              </button>
              {!assembled ? <span className="panel-tag">Unassembled</span> : null}
            </div>
          </div>
          {showShortcutHelp ? (
            <div className="info-card">
              <div className="info-card-title">Editor shortcuts</div>
              <div className="info-card-grid">
                <span>Ctrl+X</span>
                <span>Cuts the current line</span>
                <span>Tab</span>
                <span>Indents the current line or selection</span>
                <span>Shift+Tab</span>
                <span>Outdents the current line or selection</span>
                <span>Ctrl+Z</span>
                <span>Undo in source or data editor</span>
                <span>Ctrl+Shift+Z</span>
                <span>Redo in source or data editor</span>
                <span>Alt+Z</span>
                <span>Undo the last execution snapshot</span>
              </div>
            </div>
          ) : null}
          <div className="source-editor-shell">
            <pre ref={sourceLineNumbersRef} className="source-line-numbers" aria-hidden="true">
              {sourceLineNumbers}
            </pre>
            <pre
              ref={sourceHighlightRef}
              className="source-highlight custom-scrollbar"
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: highlightSource(sourceCode, {
                  mutatedRegisters: mutatedRegisterNames,
                  showMutationHints,
                  showWhitespace,
                  registerNotes,
                }),
              }}
            />
            <textarea
              ref={sourceEditorRef}
              className="source-editor custom-scrollbar"
              value={sourceCode}
              onChange={(event) => commitSourceChange(event.target.value, {
                snapshot: getEditorSnapshot(event.currentTarget, sourceCode),
              })}
              onKeyDown={handleSourceKeyDown}
              onClick={(event) => updateActiveRegisterNote(event.currentTarget, event.currentTarget.value)}
              onKeyUp={(event) => updateActiveRegisterNote(event.currentTarget, event.currentTarget.value)}
              onSelect={(event) => updateActiveRegisterNote(event.currentTarget, event.currentTarget.value)}
              onScroll={syncSourceScroll}
              spellCheck="false"
              wrap="off"
            />
          </div>
          {activeRegisterNote ? (
            <div className="note-card note-card-floating">
              <div className="note-card-title">{activeRegisterNote.register} note</div>
              <div className="note-card-list">
                {activeRegisterNote.notes.map((note, index) => (
                  <div key={`${activeRegisterNote.register}-${index}`} className="note-card-body">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel panel-data">
          <div className="panel-header">
            <span>Data</span>
            <span className="panel-tag">{dataDirective} ({dataStride} byte cells)</span>
          </div>
          <div className="editor-statusbar">
            <span>Supports `.byte`, `.half`, `.word`, `.long`, `.quad`</span>
          </div>
          <div className="data-editor-shell">
            <textarea
              ref={dataEditorRef}
              className="data-editor custom-scrollbar"
              value={dataInput}
              onChange={(event) => commitDataChange(event.target.value, {
                snapshot: getEditorSnapshot(event.currentTarget, dataInput),
              })}
              onKeyDown={handleDataKeyDown}
              spellCheck="false"
              wrap="off"
              placeholder={['.long', 'arr1: 1, 2, 3', 'arr2: 4, 5, 6'].join('\n')}
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
                  <div key={`${line}-${index}`} className="console-line">{line}</div>
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
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </div>
          <div className="register-grid custom-scrollbar">
            {machineState.regs.map((value, index) => {
              if (index === 31) return null;
              const isMutated = machineState.lastMutatedRegisters.includes(index);
              const isDestination = currentRegisterUsage.destination.has(index);
              const isSource = currentRegisterUsage.source.has(index);
              const cardClasses = [
                'register-card',
                isMutated ? 'register-card-mutated' : '',
                isDestination ? 'register-card-destination' : '',
                !isDestination && isSource ? 'register-card-source' : '',
              ].filter(Boolean).join(' ');

              const registerNoteEntries =
                registerNotes[`X${index}`]
                ?? registerNotes[index === 28 ? 'SP' : index === 29 ? 'FP' : index === 30 ? 'LR' : '']
                ?? [];

              return (
                <div
                  key={index}
                  className={cardClasses}
                  title={registerNoteEntries.length ? registerNoteEntries.join('\n') : undefined}
                >
                  <div className="register-card-top">
                    <span className="register-name">
                      X{index}
                      <span className="register-alias">{getRegAlias(index)}</span>
                    </span>
                    <span className="register-value">{formatValue(value, registerFormat)}</span>
                  </div>
                  {registerNoteEntries.length ? (
                    <div className="register-note-list">
                      {registerNoteEntries.map((note, noteIndex) => (
                        <span key={`x${index}-note-${noteIndex}`} className="register-note">
                          {note}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="register-card">
              <div className="register-card-top">
                <span className="register-name">XZR</span>
                <span className="register-value">{formatValue(0, registerFormat)}</span>
              </div>
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
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </span>
          </div>
          <div className="editor-statusbar">
            <span>Address stride: {stackStep} byte{stackStep === 1 ? '' : 's'}</span>
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
                      <span className="stack-pointer-final-label">{stackFinalPointer.registerName} final -&gt;</span>
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
                      <span className="stack-pointer-final-label">{stackFinalPointer.registerName} final -&gt;</span>
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
                      <span className="stack-pointer-final-label">{stackFinalPointer.registerName} final -&gt;</span>
                    ) : null}
                  </div>
                ) : null}
                {finalPointerIdx !== -1 && !finalSharesSp && !finalSharesFp && !finalSharesOffset ? (
                  <div className="stack-pointer stack-pointer-final" style={{ top: finalPointerIdx * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    <span className="stack-pointer-final-label">{stackFinalPointer.registerName} final -&gt;</span>
                  </div>
                ) : null}
              </div>

              <div className="stack-grid">
                {stackAddresses.map((addr) => {
                  const value = machineState.memory[addr];
                  const hasValue = value !== undefined;
                  const isInFrame = addr <= frameTop && addr >= frameBottom;
                  const isOffsetTarget = stackOffsetPointer?.address !== undefined && addr === stackOffsetPointer.address;

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
