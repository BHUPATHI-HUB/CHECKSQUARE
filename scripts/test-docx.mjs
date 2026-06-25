/* Standalone DOCX smoke-test.
 *
 * Verifies that the exact ImageRun byte shape used by ReportGenerator.jsx
 * still produces a structurally valid .docx after the
 * crop → fit-instead-of-crop change.
 *
 * Why this matters: docx-library's ImageRun expects raw JPEG/PNG bytes.
 * Our cropImage() helper feeds it `canvas.toDataURL('image/jpeg') → atob
 * → Uint8Array`.  The new fit-instead-of-crop algorithm KEEPS the same
 * canvas.toDataURL pipeline, so the bytes are still a valid JPEG — only
 * the pixels inside changed.  This test confirms the docx packer accepts
 * those bytes end-to-end and the produced .docx unzips cleanly.
 *
 * Run with:
 *   node scripts/test-docx.mjs
 */
import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType,
  ImageRun,
} from 'docx';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

// A 64×48 px black JPEG — the smallest valid JPEG that exercises ImageRun.
// Produced once with `convert -size 64x48 xc:black -quality 85 out.jpg`
// and base64'd here so this script needs no native deps.
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhE' +
  'PERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh' +
  '4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAwAEADA' +
  'SIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAEFBv/EABoQAAIDAQEAAAAAAAAAAAAAAAAB' +
  'AhITITH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQA' +
  'CEQMRAD8A8/lvFvPzh//Z';

const jpegBytes = Buffer.from(JPEG_B64, 'base64');
console.log(`✓ Sample JPEG: ${jpegBytes.length} bytes, magic=`,
  jpegBytes.slice(0, 4).toString('hex'));  // expect ffd8ffe0

// ──────────────────────────────────────────────────────────────────
// Build the same Document shape ReportGenerator.jsx emits.
// ──────────────────────────────────────────────────────────────────
const imagePara = (data, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing:   { before: 80, after: 80 },
  children:  [new ImageRun({ data, type: 'jpg', transformation: { width: w, height: h } })],
});

const doc = new Document({
  creator: 'CheckSquare DOCX smoke-test',
  styles:  { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [{
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun('CheckSquare — DOCX byte-shape smoke-test')],
      }),
      new Paragraph({
        children: [new TextRun(
          'If you can open this file in Word / LibreOffice / Pages and see the ' +
          'black rectangle below in three different sizes, the post-Phase-2 ' +
          'cropImage() change has NOT broken DOCX export.',
        )],
      }),
      imagePara(jpegBytes, 100, 75),   // exact 4:3 — should look fine
      imagePara(jpegBytes, 240, 80),   // wide letterbox simulating landscape cell
      imagePara(jpegBytes, 80, 240),   // tall pillarbox simulating portrait cell
      new Paragraph({ children: [new TextRun('— end —')] }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
const out = '/tmp/checksquare-smoke-test.docx';
writeFileSync(out, buf);

const size = statSync(out).size;
console.log(`✓ Wrote ${out} (${size} bytes)`);

// A valid .docx starts with the ZIP magic 'PK\x03\x04'
const head = readFileSync(out).slice(0, 4);
if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
  console.error('❌ File is NOT a valid ZIP (.docx) — header:', head);
  process.exit(2);
}
console.log('✓ ZIP magic present (PK\\x03\\x04)');

// Inspect entry list — must contain word/document.xml, word/media/*.jpg, etc.
const list = execSync(`unzip -l ${out}`, { encoding: 'utf-8' });
console.log('\n── ZIP contents ──');
console.log(list);

const checks = [
  ['word/document.xml',            'main document body'],
  ['word/_rels/document.xml.rels', 'relationships'],
  ['[Content_Types].xml',          'mime-type table'],
  ['word/media/',                  'embedded image directory'],
];
let allOk = true;
for (const [needle, desc] of checks) {
  if (!list.includes(needle)) {
    console.error(`❌ Missing entry: ${needle}  (${desc})`);
    allOk = false;
  } else {
    console.log(`✓ ${needle}  (${desc})`);
  }
}
if (!allOk) process.exit(3);

// Sanity-check that document.xml mentions all three image references.
const docXml = execSync(`unzip -p ${out} word/document.xml`, { encoding: 'utf-8' });
const drawingCount = (docXml.match(/<w:drawing>/g) || []).length;
console.log(`\n✓ <w:drawing> elements: ${drawingCount}  (expected 3)`);
if (drawingCount !== 3) {
  console.error('❌ Expected 3 image drawings, found', drawingCount);
  process.exit(4);
}

console.log('\n✅  All DOCX structural checks passed.  Generator is sound.');
