import { downloadBlob } from './file-export';

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(clone)}`;
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const blob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml' });
  downloadBlob(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`);
}

export function downloadPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const xml = serializeSvg(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = svg.viewBox.baseVal.width || svg.clientWidth || 1200;
      const h = svg.viewBox.baseVal.height || svg.clientHeight || 800;
      canvas.width = Math.max(1, w * scale);
      canvas.height = Math.max(1, h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((png) => {
        URL.revokeObjectURL(url);
        if (!png) {
          reject(new Error('png'));
          return;
        }
        downloadBlob(png, filename.endsWith('.png') ? filename : `${filename}.png`);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg-image'));
    };
    img.src = url;
  });
}
