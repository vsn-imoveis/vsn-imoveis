window.VSNPhotoOptimizer = (() => {
  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const THUMB_MAX = 480;
  const THUMB_QUALITY = 0.68;

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível ler a imagem. Use JPG, PNG ou WEBP.'));
      };
      img.src = url;
    });
  }

  function canvasBlob(img, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return reject(new Error('Seu navegador não conseguiu preparar a imagem.'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Não foi possível criar a thumbnail.')),
        'image/webp',
        quality
      );
    });
  }

  function fileFromBlob(blob, originalName) {
    const base = String(originalName || 'foto')
      .replace(/.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'foto';
    return new File([blob], base + '-thumb.webp', { type: 'image/webp', lastModified: Date.now() });
  }

  async function prepare(file) {
    if (!(file instanceof File)) throw new Error('Arquivo inválido.');
    if (file.size > MAX_INPUT_BYTES) throw new Error('Cada foto pode ter no máximo 10 MB.');
    const img = await readImage(file);
    const thumb = await canvasBlob(img, THUMB_MAX, THUMB_QUALITY);
    return {
      main: file,
      thumb: fileFromBlob(thumb, file.name),
      originalBytes: file.size,
      mainBytes: file.size
    };
  }

  return {
    MAX_INPUT_BYTES,
    THUMB_MAX,
    prepare
  };
})();