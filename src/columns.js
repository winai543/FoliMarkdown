"use strict";
// Only known anchors or numeric pixel offsets can become CSS.
function absolutePosition(value) {
  const anchor = value.trim().toLowerCase();
  const anchors = {
    'top-left': { left: 0, top: 0 }, 'top-right': { right: 0, top: 0 },
    'bottom-left': { left: 0, bottom: 0 }, 'bottom-right': { right: 0, bottom: 0 }
  };
  if (anchors[anchor]) return anchors[anchor];
  const result = {};
  for (const pair of anchor.split(',')) {
    const match = /^\s*([xy])\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?\s*$/.exec(pair);
    if (!match || Object.hasOwn(result, match[1] === 'x' ? 'left' : 'top') || Math.abs(Number(match[2])) > 100000) return null;
    result[match[1] === 'x' ? 'left' : 'top'] = Number(match[2]);
  }
  return Object.keys(result).length === 2 ? result : null;
}
const CONTAINER_LINE = /^ {0,3}:::(?: (row|col)(?: \[([^\]\n]+)\])?| absolute \[([^\]\n]+)\])?[ \t]*$/;
// Balance all container kinds together; fenced examples never close a container.
function readMarkdownContainer(source) {
  const openingEnd = source.indexOf('\n');
  if (openingEnd < 0) return;
  const opening = CONTAINER_LINE.exec(source.slice(0, openingEnd));
  if (!opening || (!opening[1] && !opening[3]) || opening[1] === 'col' || opening[2]) return;
  const type = opening[3] ? 'absolute' : 'row';
  const position = type === 'absolute' ? absolutePosition(opening[3]) : null;
  if (type === 'absolute' && !position) return;
  const stack = [type], columns = [];
  let offset = openingEnd + 1, contentStart = offset, ratio = 1, fence = null;
  while (offset < source.length) {
    const end = source.indexOf('\n', offset), next = end < 0 ? source.length : end + 1;
    const line = source.slice(offset, end < 0 ? source.length : end);
    const code = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (code && code[1][0] === fence[0] && code[1].length >= fence.length && !code[2].trim()) fence = null;
    } else if (code && stack.at(-1) !== 'row') fence = code[1];
    else {
      const marker = CONTAINER_LINE.exec(line);
      if (marker) {
        const kind = marker[3] ? 'absolute' : marker[1];
        if (kind) {
          if (marker[3] && !absolutePosition(marker[3])) return;
          if (marker[2] && (kind !== 'col' || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(marker[2]) || !(Number(marker[2]) > 0 && Number(marker[2]) <= 1000))) return;
          if ((kind === 'col') !== (stack.at(-1) === 'row')) return;
          stack.push(kind);
          if (type === 'row' && stack.length === 2) { contentStart = next; ratio = Number(marker[2] || 1); }
        } else {
          const closed = stack.pop();
          if (type === 'row' && closed === 'col' && stack.length === 1) {
            columns.push({ ratio, raw: source.slice(contentStart, offset), contentOffset: contentStart });
          }
          if (!stack.length) {
            if (type === 'row' && !columns.length) return;
            return { type, raw: source.slice(0, next), position, columns,
              content: source.slice(openingEnd + 1, offset), contentOffset: openingEnd + 1 };
          }
        }
      } else if (stack.at(-1) === 'row' && line.trim()) return;
    }
    offset = next;
  }
}
const COLUMN_EXTENSION = {
  name: 'columnRow', level: 'block', childTokens: ['columns'],
  start(source) { return source.search(/^ {0,3}::: row[ \t]*$/m); },
  tokenizer(source) {
    if (!/^ {0,3}::: row[ \t]*\n/.test(source)) return;
    const container = readMarkdownContainer(source);
    if (!container) return;
    return { type: 'columnRow', raw: container.raw, columns: container.columns.map(column => ({
      type: 'columnContent', ...column, tokens: this.lexer.blockTokens(column.raw, [])
    })) };
  },
  renderer(token) {
    const total = token.columns.reduce((sum, column) => sum + column.ratio, 0);
    return `<div class="markdown-row">${token.columns.map(column => `<div class="markdown-col" style="flex-grow:${column.ratio / total}">${this.parser.parse(column.tokens)}</div>`).join('')}</div>\n`;
  }
};
const ABSOLUTE_EXTENSION = {
  name: 'absoluteBlock', level: 'block', childTokens: ['tokens'],
  start(source) { return source.search(/^ {0,3}::: absolute \[/m); },
  tokenizer(source) {
    if (!/^ {0,3}::: absolute \[/.test(source)) return;
    const container = readMarkdownContainer(source);
    if (!container) return;
    return { type: 'absoluteBlock', raw: container.raw, position: container.position,
      content: container.content, contentOffset: container.contentOffset,
      tokens: this.lexer.blockTokens(container.content, []) };
  },
  renderer(token) {
    const style = Object.entries(token.position).map(([key, value]) => `${key}:${value}px`).join(';');
    return `<div class="markdown-absolute" style="${style}">${this.parser.parse(token.tokens)}</div>\n`;
  }
};
// Keep source offsets for editing tables/charts and navigating headings inside columns.
function visitMarkdownSource(tokens, source, visit, base = 0) {
  let offset = 0;
  for (const token of tokens) {
    const start = source.indexOf(token.raw, offset);
    if (start < 0) continue;
    visit(token, base + start);
    if (token.type === 'columnRow') for (const column of token.columns) {
      visitMarkdownSource(column.tokens, column.raw, visit, base + start + column.contentOffset);
    }
    if (token.type === 'absoluteBlock') visitMarkdownSource(token.tokens, token.content, visit, base + start + token.contentOffset);
    offset = start + token.raw.length;
  }
}
