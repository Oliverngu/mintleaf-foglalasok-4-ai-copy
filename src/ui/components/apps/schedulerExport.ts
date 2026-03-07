import html2canvas from 'html2canvas';

import { generateExcelExport } from './ExportModal';

export const exportPngFromElement = async (element: HTMLElement, scale = 2): Promise<HTMLCanvasElement> => {
  const fullWidth = element.scrollWidth;
  const fullHeight = element.scrollHeight;

  return html2canvas(element, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    windowWidth: fullWidth,
    windowHeight: fullHeight,
    width: fullWidth,
    height: fullHeight,
  });
};

export const exportExcel = generateExcelExport;
