import { useT, type I18nKey } from '../i18n';
import { applyLayout, layoutCells, LAYOUTS, type LayoutKind } from '../store/enhance';

const PW = 32;
const PH = 18;

function LayoutIcon({ kind }: { kind: LayoutKind }) {
  const { cells } = layoutCells(kind, 16, 9);
  return (
    <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}>
      <rect x={0.5} y={0.5} width={PW - 1} height={PH - 1} rx={2} className="lp-frame" />
      {kind === 'fit' ? (
        <rect x={7} y={2.5} width={18} height={13} rx={1} className="lp-cell" />
      ) : (
        cells.map((c, i) => (
          <rect key={i} x={c.x * PW + 1.5} y={c.y * PH + 1.5} width={c.w * PW - 3} height={c.h * PH - 3} rx={1} className="lp-cell" />
        ))
      )}
    </svg>
  );
}

/** Quick arrangements: fit/fill, picture-in-picture corners, split screens and grids. */
export function LayoutPicker() {
  const t = useT();
  return (
    <div className="layout-picker">
      {LAYOUTS.map((k) => (
        <button key={k} className="lp-btn" title={t(`layout.${k}` as I18nKey)} onClick={() => applyLayout(k)}>
          <LayoutIcon kind={k} />
        </button>
      ))}
    </div>
  );
}
