import { Buffer } from 'node:buffer';
import sharp from 'sharp';

export async function createImageBuffer(background = '#336699') {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background
    }
  })
    .jpeg()
    .toBuffer();
}

function createPdfObject(content) {
  return `${content}\n`;
}

export function createTwoPagePdf() {
  const pageOneStream = '0.1 0.4 0.8 rg 0 0 200 100 re f';
  const pageTwoStream = '0.8 0.3 0.1 rg 0 0 200 100 re f';
  const objects = [
    createPdfObject('<< /Type /Catalog /Pages 2 0 R >>'),
    createPdfObject('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'),
    createPdfObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 5 0 R >>'),
    createPdfObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 6 0 R >>'),
    createPdfObject(`<< /Length ${Buffer.byteLength(pageOneStream)} >>\nstream\n${pageOneStream}\nendstream`),
    createPdfObject(`<< /Length ${Buffer.byteLength(pageTwoStream)} >>\nstream\n${pageTwoStream}\nendstream`)
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}endobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf);
}
