import type { I18nKey } from '../i18n/en';
import type { TextStyle } from './types';

export interface TextPreset {
  id: string;
  nameKey: I18nKey;
  sampleKey: I18nKey;
  /** Designed for a 1080-pixel short side; scaled to the project. */
  style: Partial<TextStyle>;
  /** Offset from the frame centre as fractions of width/height. */
  x: number;
  y: number;
  animIn: string;
  animOut: string;
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'title',
    nameKey: 'text.title',
    sampleKey: 'text.sample.title',
    style: { fontSize: 120, bold: true, shadowColor: '#000000', shadowBlur: 18, shadowY: 4 },
    x: 0,
    y: 0,
    animIn: 'fade',
    animOut: 'fade',
  },
  {
    id: 'subtitle',
    nameKey: 'text.subtitle',
    sampleKey: 'text.sample.subtitle',
    style: { fontSize: 60, bold: false, color: '#f2f2f2', shadowColor: '#000000', shadowBlur: 10 },
    x: 0,
    y: 0.1,
    animIn: 'slideUp',
    animOut: 'fade',
  },
  {
    id: 'caption',
    nameKey: 'text.caption',
    sampleKey: 'text.sample.caption',
    style: { fontSize: 46, bold: false, background: '#000000', backgroundOpacity: 65, backgroundPadding: 16, backgroundRadius: 8 },
    x: 0,
    y: 0.38,
    animIn: 'none',
    animOut: 'none',
  },
  {
    id: 'lowerThird',
    nameKey: 'text.lowerThird',
    sampleKey: 'text.sample.lowerThird',
    style: { fontSize: 50, align: 'left', background: '#1565c0', backgroundOpacity: 92, backgroundPadding: 22, backgroundRadius: 6, lineHeight: 1.3 },
    x: -0.28,
    y: 0.3,
    animIn: 'slideLeft',
    animOut: 'slideLeft',
  },
  {
    id: 'neon',
    nameKey: 'text.neon',
    sampleKey: 'text.sample.neon',
    style: { fontSize: 140, color: '#b8fbff', shadowColor: '#00e5ff', shadowBlur: 40, letterSpacing: 8 },
    x: 0,
    y: 0,
    animIn: 'pop',
    animOut: 'fade',
  },
  {
    id: 'outline',
    nameKey: 'text.outline',
    sampleKey: 'text.sample.outline',
    style: { fontSize: 130, color: '#ffd400', strokeColor: '#111111', strokeWidth: 8, fontFamily: 'Impact' },
    x: 0,
    y: 0,
    animIn: 'zoomIn',
    animOut: 'zoomOut',
  },
  {
    id: 'quote',
    nameKey: 'text.quote',
    sampleKey: 'text.sample.quote',
    style: { fontSize: 72, bold: false, italic: true, fontFamily: 'Georgia' },
    x: 0,
    y: 0,
    animIn: 'typewriter',
    animOut: 'fade',
  },
  {
    id: 'minimal',
    nameKey: 'text.minimal',
    sampleKey: 'text.sample.minimal',
    style: { fontSize: 58, bold: false, letterSpacing: 14, color: '#ffffff' },
    x: 0,
    y: 0,
    animIn: 'blur',
    animOut: 'blur',
  },
];

export const FONT_FAMILIES = [
  'Segoe UI',
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Gabriola',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Palatino Linotype',
  'Segoe Print',
  'Segoe Script',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];
