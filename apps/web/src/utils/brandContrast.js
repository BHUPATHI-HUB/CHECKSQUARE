// Pick the higher-contrast neutral foreground without changing a saved brand color.
export function brandForeground(hex) {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex || '')) return '0 0% 100%';
  const value = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  const channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? '0 0% 0%' : '0 0% 100%';
}
