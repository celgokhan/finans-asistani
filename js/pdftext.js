// pdf.js ile PDF'ten konumlu metin parçaları çıkarır. Dosya cihazdan çıkmaz.
let ready = null;

function loadPdfjs() {
  if (!ready) {
    ready = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'lib/pdfjs/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
        res(window.pdfjsLib);
      };
      s.onerror = () => { ready = null; rej(new Error('PDF okuyucu yüklenemedi')); };
      document.head.appendChild(s);
    });
  }
  return ready;
}

export async function pdfToPages(file, password) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, password, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push({ items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })) });
  }
  await doc.destroy();
  return pages;
}
