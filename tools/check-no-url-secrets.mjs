import fs from 'node:fs';
import path from 'node:path';

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: node tools/check-no-url-secrets.mjs <file>...');
  process.exit(2);
}

const secretQuery = /(?:[?&](?:key|kref|token|secret|signature|payload|ciphertext|privateKey)=)/i;
const urlLiteral = /(?:openUrl|urlSigned|URL)\s*[:=]\s*[`'"`]([^`'"\s]+)[`'"`]/gi;
const violations = [];
const files = inputs.flatMap((input) => {
  const stat = fs.statSync(input);
  if (!stat.isDirectory()) return [input];
  return fs.readdirSync(input, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(input, entry.parentPath || '', entry.name).replace(`${input}${path.sep}`, ''));
});
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (secretQuery.test(line)) violations.push(`${file}:${index + 1}: secret-like query parameter`);
    for (const match of line.matchAll(urlLiteral)) {
      if (secretQuery.test(match[1])) violations.push(`${file}:${index + 1}: secret-like URL query parameter`);
    }
  }
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`No secret-like URL query parameters in ${files.length} files.`);
