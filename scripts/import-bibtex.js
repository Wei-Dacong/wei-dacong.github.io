#!/usr/bin/env node
/**
 * import-bibtex.js
 * ---------------------------------------------------------------
 * 把一份 BibTeX (.bib) 文件批量转换成 HugoBlox Academic 的论文页面。
 *
 * 用法:
 *   node scripts/import-bibtex.js <your-papers.bib> [--dry-run]
 *
 * 说明:
 *   - 每篇文献会在 content/publications/<cite-key>/ 下生成 index.md 和 cite.bib
 *   - 已存在的文件夹会被跳过（不会覆盖你的手改内容）
 *   - 作者中匹配到 USER_AUTHORS 的会被替换为作者系统的 "me"
 *   - 运行后检查一下 front matter，然后 git add -A && git commit 即可
 * ---------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

// ---------------- 按自己情况改的配置 ----------------
const USER_AUTHORS = ['Wei, D.', 'D. Wei', 'Wei Dacong', 'Dacong Wei', '韦大聪', 'Wei, Dacong'];
const CONTENT_DIR = 'content/publications';
// ---------------- 配置结束 ----------------

// BibTeX 条目类型 → CSL publication type
const TYPE_MAP = {
  article: 'article-journal',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  proceedings: 'paper-conference',
  preprint: 'article',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  book: 'book',
  incollection: 'chapter',
  inbook: 'chapter',
  misc: 'manuscript',
};

function clean(s) {
  return (s || '')
    .replace(/[{}]/g, '')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/--/g, '–')
    .replace(/~(?=[A-Z])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAuthors(authorStr) {
  const out = [];
  for (let a of authorStr.split(' and ')) {
    a = clean(a);
    if (!a) continue;
    if (USER_AUTHORS.includes(a)) { out.push('me'); continue; }
    if (a.includes(',')) {
      const [last, first] = a.split(',');
      const names = [first.trim(), last.trim()].filter(Boolean);
      if (names.length) out.push(names.join(' '));
    } else {
      out.push(a);
    }
  }
  return out;
}

/** 把 @type{key, ...} 之后的正文解析成字段表（字符级 tokenizer，不依赖正则） */
function extractFields(body) {
  const fields = {};
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && ' \n\r\t,'.includes(body[i])) i++;
    if (i >= n) break;
    let start = i;
    while (i < n && /[a-zA-Z0-9_]/.test(body[i])) i++;
    if (start === i) { i++; continue; }
    const name = body.slice(start, i).toLowerCase();
    while (i < n && body[i] !== '=') i++;
    i++; // skip '='
    while (i < n && ' \n\r\t'.includes(body[i])) i++;
    let val = '';
    if (body[i] === '"') {
      let j = i + 1, s = '';
      while (j < n && body[j] !== '"') {
        if (body[j] === '\\' && j + 1 < n) { s += body[j + 1]; j += 2; }
        else { s += body[j]; j++; }
      }
      val = s; i = j + 1;
    } else if (body[i] === '{') {
      let depth = 1, j = i + 1, s = '';
      while (j < n && depth > 0) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') depth--;
        if (depth > 0) s += body[j];
        j++;
      }
      val = s; i = j;
    } else {
      let j = i;
      while (j < n && body[j] !== ',' && body[j] !== '\n') j++;
      val = body.slice(i, j).trim();
      i = j;
    }
    fields[name] = val;
  }
  return fields;
}

/** 逐字符解析整份 .bib，返回 [{type, key, fields}] */
function parseBibtex(text) {
  const entries = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && text[i] !== '@') i++;
    if (i >= n) break;
    i++; // skip '@'
    let start = i;
    while (i < n && /[a-zA-Z]/.test(text[i])) i++;
    const type = text.slice(start, i).toLowerCase();
    while (i < n && ' \n\r\t'.includes(text[i])) i++;
    if (text[i] !== '{') continue;
    i++;
    while (i < n && ' \n\r\t'.includes(text[i])) i++;
    start = i;
    while (i < n && text[i] !== ',' && text[i] !== '}') i++;
    const key = text.slice(start, i).trim();
    if (text[i] === '}') { i++; continue; }
    i++; // skip ','
    // 找到与当前深度匹配的右花括号
    let depth = 1, bodyStart = i;
    while (i < n && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);
    entries.push({ type, key, fields: extractFields(body) });
  }
  return entries;
}

function yamlStr(s) {
  if (s === undefined || s === null) return "''";
  s = String(s);
  if (/[\n":{}[\],&*#?|>%@`'!-]/.test(s)) {
    return '"' + s.replace(/"/g, '\\"') + '"';
  }
  return s;
}

function monthToNum(m) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const k = (m || '').toLowerCase().slice(0, 3);
  return months[k] || 1;
}

function buildIndexMd(entry) {
  const f = entry.fields;
  const authors = parseAuthors(f.author || '');
  const year = f.year || String(new Date().getFullYear());
  const date = `${year}-${String(monthToNum(f.month)).padStart(2, '0')}-15T00:00:00Z`;
  const pubType = TYPE_MAP[entry.type] || 'manuscript';
  const title = clean(f.title) || entry.key;
  const venue = f.journal || f.booktitle || '';

  const lines = ['---'];
  lines.push(`title: ${yamlStr(title)}`);
  if (authors.length) {
    lines.push('authors:');
    authors.forEach((a) => lines.push(`  - ${a}`));
  }
  lines.push(`date: "${date}"`);
  lines.push(`publishDate: "${date}"`);
  lines.push(`publication_types: ["${pubType}"]`);
  if (venue || f.volume || f.number || f.pages) {
    lines.push('publication:');
    if (venue) lines.push(`  name: ${yamlStr(clean(venue))}`);
    if (f.volume) lines.push(`  volume: ${yamlStr(clean(f.volume))}`);
    if (f.number) lines.push(`  issue: ${yamlStr(clean(f.number))}`);
    if (f.pages) lines.push(`  pages: ${yamlStr(clean(f.pages))}`);
  }
  lines.push('peer_reviewed: true');
  if (f.abstract) {
    lines.push('abstract: |');
    f.abstract.split('\n').forEach((l) => lines.push(`  ${l.trim()}`));
  }
  lines.push('featured: false');
  if (f.doi) {
    lines.push('hugoblox:');
    lines.push('  ids:');
    lines.push(`    doi: ${yamlStr(clean(f.doi))}`);
  }
  const urls = [];
  if (f.doi) urls.push(`https://doi.org/${clean(f.doi)}`);
  if (f.url && !urls.includes(clean(f.url))) urls.push(clean(f.url));
  if (urls.length) {
    lines.push('links:');
    urls.forEach((u) => lines.push(`  - type: article`));
    urls.forEach((u) => lines.push(`    url: ${yamlStr(u)}`));
  }
  lines.push('projects: []');
  lines.push('slides: ""');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

/** 用解析出的字段重新序列化一个干净的 cite.bib */
function buildBib(entry) {
  const f = entry.fields;
  const keys = Object.keys(f);
  const lines = [`@${entry.type}{${entry.key},`];
  keys.forEach((k, idx) => {
    const v = f[k];
    const val = ['author', 'title', 'abstract', 'journal', 'booktitle'].includes(k)
      ? `{${v}}` : v;
    const comma = idx === keys.length - 1 ? '' : ',';
    lines.push(`  ${k} = ${val}${comma}`);
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}

function slugify(key) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) {
    console.error('用法: node scripts/import-bibtex.js <your-papers.bib> [--dry-run]');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const entries = parseBibtex(text);
  if (!entries.length) {
    console.error('没有解析到任何 BibTeX 条目，请检查文件内容。');
    process.exit(1);
  }
  let created = 0, skipped = 0;
  for (const e of entries) {
    const folder = path.join(CONTENT_DIR, slugify(e.key));
    if (fs.existsSync(folder)) {
      skipped++;
      console.log(`跳过（已存在）: ${folder}`);
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] 将创建: ${folder}  (${e.type}, ${e.key})`);
      continue;
    }
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'index.md'), buildIndexMd(e));
    fs.writeFileSync(path.join(folder, 'cite.bib'), buildBib(e));
    created++;
    console.log(`已创建: ${folder}`);
  }
  console.log(`\n完成: 新建 ${created} 篇, 跳过 ${skipped} 篇。`);
  if (created && !dryRun) {
    console.log('提示: 检查生成的 front matter（特别是作者是否为 "me"），然后 git add -A && git commit。');
  }
}

main();
