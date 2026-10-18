// Builds the language versions of the page (`npm run build:html`).
//
// Source: src/index.html (English text inline, marked with data-i18n keys)
//       + i18n/<lang>.json (translations) + i18n/config.json (languages, WhatsApp number, site URL).
// Output: index.html (en), pt/index.html, es/index.html, ru/index.html — generated, never edit them.
//
// In the template:
//   data-i18n="key"                    the element's inner HTML is replaced (HTML allowed: <br class="…">, &amp;)
//   data-i18n-attr="attr:key;attr:key" attribute values are replaced (plain text)
//   data-whatsapp-text="…"             the link gets href="https://wa.me/<number>?text=<that text>"
//   data-lang-link="<code>"            the current language's link gets aria-current="true"
//   <!-- i18n:alternates -->           replaced with the canonical + hreflang links
// Every non-English language must define every key; the build stops otherwise.
// i18n/en.json is written as a reference of all keys with their English text.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const config = JSON.parse(read('i18n/config.json'));
const template = read('src/index.html');

const START_TAG = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;

const escapeAttr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function setAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, `$1${escapeAttr(value)}$2`);
  return tag.replace(/\s*(\/?)>$/, ` ${name}="${escapeAttr(value)}"$1>`);
}

// Index of the closing tag that matches the element opened right before `from`
function findClose(html, name, from) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let match;
  while ((match = re.exec(html))) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }
  throw new Error(`No closing </${name}> after offset ${from}`);
}

function decodeEntities(text) {
  return text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Walks every start tag with i18n attributes. `dict` = null keeps the English
// text and only collects it (for en.json).
function translate(html, dict, collected, missing) {
  const lookup = (key, english) => {
    if (!collected.has(key)) collected.set(key, english);
    if (!dict) return english;
    if (!(key in dict)) {
      missing.add(key);
      return english;
    }
    return dict[key];
  };

  let out = '';
  let pos = 0;
  START_TAG.lastIndex = 0;
  let match;
  while ((match = START_TAG.exec(html))) {
    let tag = match[0];
    const name = match[1].toLowerCase();
    const textKey = getAttr(tag, 'data-i18n');
    const attrKeys = getAttr(tag, 'data-i18n-attr');
    if (textKey === null && attrKeys === null) continue;

    if (attrKeys) {
      attrKeys.split(';').filter(Boolean).forEach((pair) => {
        const [attr, key] = pair.split(':').map((part) => part.trim());
        const english = getAttr(tag, attr);
        if (english === null) throw new Error(`data-i18n-attr names a missing attribute "${attr}" in ${tag}`);
        tag = setAttr(tag, attr, lookup(key, decodeEntities(english)));
      });
    }

    out += html.slice(pos, match.index) + tag;
    pos = START_TAG.lastIndex;

    if (textKey !== null) {
      const close = findClose(html, name, pos);
      const english = html.slice(pos, close);
      if (/data-i18n/.test(english)) throw new Error(`Nested data-i18n inside "${textKey}"`);
      out += lookup(textKey, english);
      pos = close;
      START_TAG.lastIndex = close;
    }
  }
  return out + html.slice(pos);
}

function pageUrl(language) {
  return `${config.siteUrl || ''}${language.path}`;
}

function alternates(current) {
  const links = [`<link rel="canonical" href="${pageUrl(current)}">`];
  config.languages.forEach((language) => {
    links.push(`<link rel="alternate" hreflang="${language.hreflang}" href="${pageUrl(language)}">`);
  });
  const fallback = config.languages.find((language) => language.code === config.default);
  links.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl(fallback)}">`);
  return links.join('\n  ');
}

function build(language, collected) {
  const isDefault = language.code === config.default;
  const dict = isDefault ? null : JSON.parse(read(`i18n/${language.code}.json`));
  const missing = new Set();

  let html = translate(template, dict, collected, missing);
  if (missing.size) {
    throw new Error(`i18n/${language.code}.json is missing ${missing.size} key(s): ${[...missing].join(', ')}`);
  }
  if (dict) {
    const unused = Object.keys(dict).filter((key) => !collected.has(key) && !key.startsWith('_'));
    if (unused.length) console.warn(`  ${language.code}: unused keys ${unused.join(', ')}`);
  }

  html = html
    .replace('<html lang="en">', `<html lang="${language.hreflang}">`)
    .replace('<!-- i18n:alternates -->', alternates(language))
    .replace(/<!DOCTYPE html>\n/, (doctype) => `${doctype}<!-- Generated by tools/build-html.mjs from src/index.html + i18n/${language.code}.json. Do not edit: edit those and run \`npm run build:html\`. -->\n`);

  // Current language in the switcher
  html = html.replace(/<a\b[^>]*data-lang-link="([a-z]+)"[^>]*>/g, (tag, code) => (
    code === language.code ? setAttr(tag, 'aria-current', 'true') : tag
  ));

  // WhatsApp: chat link with the prepared message in this language
  html = html.replace(/<a\b[^>]*data-whatsapp-text="([^"]*)"[^>]*>/g, (tag, text) => {
    const href = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(decodeEntities(text))}`;
    return setAttr(tag, 'href', href).replace(/\sdata-whatsapp-text="[^"]*"/, '');
  });

  html = html.replace(/\s+data-i18n(?:-attr)?="[^"]*"/g, '');

  // Pages in a subfolder reach the shared assets one level up
  if (language.dir) {
    html = html.replace(/\s(src|href|srcset)="([^"]*)"/g, (all, attr, value) => (
      ` ${attr}="${value.replace(/(^|[\s,])(assets|css|js)\//g, '$1../$2/')}"`
    ));
  }

  const file = language.dir ? `${language.dir}/index.html` : 'index.html';
  if (language.dir) mkdirSync(join(ROOT, language.dir), { recursive: true });
  writeFileSync(join(ROOT, file), html);
  return file;
}

const collected = new Map();
const files = [];

// The default language first: it collects every key with its English text
const defaultLanguage = config.languages.find((language) => language.code === config.default);
files.push(build(defaultLanguage, collected));

const reference = { _note: 'Generated by tools/build-html.mjs: every key with its English text from src/index.html. Do not edit.' };
collected.forEach((value, key) => { reference[key] = value; });
writeFileSync(join(ROOT, 'i18n/en.json'), `${JSON.stringify(reference, null, 2)}\n`);

config.languages
  .filter((language) => language !== defaultLanguage)
  .forEach((language) => files.push(build(language, new Map(collected))));

console.log(`${collected.size} keys → ${files.join(', ')} (+ i18n/en.json)`);
if (!config.siteUrl) console.warn('  i18n/config.json has no siteUrl: canonical/hreflang links are root-relative until it is set');
