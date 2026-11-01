import QRCode from 'qrcode';

// Encode only: this module never follows the link or sends it to another service.
export async function articleQr(value, format = 'svg') {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 2300) throw Error('Article URL is too long');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid article URL');
  const options = {
    type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 220,
    color: { dark: '#000000ff', light: '#ffffffff' },
  };
  return format === 'png' ? QRCode.toBuffer(value, {...options, type:'png', width:440}) : QRCode.toString(value, options);
}
