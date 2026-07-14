import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { colors, strokeW } from '../../lib/theme';

// Proprietary nav iconography — bespoke geometric line art, not stock wireframe.
// Uniform 1.75 stroke, round joins/caps. Inactive: low-opacity night-white line
// art that blends into the frosted pod. Active: dual-tone (accent stroke + a soft
// accent fill), with a spring neon dot rendered by the tab bar beneath it.
const SW = strokeW;
const INACTIVE = 'rgba(242,244,248,0.5)';

function tone(active) {
  return active
    ? { stroke: colors.accent, fill: colors.accent, fillOpacity: 0.2, solid: colors.accent }
    : { stroke: INACTIVE, fill: 'none', fillOpacity: 0, solid: 'none' };
}

const svgProps = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' });
const stroke = (t) => ({ stroke: t.stroke, strokeWidth: SW, strokeLinecap: 'round', strokeLinejoin: 'round' });

// Feed / Explore — double-layered geometric card (a "discovery viewport"), not a house.
export function ExploreIcon({ active, size = 24 }) {
  const t = tone(active);
  return (
    <Svg {...svgProps(size)}>
      <Rect x={8} y={3.5} width={12} height={12} rx={3.2} {...stroke(t)} opacity={active ? 0.55 : 0.85} />
      <Rect x={4} y={8.5} width={12} height={12} rx={3.2} {...stroke(t)} fill={t.fill} fillOpacity={t.fillOpacity} />
    </Svg>
  );
}

// Saved — sharp bookmark ribbon with a rounded shoulder.
export function SavedIcon({ active, size = 24 }) {
  const t = tone(active);
  return (
    <Svg {...svgProps(size)}>
      <Path
        d="M7 4.5 L17 4.5 A1.6 1.6 0 0 1 18.5 6 L18.5 20 L12 15.7 L5.5 20 L5.5 6 A1.6 1.6 0 0 1 7 4.5 Z"
        {...stroke(t)} fill={t.fill} fillOpacity={t.fillOpacity}
      />
    </Svg>
  );
}

// Trips — abstract map-node timeline (nodes joined by a route), not a calendar box.
export function TripsIcon({ active, size = 24 }) {
  const t = tone(active);
  const dotFill = active ? t.solid : 'none';
  return (
    <Svg {...svgProps(size)}>
      <Path d="M6.2 18 L11 12.4 L17.8 6" {...stroke(t)} />
      <Circle cx={6.2} cy={18} r={2.2} {...stroke(t)} fill={dotFill} />
      <Circle cx={11} cy={12.4} r={1.5} {...stroke(t)} fill={dotFill} />
      <Circle cx={17.8} cy={6} r={2.2} {...stroke(t)} fill={dotFill} />
    </Svg>
  );
}

// Plans — layered plan rows (node + measure line), reads as an itinerary ledger.
export function PlansIcon({ active, size = 24 }) {
  const t = tone(active);
  const dotFill = active ? t.solid : 'none';
  const rows = [[7, 18], [12, 16], [17, 17.5]];
  return (
    <Svg {...svgProps(size)}>
      <G>
        {rows.map(([y, x2], i) => (
          <G key={i}>
            <Circle cx={6.4} cy={y} r={1.5} {...stroke(t)} fill={dotFill} />
            <Path d={`M10 ${y} H${x2}`} {...stroke(t)} />
          </G>
        ))}
      </G>
    </Svg>
  );
}

// Map — a location pin with an open centre (the going-out map tab).
export function MapIcon({ active, size = 24 }) {
  const t = tone(active);
  const dotFill = active ? t.solid : 'none';
  return (
    <Svg {...svgProps(size)}>
      <Path d="M12 21 C 12 21, 5.5 14.5, 5.5 9.5 A6.5 6.5 0 0 1 18.5 9.5 C 18.5 14.5, 12 21, 12 21 Z" {...stroke(t)} fill={t.fill} fillOpacity={t.fillOpacity} />
      <Circle cx={12} cy={9.5} r={2.2} {...stroke(t)} fill={dotFill} />
    </Svg>
  );
}

// Profile — clean head + shoulders arc.
export function ProfileIcon({ active, size = 24 }) {
  const t = tone(active);
  return (
    <Svg {...svgProps(size)}>
      <Circle cx={12} cy={8.5} r={3.6} {...stroke(t)} fill={t.fill} fillOpacity={t.fillOpacity} />
      <Path d="M5.6 19.4 C 6.9 15.7, 17.1 15.7, 18.4 19.4" {...stroke(t)} />
    </Svg>
  );
}

export const NAV_ICONS = {
  BrowseTab: ExploreIcon,
  SavedTab: SavedIcon,
  TripsTab: TripsIcon,
  ProfileTab: ProfileIcon,
};
