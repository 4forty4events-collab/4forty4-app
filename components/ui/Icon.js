import React from 'react';
import Svg, { Path, Circle, Rect, Line, G } from 'react-native-svg';
import { colors } from '../../lib/theme';

// One bespoke icon system for the whole app — same geometric language as the nav
// pod (uniform 1.75 stroke, round joins/caps). Line by default; pass `fill` for
// the solid "active" state on the fillable marks (heart / star / bookmark / pin).
// Usage: <Icon name="search" size={20} color={colors.textLo} />
export function Icon({ name, size = 22, color = colors.textHi, strokeWidth = 1.75, fill = false, style }) {
  const S = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  const F = (fillable) => (fillable && fill ? color : 'none');
  const svg = (children) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>{children}</Svg>
  );

  switch (name) {
    case 'search': // sharp lens, not a stock magnifier
      return svg(<G>
        <Circle cx={10.5} cy={10.5} r={6.4} {...S} />
        <Line x1={15.4} y1={15.4} x2={20} y2={20} {...S} />
      </G>);

    case 'bell': // geometric notification bell
      return svg(<G>
        <Path d="M6 16.5 C 6 13, 7 12.6, 7 9.6 A5 5 0 0 1 17 9.6 C 17 12.6 18 13 18 16.5 Z" {...S} fill={F(true)} />
        <Path d="M10 19.4 a2 2 0 0 0 4 0" {...S} />
        <Line x1={12} y1={3.4} x2={12} y2={4.6} {...S} />
      </G>);

    case 'pin': // location teardrop with an open center
      return svg(<G>
        <Path d="M12 21 C 12 21, 5.6 14.4, 5.6 10 A6.4 6.4 0 0 1 18.4 10 C 18.4 14.4, 12 21, 12 21 Z" {...S} fill={F(true)} />
        <Circle cx={12} cy={10} r={2.3} {...S} fill={fill ? colors.bgBase : 'none'} />
      </G>);

    case 'grid': // browse / collection
      return svg(<G>
        <Rect x={4} y={4} width={7} height={7} rx={2} {...S} />
        <Rect x={13} y={4} width={7} height={7} rx={2} {...S} />
        <Rect x={4} y={13} width={7} height={7} rx={2} {...S} />
        <Rect x={13} y={13} width={7} height={7} rx={2} {...S} />
      </G>);

    case 'image': // full-bleed photo feed (immerse-on-demand)
      return svg(<G>
        <Rect x={4} y={5} width={16} height={14} rx={3} {...S} />
        <Circle cx={9} cy={10} r={1.6} {...S} />
        <Path d="M5 17.5 L10 12.5 L13 15 L16 12 L19 15" {...S} />
      </G>);

    case 'heart':
      return svg(<Path d="M12 20 C 12 20, 4 15, 4 9.3 A4.2 4.2 0 0 1 12 7.3 A4.2 4.2 0 0 1 20 9.3 C 20 15, 12 20, 12 20 Z" {...S} fill={F(true)} />);

    case 'bookmark':
      return svg(<Path d="M7 4.5 L17 4.5 A1.6 1.6 0 0 1 18.5 6 L18.5 20 L12 15.7 L5.5 20 L5.5 6 A1.6 1.6 0 0 1 7 4.5 Z" {...S} fill={F(true)} />);

    case 'star':
      return svg(<Path d="M12 3.7 L14.6 9 L20.4 9.8 L16.2 13.9 L17.3 19.7 L12 16.9 L6.7 19.7 L7.8 13.9 L3.6 9.8 L9.4 9 Z" {...S} fill={F(true)} />);

    case 'settings': // sliders — modern, not a stock cog
      return svg(<G>
        <Line x1={4} y1={8} x2={20} y2={8} {...S} />
        <Line x1={4} y1={16} x2={20} y2={16} {...S} />
        <Circle cx={9} cy={8} r={2.6} {...S} fill={colors.bgBase} />
        <Circle cx={15} cy={16} r={2.6} {...S} fill={colors.bgBase} />
      </G>);

    case 'send': // sharp paper plane
      return svg(<G>
        <Path d="M4 12 L20 5 L14 20 L11.3 13.4 Z" {...S} fill={F(fill)} />
        <Line x1={11.3} y1={13.4} x2={20} y2={5} {...S} />
      </G>);

    case 'spark': // AI — a bespoke 4-point spark, not a robot
      return svg(<G>
        <Path d="M12 4 C 12.4 8, 13.6 9.6, 17.5 10 C 13.6 10.4, 12.4 12, 12 16 C 11.6 12, 10.4 10.4, 6.5 10 C 10.4 9.6, 11.6 8, 12 4 Z" {...S} fill={F(true)} />
        <Path d="M18 4 C 18.15 5.4, 18.6 6, 20 6.2 C 18.6 6.4, 18.15 7, 18 8.4 C 17.85 7, 17.4 6.4, 16 6.2 C 17.4 6, 17.85 5.4, 18 4 Z" {...S} fill={F(true)} />
      </G>);

    case 'calendar':
      return svg(<G>
        <Rect x={4} y={5} width={16} height={15} rx={3} {...S} />
        <Line x1={4} y1={9.5} x2={20} y2={9.5} {...S} />
        <Line x1={8.5} y1={3.5} x2={8.5} y2={6.5} {...S} />
        <Line x1={15.5} y1={3.5} x2={15.5} y2={6.5} {...S} />
        <Circle cx={12} cy={14.5} r={1.15} fill={color} stroke="none" />
      </G>);

    case 'edit': // pencil
      return svg(<G>
        <Path d="M16 4.6 L19.4 8 L8.6 18.8 L5 19.6 L5.8 16 Z" {...S} fill={F(fill)} />
        <Line x1={13.8} y1={6.8} x2={17.2} y2={10.2} {...S} />
      </G>);

    case 'trash':
      return svg(<G>
        <Line x1={5} y1={7} x2={19} y2={7} {...S} />
        <Path d="M9.5 7 V5.6 A1 1 0 0 1 10.5 4.6 H13.5 A1 1 0 0 1 14.5 5.6 V7" {...S} />
        <Path d="M6.6 7 L7.4 19 A1.6 1.6 0 0 0 9 20.4 H15 A1.6 1.6 0 0 0 16.6 19 L17.4 7" {...S} />
        <Line x1={10.4} y1={10.5} x2={10.7} y2={16.5} {...S} />
        <Line x1={13.6} y1={10.5} x2={13.3} y2={16.5} {...S} />
      </G>);

    case 'flag': // report pennant
      return svg(<G>
        <Line x1={6} y1={3.4} x2={6} y2={20.6} {...S} />
        <Path d="M6 4.6 L17 4.6 L14 8.6 L17 12.6 L6 12.6" {...S} fill={F(fill)} />
      </G>);

    case 'share':
      return svg(<G>
        <Circle cx={6} cy={12} r={2.3} {...S} fill={F(fill)} />
        <Circle cx={17} cy={6} r={2.3} {...S} fill={F(fill)} />
        <Circle cx={17} cy={18} r={2.3} {...S} fill={F(fill)} />
        <Line x1={8} y1={11} x2={15} y2={7} {...S} />
        <Line x1={8} y1={13} x2={15} y2={17} {...S} />
      </G>);

    case 'directions': // navigation arrow diamond
      return svg(<G>
        <Path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z" {...S} />
        <Path d="M10 13.5 V11 A1 1 0 0 1 11 10 H14.5" {...S} />
        <Path d="M13 8.5 L15.5 10 L13 11.5" {...S} />
      </G>);

    case 'clock':
      return svg(<G>
        <Circle cx={12} cy={12} r={7.6} {...S} />
        <Path d="M12 7.6 V12 L15 14" {...S} />
      </G>);

    case 'chevronLeft': return svg(<Path d="M14.5 5 L8 12 L14.5 19" {...S} />);
    case 'chevronRight': return svg(<Path d="M9.5 5 L16 12 L9.5 19" {...S} />);
    case 'chevronUp': return svg(<Path d="M6 14.5 L12 8.5 L18 14.5" {...S} />);
    case 'chevronDown': return svg(<Path d="M6 9.5 L12 15.5 L18 9.5" {...S} />);
    case 'check': return svg(<Path d="M5 12.5 L10 17.5 L19 6.5" {...S} />);
    case 'more': return svg(<G><Circle cx={5.5} cy={12} r={1.5} fill={color} stroke="none" /><Circle cx={12} cy={12} r={1.5} fill={color} stroke="none" /><Circle cx={18.5} cy={12} r={1.5} fill={color} stroke="none" /></G>);
    case 'close': return svg(<G><Line x1={6.5} y1={6.5} x2={17.5} y2={17.5} {...S} /><Line x1={17.5} y1={6.5} x2={6.5} y2={17.5} {...S} /></G>);
    case 'plus': return svg(<G><Line x1={12} y1={5.5} x2={12} y2={18.5} {...S} /><Line x1={5.5} y1={12} x2={18.5} y2={12} {...S} /></G>);

    default:
      return svg(<Circle cx={12} cy={12} r={7} {...S} />);
  }
}
