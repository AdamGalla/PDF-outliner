import * as pdfjsLib from 'pdfjs-dist';
import { BASE_URL } from './lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${BASE_URL}/pdf.worker.mjs`;

export { pdfjsLib };
