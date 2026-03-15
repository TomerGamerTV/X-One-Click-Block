const sharp = require('sharp');
const path = require('path');
const src = path.join(__dirname, 'src', 'Gemini_Generated_Image_80t8co80t8co80t8.png');

sharp(src)
  .resize(128, 128, {
    fit: 'fill',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .toFile(path.join(__dirname, 'src', 'icon128.png'))
  .then(() => console.log('128 done'))
  .catch(err => console.error(err));

sharp(src)
  .resize(48, 48, {
    fit: 'fill',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .toFile(path.join(__dirname, 'src', 'icon48.png'))
  .then(() => console.log('48 done'))
  .catch(err => console.error(err));
