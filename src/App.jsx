

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Cpu,
  Eye,
  HelpCircle,
  Layers,
  LayoutList,
  Play,
  RotateCcw,
  StepBack,
  StepForward,
  Trash2,
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

CMPI X0, #1        // Compare N with 1
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
const STACK_STRIDE_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
const INT64_MIN = -(2 ** 63);
const INT64_MAX = (2 ** 63) - 1;
const IMPLEMENTED_INSTRUCTIONS = new Set([
  'ADD', 'ADDS', 'ADDI', 'ADDIS', 'SUB', 'SUBS', 'SUBI', 'SUBIS',
  'AND', 'ANDS', 'ANDI', 'ANDIS', 'ORR', 'ORRI', 'EOR', 'EORI',
  'LSL', 'LSR', 'LDUR', 'STUR', 'LDURSW', 'STURW', 'LDURH', 'STURH',
  'LDURB', 'STURB', 'LDXR', 'STXR', 'MOVZ', 'MOVK', 'CBZ', 'CBNZ',
  'B.EQ', 'B.NE', 'B.HS', 'B.LO', 'B.HI', 'B.LS', 'B.GE', 'B.LT',
  'B.GT', 'B.LE', 'B.MI', 'B.PL', 'B.VS', 'B.VC', 'B', 'BR', 'BL',
  'CMP', 'CMPI', 'MOV', 'MUL', 'LDA', 'PUTINT', 'STOP',
]);
const INSTRUCTION_DOCS = [
  ['ADD', 'Adds two registers and writes the result.', 'ADD X0, X1, X2'],
  ['ADDS', 'Adds two registers and updates NZCV flags.', 'ADDS X0, X1, X2'],
  ['ADDI', 'Adds an immediate value to a register.', 'ADDI X0, X1, #16'],
  ['ADDIS', 'Adds an immediate value and updates NZCV flags.', 'ADDIS X0, X1, #1'],
  ['SUB', 'Subtracts one register from another.', 'SUB X0, X1, X2'],
  ['SUBS', 'Subtracts and updates NZCV flags.', 'SUBS X0, X1, X2'],
  ['SUBI', 'Subtracts an immediate value from a register.', 'SUBI X0, X1, #8'],
  ['SUBIS', 'Subtracts an immediate value and updates NZCV flags.', 'SUBIS X0, X1, #1'],
  ['AND', 'Bitwise AND between two registers.', 'AND X0, X1, X2'],
  ['ANDS', 'Bitwise AND and updates N and Z flags.', 'ANDS X0, X1, X2'],
  ['ANDI', 'Bitwise AND with an immediate mask.', 'ANDI X0, X1, #255'],
  ['ANDIS', 'Bitwise AND with an immediate mask and updates N and Z.', 'ANDIS X0, X1, #255'],
  ['ORR', 'Bitwise OR between two registers.', 'ORR X0, X1, X2'],
  ['ORRI', 'Bitwise OR with an immediate mask.', 'ORRI X0, X1, #1'],
  ['EOR', 'Bitwise exclusive OR between two registers.', 'EOR X0, X1, X2'],
  ['EORI', 'Bitwise exclusive OR with an immediate mask.', 'EORI X0, X1, #1'],
  ['LSL', 'Logical shift left by an immediate amount.', 'LSL X0, X1, #3'],
  ['LSR', 'Logical shift right by an immediate amount.', 'LSR X0, X1, #2'],
  ['LDUR', 'Loads a full register-sized value from memory.', 'LDUR X0, [SP, #8]'],
  ['STUR', 'Stores a full register-sized value to memory.', 'STUR X0, [SP, #8]'],
  ['LDURSW', 'Loads a 32-bit word and sign-extends it to 64 bits.', 'LDURSW X0, [X1, #0]'],
  ['STURW', 'Stores the low 32 bits of a register.', 'STURW X0, [X1, #0]'],
  ['LDURH', 'Loads a 16-bit halfword and zero-extends it.', 'LDURH X0, [X1, #2]'],
  ['STURH', 'Stores the low 16 bits of a register.', 'STURH X0, [X1, #2]'],
  ['LDURB', 'Loads a byte and zero-extends it.', 'LDURB X0, [X1, #0]'],
  ['STURB', 'Stores the low 8 bits of a register.', 'STURB X0, [X1, #0]'],
  ['LDXR', 'Loads from memory for an exclusive-access style sequence.', 'LDXR X0, [X1, #0]'],
  ['STXR', 'Stores to memory and writes a success status register.', 'STXR X2, X0, [X1, #0]'],
  ['MOVZ', 'Moves a 16-bit immediate into a register and clears the rest.', 'MOVZ X0, #42, LSL #16'],
  ['MOVK', 'Patches a 16-bit immediate into part of an existing register.', 'MOVK X0, #1, LSL #0'],
  ['CBZ', 'Branches when a register is zero.', 'CBZ X0, done'],
  ['CBNZ', 'Branches when a register is not zero.', 'CBNZ X0, loop'],
  ['B.EQ', 'Branches when Z is set.', 'B.EQ equal_label'],
  ['B.NE', 'Branches when Z is clear.', 'B.NE not_equal'],
  ['B.HS', 'Branches when carry is set.', 'B.HS carry_or_same'],
  ['B.LO', 'Branches when carry is clear.', 'B.LO lower'],
  ['B.HI', 'Branches when C is set and Z is clear.', 'B.HI higher'],
  ['B.LS', 'Branches when C is clear or Z is set.', 'B.LS lower_or_same'],
  ['B.GE', 'Branches when the signed comparison is greater-than-or-equal.', 'B.GE ge_label'],
  ['B.LT', 'Branches when the signed comparison is less-than.', 'B.LT lt_label'],
  ['B.GT', 'Branches when the signed comparison is greater-than.', 'B.GT gt_label'],
  ['B.LE', 'Branches when the signed comparison is less-than-or-equal.', 'B.LE le_label'],
  ['B.MI', 'Branches when the negative flag is set.', 'B.MI negative_case'],
  ['B.PL', 'Branches when the negative flag is clear.', 'B.PL non_negative'],
  ['B.VS', 'Branches when overflow is set.', 'B.VS overflow_case'],
  ['B.VC', 'Branches when overflow is clear.', 'B.VC no_overflow'],
  ['B', 'Unconditionally branches to a label.', 'B loop'],
  ['BR', 'Branches to the address held in a register.', 'BR LR'],
  ['BL', 'Branches to a label and stores the return PC in LR.', 'BL factorial'],
  ['CMP', 'Compares a register against a register or immediate by updating flags.', 'CMP X0, #1'],
  ['CMPI', 'Compares a register against an immediate by updating flags.', 'CMPI X0, #1'],
  ['MOV', 'Copies an immediate or register value into the destination.', 'MOV X0, #1024'],
  ['MUL', 'Multiplies two registers.', 'MUL X1, X1, X0'],
  ['LDA', 'Loads an immediate or label address into a register.', 'LDA X0, arr1'],
  ['PUTINT', 'Appends a register value to the mini console output.', 'PUTINT X0'],
  ['STOP', 'Halts the simulator immediately.', 'STOP'],
];
const INSTRUCTION_DOC_MAP = Object.fromEntries(
  INSTRUCTION_DOCS.map(([opcode, summary, example]) => [opcode, { opcode, summary, example }]),
);

function sanitizeCommentNote(note) {
  return note.replace(/\*\/$/, '').trim();
}

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
  return token.replace(/\[|\]/g, '').trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function stripCommentFromLine(line, initialInBlockComment = false) {
  const { codePart, inBlockComment } = splitLineIntoCodeAndComment(line, initialInBlockComment);
  return { codePart, inBlockComment };
}

function getInstructionDoc(opcode) {
  return INSTRUCTION_DOC_MAP[opcode?.toUpperCase()] ?? null;
}

function buildFallbackInstructionDoc(opcode, example = '') {
  if (!opcode) return null;
  return {
    opcode: opcode.toUpperCase(),
    summary: 'This instruction is currently unsupported by the simulator.',
    example: example || `${opcode.toUpperCase()} ...`,
  };
}

function getInstructionDocsForDisplay(code) {
  const docs = INSTRUCTION_DOCS.map(([opcode, summary, example]) => ({
    opcode,
    summary,
    example,
    supported: IMPLEMENTED_INSTRUCTIONS.has(opcode),
  }));
  const seen = new Set(docs.map((doc) => doc.opcode));

  getParsedSourceLines(code).forEach((line) => {
    if (!line.isPotentialInstruction || seen.has(line.opcode)) return;
    docs.push({
      ...buildFallbackInstructionDoc(line.opcode, line.codePart.trim()),
      supported: false,
    });
    seen.add(line.opcode);
  });

  return docs;
}

function extractLineNumberFromErrorMessage(message) {
  const match = message?.match(/\bLine\s+(\d+):/i);
  if (!match) return null;
  const lineNumber = Number.parseInt(match[1], 10);
  return Number.isNaN(lineNumber) ? null : lineNumber;
}

function getParsedSourceLines(code) {
  const lines = code.split('\n');
  const parsedLines = [];
  let inBlockComment = false;

  lines.forEach((line, index) => {
    const { codePart, inBlockComment: nextInBlockComment } = stripCommentFromLine(line, inBlockComment);
    inBlockComment = nextInBlockComment;
    const trimmed = codePart.trim();
    const labelMatch = trimmed.match(/^([A-Za-z_]\w*:)(.*)$/);
    const codeWithoutLabel = labelMatch ? labelMatch[2].trim() : trimmed;
    const instMatch = codeWithoutLabel.match(/^(\S+)(?:\s+(.*))?$/);
    const opcode = instMatch?.[1]?.toUpperCase() ?? null;

    parsedLines.push({
      lineNumber: index + 1,
      raw: line,
      codePart,
      commentPart: line.slice(codePart.length),
      opcode,
      argsStr: instMatch?.[2]?.trim() ?? '',
      isPotentialInstruction: Boolean(opcode),
      isSupported: !opcode || IMPLEMENTED_INSTRUCTIONS.has(opcode),
    });
  });

  return parsedLines;
}

function getInstructionInfoAtSelection(value, selectionStart) {
  const lines = getParsedSourceLines(value);
  let offset = 0;

  for (const line of lines) {
    const lineEnd = offset + line.raw.length;
    const isTargetLine =
      selectionStart >= offset && (selectionStart <= lineEnd || (selectionStart === value.length && lineEnd === value.length));
    if (!isTargetLine) {
      offset = lineEnd + 1;
      continue;
    }

    if (!line.opcode) return null;
    const opcodeIndex = line.codePart.toUpperCase().indexOf(line.opcode);
    if (opcodeIndex === -1) return null;
    const absoluteOpcodeStart = offset + opcodeIndex;
    const absoluteOpcodeEnd = absoluteOpcodeStart + line.opcode.length;
    const isInsideOpcode = selectionStart >= absoluteOpcodeStart && selectionStart <= absoluteOpcodeEnd;
    return isInsideOpcode
      ? (getInstructionDoc(line.opcode) ?? buildFallbackInstructionDoc(line.opcode, line.codePart.trim()))
      : null;
  }

  return null;
}

function toUnsigned32(value) {
  return value >>> 0;
}

function signExtend32(value) {
  const masked = toUnsigned32(value);
  return masked & 0x80000000 ? masked - 0x100000000 : masked;
}

function unsignedRightShift64ish(value, amount) {
  return Math.floor(toUnsigned32(value) / (2 ** amount));
}

function getArithmeticFlagsFromAdd(a, b, result) {
  const unsignedA = BigInt.asUintN(64, BigInt(Math.trunc(a)));
  const unsignedB = BigInt.asUintN(64, BigInt(Math.trunc(b)));
  const unsignedSum = unsignedA + unsignedB;
  const signedA = BigInt.asIntN(64, BigInt(Math.trunc(a)));
  const signedB = BigInt.asIntN(64, BigInt(Math.trunc(b)));
  const signedResult = BigInt.asIntN(64, signedA + signedB);

  return {
    N: result < 0 ? 1 : 0,
    Z: result === 0 ? 1 : 0,
    C: unsignedSum > ((1n << 64n) - 1n) ? 1 : 0,
    V:
      (signedA >= 0n && signedB >= 0n && signedResult < 0n)
      || (signedA < 0n && signedB < 0n && signedResult >= 0n)
        ? 1
        : 0,
  };
}

function getArithmeticFlagsFromSub(a, b, result) {
  const unsignedA = BigInt.asUintN(64, BigInt(Math.trunc(a)));
  const unsignedB = BigInt.asUintN(64, BigInt(Math.trunc(b)));
  const signedA = BigInt.asIntN(64, BigInt(Math.trunc(a)));
  const signedB = BigInt.asIntN(64, BigInt(Math.trunc(b)));
  const signedResult = BigInt.asIntN(64, signedA - signedB);

  return {
    N: result < 0 ? 1 : 0,
    Z: result === 0 ? 1 : 0,
    C: unsignedA >= unsignedB ? 1 : 0,
    V:
      (signedA >= 0n && signedB < 0n && signedResult < 0n)
      || (signedA < 0n && signedB >= 0n && signedResult >= 0n)
        ? 1
        : 0,
  };
}

function getLogicalFlags(result, previousFlags) {
  return {
    ...previousFlags,
    N: result < 0 ? 1 : 0,
    Z: result === 0 ? 1 : 0,
  };
}

function isRegisterOutOfRange(value) {
  return !Number.isFinite(value) || value < INT64_MIN || value > INT64_MAX;
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
    const { commentPart, inBlockComment: nextInBlockComment } =
      splitLineIntoCodeAndComment(line, inBlockComment);
    inBlockComment = nextInBlockComment;
    if (!commentPart.trim()) return;

    for (const match of commentPart.matchAll(/@((?:X(?:[12]?\d|3[01]|ZR)|SP|FP|LR))\s*:?\s*([^@]+)/gi)) {
      const registerName = match[1].toUpperCase();
      const note = sanitizeCommentNote(match[2]);
      if (!note) continue;
      if (!notes[registerName]) notes[registerName] = [];
      notes[registerName].push(note);
    }
  });

  return notes;
}

function highlightCodeSegment(segment, showWhitespace, registerNotes) {
  const escapedSegment = escapeHtml(segment);
  const labelMatch = escapedSegment.match(/^(\s*[A-Za-z_]\w*:)(.*)$/);
  const labelPrefix = labelMatch ? `<span class="token-label">${labelMatch[1]}</span>` : '';
  const codeBody = labelMatch ? labelMatch[2] : escapedSegment;

  const highlightedBody = codeBody.replace(
    /\b(X(?:[12]?\d|3[01]|ZR)|SP|FP|LR)\b|#-?\d+\b|\b([A-Za-z]+(?:\.[A-Za-z]+)?)\b/gi,
    (match, registerMatch, opcodeMatch) => {
      if (registerMatch) {
        const normalized = registerMatch.toUpperCase();
        const note = registerNotes[normalized];
        const title = note?.length ? ` title="${escapeHtml(note.join('\n'))}"` : '';
        return `<span class="token-register"${title}>${match}</span>`;
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
    showWhitespace = false,
    registerNotes = {},
    errorLineNumber = null,
  } = options;
  let html = '';
  let buffer = '';
  let inLineComment = false;
  let inBlockComment = false;

  const flushCodeBuffer = () => {
    if (!buffer) return;
    html += highlightCodeSegment(
      buffer,
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

  return html
    .split('\n')
    .map((line, index) => {
      const classes = ['source-code-line'];
      if (errorLineNumber === index + 1) classes.push('source-code-line-error');
      return `<span class="${classes.join(' ')}">${line || '&nbsp;'}</span>`;
    })
    .join('');
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

function formatSingleLineComments(code) {
  const lines = code.split('\n');
  const lineMeta = [];
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index];
    const withoutTrailingWhitespace = originalLine.replace(/\s+$/g, '');
    const { codePart, commentPart, inBlockComment: nextInBlockComment } =
      splitLineIntoCodeAndComment(withoutTrailingWhitespace, inBlockComment);
    inBlockComment = nextInBlockComment;

    const trimmedCode = codePart.trim();
    const trimmedComment = commentPart.trimStart();
    const hasInlineSlashComment =
      Boolean(trimmedCode)
      && trimmedComment.startsWith('//')
      && !trimmedComment.startsWith('///');

    lineMeta.push({
      originalLine,
      codePart,
      trimmedCode,
      commentPart,
      trimmedComment,
      hasInlineSlashComment,
    });
  }

  const formattedLines = [...lines];
  let groupStart = null;

  const flushGroup = (endExclusive) => {
    if (groupStart === null) return;
    const group = lineMeta.slice(groupStart, endExclusive);
    const maxCodeLength = group.reduce((max, line) => {
      const codeLength = line.codePart.replace(/\s+$/g, '').length;
      return Math.max(max, codeLength);
    }, 0);

    group.forEach((line, offset) => {
      const codeWithoutTrailingWhitespace = line.codePart.replace(/\s+$/g, '');
      const paddingWidth = Math.max(1, maxCodeLength - codeWithoutTrailingWhitespace.length + 1);
      formattedLines[groupStart + offset] = `${codeWithoutTrailingWhitespace}${' '.repeat(paddingWidth)}${line.trimmedComment}`;
    });

    groupStart = null;
  };

  for (let index = 0; index <= lineMeta.length; index += 1) {
    const line = lineMeta[index];
    const isEligible = Boolean(line?.hasInlineSlashComment);

    if (isEligible && groupStart === null) {
      groupStart = index;
      continue;
    }

    if (isEligible) continue;
    flushGroup(index);
  }

  return formattedLines.join('\n');
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
    memoryNotes: {},
    consoleOutput: [],
    halted: false,
  };
}

function collectMemoryNotes(code) {
  const notesByLine = {};
  let inBlockComment = false;

  code.split('\n').forEach((line, index) => {
    const { commentPart, inBlockComment: nextInBlockComment } =
      splitLineIntoCodeAndComment(line, inBlockComment);
    inBlockComment = nextInBlockComment;
    if (!commentPart.trim()) return;

    const match = commentPart.match(/@memory\s+([^@]+)/i);
    if (!match) return;
    const note = sanitizeCommentNote(match[1]);
    if (note) notesByLine[index + 1] = note;
  });

  return notesByLine;
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

function resolveBranchTarget(labelMap, label) {
  if (labelMap[label] === undefined) throw new Error(`Label ${label} not found`);
  return labelMap[label];
}

function getPredictedNextPc(prog, labelMap, state) {
  if (state.halted || state.pc / 4 >= prog.length) return null;

  const inst = prog[state.pc / 4];
  const args = splitArgs(inst.argsStr ?? '').map(normalizeToken);
  const readReg = (registerName) => {
    const ref = parseRegisterReference(registerName);
    if (!ref) throw new Error(`Invalid register ${registerName}`);
    return ref.index === 31 ? 0 : (state.regs[ref.index] ?? 0);
  };

  switch (inst.opcode) {
    case 'B':
    case 'BL':
      return resolveBranchTarget(labelMap, args[0]);
    case 'BR':
      return readReg(args[0]);
    case 'B.EQ':
      return state.flags.Z ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.NE':
      return !state.flags.Z ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.HS':
      return state.flags.C ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.LO':
      return !state.flags.C ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.HI':
      return state.flags.C && !state.flags.Z ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.LS':
      return !state.flags.C || state.flags.Z ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.LT':
      return state.flags.N !== state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.LE':
      return state.flags.Z || state.flags.N !== state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.GT':
      return !state.flags.Z && state.flags.N === state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.GE':
      return state.flags.N === state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.MI':
      return state.flags.N ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.PL':
      return !state.flags.N ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.VS':
      return state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'B.VC':
      return !state.flags.V ? resolveBranchTarget(labelMap, args[0]) : inst.pc + 4;
    case 'CBZ':
      return readReg(args[0]) === 0 ? resolveBranchTarget(labelMap, args[1]) : inst.pc + 4;
    case 'CBNZ':
      return readReg(args[0]) !== 0 ? resolveBranchTarget(labelMap, args[1]) : inst.pc + 4;
    case 'STOP':
      return null;
    default:
      return inst.pc + 4;
  }
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

    const removed = line.startsWith(TAB_SPACES)
      ? TAB_SPACES.length
      : Math.min(line.match(/^ +/)?.[0].length ?? 0, TAB_SPACES.length);
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
    case 'ADDS':
    case 'SUB':
    case 'MUL':
    case 'AND':
    case 'ANDS':
    case 'ORR':
    case 'EOR':
    case 'LSL':
    case 'LSR':
      addRef(usage.destination, args[0]);
      addRef(usage.source, args[1]);
      addRef(usage.source, args[2]);
      break;
    case 'ADDI':
    case 'ADDIS':
    case 'SUBI':
    case 'ANDI':
    case 'ANDIS':
    case 'ORRI':
    case 'EORI':
    case 'MOV':
    case 'LDA':
    case 'MOVZ':
    case 'MOVK':
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
    case 'LDURSW':
    case 'LDURH':
    case 'LDURB': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.destination, match[1]);
        addRef(usage.source, match[2]);
      }
      break;
    }
    case 'STUR':
    case 'STURW':
    case 'STURH':
    case 'STURB': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.source, match[1]);
        addRef(usage.source, match[2]);
      }
      break;
    }
    case 'LDXR': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.destination, match[1]);
        addRef(usage.source, match[2]);
      }
      break;
    }
    case 'STXR': {
      const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (match) {
        addRef(usage.destination, match[1]);
        addRef(usage.source, match[2]);
        addRef(usage.source, match[3]);
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
  const [stackStride, setStackStride] = useState(8);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [errorLineNumber, setErrorLineNumber] = useState(null);
  const [activeRegisterNote, setActiveRegisterNote] = useState(null);
  const [activeInstructionDoc, setActiveInstructionDoc] = useState(null);
  const [loadedDataMemory, setLoadedDataMemory] = useState({});
  const [executionHistoryDepth, setExecutionHistoryDepth] = useState(0);
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
    setExecutionHistoryDepth(executionHistoryRef.current.length);
    setMachineState(previousState);
    setError('');
  };

  const handleGlobalShortcut = useEffectEvent((event) => {
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
  });

  useEffect(() => {
    const onKeyDown = (event) => handleGlobalShortcut(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const syncSourceScroll = () => {
    if (!sourceEditorRef.current || !sourceHighlightRef.current || !sourceLineNumbersRef.current) return;
    sourceHighlightRef.current.scrollTop = sourceEditorRef.current.scrollTop;
    sourceHighlightRef.current.scrollLeft = sourceEditorRef.current.scrollLeft;
    sourceLineNumbersRef.current.scrollTop = sourceEditorRef.current.scrollTop;
  };

  const updateActiveRegisterNote = (element, nextValue = sourceCode) => {
    if (!element) {
      setActiveRegisterNote(null);
      setActiveInstructionDoc(null);
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
    setActiveInstructionDoc(
      getInstructionInfoAtSelection(nextValue, element.selectionStart ?? 0),
    );
  };

  const commitSourceChange = (nextValue, options = {}) => {
    const { snapshot, selectionStart, selectionEnd } = options;
    pushHistoryEntry(sourceHistoryRef, snapshot ?? getEditorSnapshot(sourceEditorRef.current, sourceCode));
    sourceRedoRef.current = [];
    setSourceCode(nextValue);
    setAssembled(false);
    setErrorLineNumber(null);
    setActiveRegisterNote(null);
    setActiveInstructionDoc(null);
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

  const handleFormatComments = () => {
    commitSourceChange(formatSingleLineComments(sourceCode));
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

  function handleAssemble() {
    try {
      const lines = getParsedSourceLines(sourceCode);
      const memoryNotesByLine = collectMemoryNotes(sourceCode);
      const nextProgram = [];
      const nextCodeLabels = {};
      let instIndex = 0;

      for (let i = 0; i < lines.length; i += 1) {
        let line = lines[i].codePart.trim();
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
          original: lines[i].raw.trim(),
          lineNum: lines[i].lineNumber,
          pc: instIndex * 4,
          memoryNote: memoryNotesByLine[lines[i].lineNumber] ?? '',
        });
        instIndex += 1;
      }

      const { memory: dataMemory, labels: dataLabels, directive, stride } = parseDataSection(dataInput);
      const duplicateLabels = Object.keys(dataLabels).filter((label) => nextCodeLabels[label] !== undefined);
      if (duplicateLabels.length) {
        throw new Error(`Duplicate label name used in code and data: ${duplicateLabels[0]}`);
      }

      executionHistoryRef.current = [];
      setExecutionHistoryDepth(0);
      setProgram(nextProgram);
      setLabels({ ...nextCodeLabels, ...dataLabels });
      setBreakpoints([]);
      setAssembled(true);
      setMachineState({ ...getInitialState(), memory: dataMemory });
      setLoadedDataMemory(dataMemory);
      setDataDirective(directive);
      setDataStride(stride);
      setError('');
      setErrorLineNumber(null);
    } catch (err) {
      setError(`Assembly Error: ${err.message}`);
      setErrorLineNumber(extractLineNumberFromErrorMessage(err.message));
      setAssembled(false);
    }
  }

  const executeStep = (prog, labelMap, state) => {
    if (state.pc / 4 >= prog.length || state.halted) {
      return { ...state, halted: true };
    }

    const inst = prog[state.pc / 4];
    const {
      pc,
      regs,
      flags,
      memory,
      memoryNotes,
      consoleOutput,
    } = state;
    let nextPc = pc + 4;
    const newRegs = [...regs];
    const newFlags = { ...flags };
    const newMem = { ...memory };
    const newMemoryNotes = { ...memoryNotes };
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

    const parseMovWideArgs = (argsList) => {
      const dest = argsList[0];
      const immediate = parseImm(argsList[1]);
      let shift = 0;

      if (argsList[2]) {
        const shiftMatch = argsList[2].match(/^LSL\s+(#-?\d+)$/i);
        if (!shiftMatch) throw new Error('Expected shift syntax: LSL #imm');
        shift = parseImm(shiftMatch[1]);
      }

      return { dest, immediate, shift };
    };

    const parseMemoryOperand = (argsText) => {
      const match = argsText.match(/([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
      if (!match) throw new Error('Invalid syntax. Expected: OP Xt, [Xn, #offset]');
      return {
        target: match[1],
        base: match[2],
        offset: match[3] ? Number.parseInt(match[3], 10) : 0,
      };
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
        case 'ADDS': {
          const result = readReg(args[1]) + readReg(args[2]);
          writeReg(args[0], result);
          Object.assign(newFlags, getArithmeticFlagsFromAdd(readReg(args[1]), readReg(args[2]), result));
          break;
        }
        case 'SUB':
          writeReg(args[0], readReg(args[1]) - readReg(args[2]));
          break;
        case 'ADDI': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          if (args.length === 2 && bracketOperand) writeReg(args[0], readReg(bracketOperand.register) + parseImm(bracketOperand.immediate));
          else writeReg(args[0], readReg(args[1]) + readOperand(args[2]));
          break;
        }
        case 'ADDIS': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          const operandA = args.length === 2 && bracketOperand ? readReg(bracketOperand.register) : readReg(args[1]);
          const operandB = args.length === 2 && bracketOperand ? parseImm(bracketOperand.immediate) : readOperand(args[2]);
          const result = operandA + operandB;
          writeReg(args[0], result);
          Object.assign(newFlags, getArithmeticFlagsFromAdd(operandA, operandB, result));
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
        case 'ANDS': {
          const result = readReg(args[1]) & readReg(args[2]);
          writeReg(args[0], result);
          Object.assign(newFlags, getLogicalFlags(result, newFlags));
          break;
        }
        case 'ORR':
          writeReg(args[0], readReg(args[1]) | readReg(args[2]));
          break;
        case 'EOR':
          writeReg(args[0], readReg(args[1]) ^ readReg(args[2]));
          break;
        case 'ANDI':
          writeReg(args[0], readReg(args[1]) & parseImm(args[2]));
          break;
        case 'ANDIS': {
          const result = readReg(args[1]) & parseImm(args[2]);
          writeReg(args[0], result);
          Object.assign(newFlags, getLogicalFlags(result, newFlags));
          break;
        }
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
          writeReg(args[0], unsignedRightShift64ish(readReg(args[1]), parseImm(args[2])));
          break;
        case 'SUBS': {
          const operandA = readReg(args[1]);
          const operandB = readReg(args[2]);
          const result = operandA - operandB;
          writeReg(args[0], result);
          Object.assign(newFlags, getArithmeticFlagsFromSub(operandA, operandB, result));
          break;
        }
        case 'SUBIS': {
          const bracketOperand = rawArgs[1] ? parseRegisterImmediateOperand(rawArgs[1]) : null;
          const operandA = args.length === 2 && bracketOperand
            ? readReg(bracketOperand.register)
            : readReg(args[1]);
          const operandB = args.length === 2 && bracketOperand
            ? parseImm(bracketOperand.immediate)
            : readOperand(args[2]);
          const result = operandA - operandB;
          writeReg(args[0], result);
          Object.assign(newFlags, getArithmeticFlagsFromSub(operandA, operandB, result));
          break;
        }
        case 'CMP': {
          const operand1 = readReg(args[0]);
          const operand2 = args[1].includes('#') ? parseImm(args[1]) : readReg(args[1]);
          const result = operand1 - operand2;
          Object.assign(newFlags, getArithmeticFlagsFromSub(operand1, operand2, result));
          break;
        }
        case 'CMPI': {
          const operand1 = readReg(args[0]);
          const operand2 = parseImm(args[1]);
          const result = operand1 - operand2;
          Object.assign(newFlags, getArithmeticFlagsFromSub(operand1, operand2, result));
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
        case 'B.HS':
          if (flags.C) nextPc = labelMap[args[0]];
          break;
        case 'B.LO':
          if (!flags.C) nextPc = labelMap[args[0]];
          break;
        case 'B.HI':
          if (flags.C && !flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.LS':
          if (!flags.C || flags.Z) nextPc = labelMap[args[0]];
          break;
        case 'B.LT':
          if (flags.N !== flags.V) nextPc = labelMap[args[0]];
          break;
        case 'B.LE':
          if (flags.Z || flags.N !== flags.V) nextPc = labelMap[args[0]];
          break;
        case 'B.GT':
          if (!flags.Z && flags.N === flags.V) nextPc = labelMap[args[0]];
          break;
        case 'B.GE':
          if (flags.N === flags.V) nextPc = labelMap[args[0]];
          break;
        case 'B.MI':
          if (flags.N) nextPc = labelMap[args[0]];
          break;
        case 'B.PL':
          if (!flags.N) nextPc = labelMap[args[0]];
          break;
        case 'B.VS':
          if (flags.V) nextPc = labelMap[args[0]];
          break;
        case 'B.VC':
          if (!flags.V) nextPc = labelMap[args[0]];
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
        case 'MOVZ': {
          const { dest, immediate, shift } = parseMovWideArgs(args);
          writeReg(dest, (immediate & 0xffff) * (2 ** shift));
          break;
        }
        case 'MOVK': {
          const { dest, immediate, shift } = parseMovWideArgs(args);
          const current = readReg(dest);
          const fieldMask = 0xffff * (2 ** shift);
          const patchedValue = (current - (current & fieldMask)) + ((immediate & 0xffff) * (2 ** shift));
          writeReg(dest, patchedValue);
          break;
        }
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
            memoryNotes: newMemoryNotes,
            consoleOutput: newConsoleOutput,
            halted: true,
          };
        case 'LDUR':
        case 'LDURSW':
        case 'LDURH':
        case 'LDURB':
        case 'LDXR':
        case 'STUR':
        case 'STURW':
        case 'STURH': {
          const memoryArgs = parseMemoryOperand(inst.argsStr);
          const addr = readReg(memoryArgs.base) + memoryArgs.offset;
          const rawValue = newMem[addr] ?? 0;

          if (inst.opcode === 'LDUR' || inst.opcode === 'LDXR') writeReg(memoryArgs.target, rawValue);
          else if (inst.opcode === 'LDURSW') writeReg(memoryArgs.target, signExtend32(rawValue));
          else if (inst.opcode === 'LDURH') writeReg(memoryArgs.target, rawValue & 0xffff);
          else if (inst.opcode === 'LDURB') writeReg(memoryArgs.target, rawValue & 0xff);
          else if (inst.opcode === 'STUR') newMem[addr] = readReg(memoryArgs.target);
          else if (inst.opcode === 'STURW') newMem[addr] = toUnsigned32(readReg(memoryArgs.target));
          else if (inst.opcode === 'STURH') newMem[addr] = readReg(memoryArgs.target) & 0xffff;
          if (inst.opcode.startsWith('STUR') && inst.memoryNote) newMemoryNotes[addr] = inst.memoryNote;
          break;
        }
        case 'STURB': {
          const memoryArgs = parseMemoryOperand(inst.argsStr);
          const addr = readReg(memoryArgs.base) + memoryArgs.offset;
          newMem[addr] = readReg(memoryArgs.target) & 0xff;
          if (inst.memoryNote) newMemoryNotes[addr] = inst.memoryNote;
          break;
        }
        case 'STXR': {
          const match = inst.argsStr.match(/([A-Z0-9]+)\s*,\s*([A-Z0-9]+)\s*,\s*\[([A-Z0-9]+)(?:,\s*#(-?\d+))?\]/i);
          if (!match) throw new Error('Invalid syntax. Expected: STXR Xs, Xt, [Xn, #offset]');
          const addr = readReg(match[3]) + (match[4] ? Number.parseInt(match[4], 10) : 0);
          newMem[addr] = readReg(match[2]);
          if (inst.memoryNote) newMemoryNotes[addr] = inst.memoryNote;
          writeReg(match[1], 0);
          break;
        }
        default:
          throw new Error(`Unsupported instruction: ${inst.opcode}`);
      }
    } catch (err) {
      throw new Error(`Line ${inst.lineNum}: ${err.message}`, { cause: err });
    }

    return {
      pc: nextPc,
      regs: newRegs,
      flags: newFlags,
      memory: newMem,
      memoryNotes: newMemoryNotes,
      consoleOutput: newConsoleOutput,
      halted: false,
    };
  };

  function handleStep() {
    try {
      executionHistoryRef.current.push(machineState);
      setExecutionHistoryDepth(executionHistoryRef.current.length);
      setMachineState(executeStep(program, labels, machineState));
      setError('');
      setErrorLineNumber(null);
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
      setErrorLineNumber(extractLineNumberFromErrorMessage(err.message));
      setMachineState((state) => ({ ...state, halted: true }));
    }
  }

  function handleRun() {
    try {
      executionHistoryRef.current.push(machineState);
      setExecutionHistoryDepth(executionHistoryRef.current.length);
      let state = machineState;
      let count = 0;
      let skipFirst = breakpoints.includes(state.pc);
      const maxSteps = 5000;

      while (!state.halted && count < maxSteps) {
        if (!skipFirst && breakpoints.includes(state.pc)) {
          setError(`Execution paused at breakpoint on PC ${state.pc}.`);
          setErrorLineNumber(null);
          setMachineState(state);
          return;
        }
        skipFirst = false;
        state = executeStep(program, labels, state);
        count += 1;
      }

      setMachineState(state);
      setError(count >= maxSteps ? `Execution paused: Reached safety limit of ${maxSteps} instructions.` : '');
      setErrorLineNumber(null);
    } catch (err) {
      setError(`Runtime Error: ${err.message}`);
      setErrorLineNumber(extractLineNumberFromErrorMessage(err.message));
    }
  }

  const handleReset = () => {
    executionHistoryRef.current = [];
    setExecutionHistoryDepth(0);
    setMachineState(getInitialState());
    setDataInput('');
    setLoadedDataMemory({});
    setError('');
    setErrorLineNumber(null);
  };

  const handleClearData = () => {
    setDataInput('');
    setLoadedDataMemory({});
    setMachineState((state) => ({ ...state, memory: {}, memoryNotes: {} }));
    setError('');
    setErrorLineNumber(null);
  };

  const handleClearStackMemory = () => {
    setMachineState((state) => ({ ...state, memory: { ...loadedDataMemory }, memoryNotes: {} }));
    setError('');
    setErrorLineNumber(null);
  };

  const handleClearRegisters = () => {
    const initialState = getInitialState();
    setMachineState((state) => ({
      ...state,
      regs: initialState.regs,
    }));
    setError('');
    setErrorLineNumber(null);
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
  const predictedNextPc = assembled && !machineState.halted
    ? getPredictedNextPc(program, labels, machineState)
    : null;
  const nextInst = assembled && !machineState.halted
    ? program.find((inst) => inst.pc === predictedNextPc) ?? null
    : null;
  const currentRegisterUsage = getInstructionRegisterUsage(currentInst);
  const stackOffsetPointer = getStackOffsetPointer(currentInst, machineState.regs);
  const stackFinalPointer = getStackFinalPointer(currentInst, machineState.regs, machineState.memory);
  const lrFinalPc = getLrFinalPc(currentInst, machineState.regs, machineState.memory);
  const memoryAddresses = Object.keys(machineState.memory).map(Number).filter((value) => !Number.isNaN(value));
  const stackStep = stackStride;
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
  const sourceInstructionWarnings = getParsedSourceLines(sourceCode).map((line) => (
    line.isPotentialInstruction && !line.isSupported ? line.opcode : ''
  ));
  const registerNotes = collectRegisterNotes(sourceCode);
  const instructionDocs = getInstructionDocsForDisplay(sourceCode);

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
          <button type="button" className="btn btn-secondary" onClick={handleExecutionUndo} disabled={!executionHistoryDepth} title="Alt + Z">
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
              <button type="button" className="btn btn-small btn-ghost" onClick={handleFormatSource}>
                Format
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={handleFormatComments}>
                Format Comments
              </button>
              <button
                type="button"
                className={`btn btn-small btn-ghost${showDocumentation ? ' btn-toggle-active' : ''}`}
                onClick={() => setShowDocumentation((current) => !current)}
              >
                <BookOpen size={14} /> Docs
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
          {showDocumentation ? (
            <div className="documentation-panel custom-scrollbar">
              {instructionDocs.map((doc) => {
                return (
                  <article key={doc.opcode} className="documentation-card">
                    <div className="documentation-card-top">
                      <span className="documentation-opcode">{doc.opcode}</span>
                      <span className={`documentation-status${doc.supported ? '' : ' documentation-status-unsupported'}`}>
                        {doc.supported ? 'Supported' : 'Unsupported'}
                      </span>
                    </div>
                    <p className="documentation-summary">{doc.summary}</p>
                    <code className="documentation-example">{doc.example}</code>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="source-editor-shell">
              <div ref={sourceLineNumbersRef} className="source-gutter" aria-hidden="true">
                {sourceCode.split('\n').map((_, index) => {
                  const warning = sourceInstructionWarnings[index];
                  const isErrorLine = errorLineNumber === index + 1;
                  return (
                    <div key={`line-${index + 1}`} className={`source-gutter-row${isErrorLine ? ' source-gutter-row-error' : ''}`}>
                      <span className="source-warning-cell">
                        {warning ? (
                          <span className="source-warning-icon" title={`${warning} may be unsupported in the simulator`}>
                            <AlertTriangle size={12} />
                          </span>
                        ) : null}
                      </span>
                      <span className="source-line-number">{index + 1}</span>
                    </div>
                  );
                })}
              </div>
              <pre
                ref={sourceHighlightRef}
                className="source-highlight custom-scrollbar"
                aria-hidden="true"
                dangerouslySetInnerHTML={{
                  __html: highlightSource(sourceCode, {
                    showWhitespace,
                    registerNotes,
                    errorLineNumber,
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
          )}
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
          {activeInstructionDoc && !showDocumentation ? (
            <div className="note-card note-card-floating note-card-secondary">
              <div className="note-card-title">{activeInstructionDoc.opcode}</div>
              <div className="note-card-body">{activeInstructionDoc.summary}</div>
              <code className="instruction-tooltip-example">{activeInstructionDoc.example}</code>
            </div>
          ) : null}
        </section>

        <section className="panel panel-data">
          <div className="panel-header">
            <span>Data</span>
            <div className="panel-header-controls">
              <span className="panel-tag">{dataDirective} ({dataStride} byte cells)</span>
              <button type="button" className="btn btn-small btn-ghost" onClick={handleClearData}>
                <Trash2 size={14} /> Clear Data
              </button>
            </div>
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

        <section className="panel panel-console">
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
        </section>

        <section className="panel panel-trace">
          <div className="panel-header">
            <span>Execution View</span>
            <div className="panel-header-controls">
              <button type="button" className="btn btn-small btn-success" onClick={handleRun} disabled={!assembled || machineState.halted} title="Alt + R">
                <Play size={14} /> Run
              </button>
              <button type="button" className="btn btn-small btn-secondary" onClick={handleStep} disabled={!assembled || machineState.halted} title="Alt + S">
                <StepForward size={14} /> Step
              </button>
              <span className="pc-badge">PC: {machineState.pc}</span>
              <span className="lr-badge">LR: {lrInst ? lrInst.pc : 'None'}</span>
            </div>
          </div>
          {assembled && currentInst && !machineState.halted ? (
            <div className="next-inst-shell">
              <div className="current-inst-bar">
                <span className="current-inst-arrow">Current</span>
                <span className="current-inst-text">{currentInst.original}</span>
                <span className="current-inst-pc">:{currentInst.pc.toString().padStart(4, '0')}</span>
              </div>
              <div className="current-inst-bar next-inst-bar">
                <span className="current-inst-arrow">Next</span>
                <span className="current-inst-text">{nextInst ? nextInst.original : 'None'}</span>
                <span className="current-inst-pc">{nextInst ? `:${nextInst.pc.toString().padStart(4, '0')}` : ''}</span>
              </div>
            </div>
          ) : assembled && machineState.halted ? (
            <div className="current-inst-bar current-inst-bar-halted">
              <span className="current-inst-arrow">Halt</span>
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
            <div className="panel-header-controls">
              <button type="button" className="btn btn-small btn-ghost" onClick={handleClearRegisters}>
                <Trash2 size={14} /> Clear Registers
              </button>
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
          </div>
          <div className="register-grid custom-scrollbar">
            {machineState.regs.map((value, index) => {
              if (index === 31) return null;
              const isDestination = currentRegisterUsage.destination.has(index);
              const isSource = currentRegisterUsage.source.has(index);
              const cardClasses = [
                'register-card',
                isDestination ? 'register-card-destination' : '',
                !isDestination && isSource ? 'register-card-source' : '',
              ].filter(Boolean).join(' ');
              const showOverflowWarning = isRegisterOutOfRange(value);

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
                    <span className="register-value-wrap">
                      <span className="register-value">{formatValue(value, registerFormat)}</span>
                      {showOverflowWarning ? (
                        <span className="register-warning" title="This value cannot be represented in a signed 64-bit register.">
                          <AlertTriangle size={12} />
                        </span>
                      ) : null}
                    </span>
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
              <button type="button" className="btn btn-small btn-ghost" onClick={handleClearStackMemory}>
                <Trash2 size={14} /> Clear Stack
              </button>
              <select
                className="value-format-select"
                value={stackStride}
                onChange={(event) => setStackStride(Number.parseInt(event.target.value, 10))}
              >
                {STACK_STRIDE_OPTIONS.map((stride) => (
                  <option key={stride} value={stride}>{stride} byte{stride === 1 ? '' : 's'}</option>
                ))}
              </select>
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
                  const note = machineState.memoryNotes[addr];

                  return (
                    <div
                      key={addr}
                      className={`stack-row${hasValue ? ' stack-row-filled' : ''}${isInFrame ? ' stack-row-frame' : ''}${isOffsetTarget ? ' stack-row-offset-target' : ''}`}
                    >
                      <span className="stack-address">[{formatValue(addr, stackFormat)}]</span>
                      <span className={`stack-value${hasValue ? ' stack-value-filled' : ''}`}>
                        {formatValue(hasValue ? value : 0, stackFormat)}
                      </span>
                      <span className="stack-note" title={note || undefined}>{note || ''}</span>
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
