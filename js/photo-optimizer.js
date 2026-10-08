window.VSNPhotoOptimizer = (() => {
  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const MAIN_MAX = 1800;
  const THUMB_MAX = 480;
  const MAIN_QUALITY = 0.78;
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
        reject(new Error('Não foi possível ler a imagem. Para HEIC/HEIF, converta para JPG ou WEBP antes de enviar.'));
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
        blob => blob ? resolve({ blob, width, height }) : reject(new Error('Não foi possível compactar a imagem.')),
        'image/webp',
        quality
      );
    });
  }

  function fileFromBlob(blob, originalName, suffix) {
    const base = String(originalName || 'foto')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'foto';
    return new File([blob], base + suffix + '.webp', { type: 'image/webp', lastModified: Date.now() });
  }

  async function prepare(file) {
    if (!(file instanceof File)) throw new Error('Arquivo inválido.');
    if (file.size > MAX_INPUT_BYTES) throw new Error('Cada foto pode ter no máximo 10 MB.');
    const img = await readImage(file);
    const main = await canvasBlob(img, MAIN_MAX, MAIN_QUALITY);
    const thumb = await canvasBlob(img, THUMB_MAX, THUMB_QUALITY);

    const mainFile = fileFromBlob(main.blob, file.name, '-main');
    const thumbFile = fileFromBlob(thumb.blob, file.name, '-thumb');

    return {
      main: mainFile,
      thumb: thumbFile,
      originalBytes: file.size,
      mainBytes: mainFile.size
    };
  }

  return {
    MAX_INPUT_BYTES,
    MAIN_MAX,
    THUMB_MAX,
    prepare
  };
})();