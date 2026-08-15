// Ícones de MARCA (Instagram/Linkedin/Youtube) removidos do lucide-react 1.x.
// Reproduzem os paths do lucide 0.x (licença ISC, mesmo projeto) com a MESMA API
// visual (stroke 24x24, currentColor), então call sites e o catálogo do CMS
// continuam idênticos — inclusive as chaves por nome gravadas em data.icon.
import { createElement, forwardRef } from 'react';
import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

type BrandIconProps = SVGProps<SVGSVGElement> & { size?: number | string };
type Shape = [tag: string, attrs: Record<string, string>];

function brandIcon(name: string, shapes: Shape[]): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, BrandIconProps>(function BrandIcon({ size = 24, ...props }, ref) {
    return createElement(
      'svg',
      {
        ref,
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...props,
      },
      ...shapes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))
    );
  });
  Icon.displayName = name;
  return Icon as unknown as LucideIcon;
}

export const Instagram = brandIcon('Instagram', [
  ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5' }],
  ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' }],
  ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5' }],
]);

export const Linkedin = brandIcon('Linkedin', [
  ['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z' }],
  ['rect', { width: '4', height: '12', x: '2', y: '9' }],
  ['circle', { cx: '4', cy: '4', r: '2' }],
]);

export const Youtube = brandIcon('Youtube', [
  ['path', { d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0 2 2 0 0 1-1.4-1.4Z' }],
  ['path', { d: 'm10 15 5-3-5-3z' }],
]);
