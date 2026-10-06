import { Mp3Encoder } from '../vendor/lamejs.js';
import { encodeMp3 } from './mp3.js';

self.onmessage = event => {
  try {
    const { left, right } = event.data;
    const data = encodeMp3(left, right, Mp3Encoder, progress => self.postMessage({ progress }));
    self.postMessage({ data }, [data.buffer]);
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'MP3 编码失败' }); }
};
