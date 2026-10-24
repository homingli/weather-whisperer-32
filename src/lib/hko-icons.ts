/** HKO icon code mapping and warning display utilities */

/** Map HKO icon codes to WMO-like weather codes */
export function hkoIconToWeatherCode(iconCode: number): number {
  // HKO icon reference: https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm
  const iconMap: Record<number, number> = {
    50: 0,   // Sunny
    51: 1,   // Sunny Periods
    52: 2,   // Sunny Intervals
    53: 2,   // Sunny Periods with A Few Showers
    54: 61,  // Sunny Intervals with Showers
    60: 3,   // Cloudy
    61: 3,   // Overcast
    62: 61,  // Light Rain
    63: 63,  // Rain
    64: 65,  // Heavy Rain
    65: 95,  // Thunderstorms
    70: 0,   // Fine (night)
    71: 1,   // Fine (night)
    72: 2,   // Fine (night)
    73: 2,   // Fine (night) with showers
    74: 61,  // Showers (night)
    75: 3,   // Cloudy (night)
    76: 3,   // Overcast (night)
    77: 61,  // Light Rain (night)
    80: 71,  // Windy
    81: 65,  // Dry
    82: 73,  // Humid
    83: 45,  // Fog
    84: 45,  // Mist
    85: 45,  // Haze
    90: 95,  // Hot
    91: 95,  // Warm
    92: 0,   // Cool
    93: 0,   // Cold
  };
  return iconMap[iconCode] ?? 3;
}

/** Get CSS color class for a warning code */
export function getWarningColor(code: string): string {
  const redWarnings = ['WFIRER', 'WRAINR', 'WRAINB', 'WTMW', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10'];
  const yellowWarnings = ['WFIREY', 'WRAINA', 'WTS', 'TC3'];

  if (redWarnings.includes(code)) return 'destructive';
  if (yellowWarnings.includes(code)) return 'warning';

  return 'secondary';
}

/** Warnsum code → asset filename. Module-level so callers can ask whether
 *  a code has a REAL icon (getWarningIcon also has guess-by-prefix
 *  fallbacks that would show a misleading generic asset). */
const WARNING_ICON_FILES: Record<string, string> = {
  'WFIREY': 'firey.gif',
  'WFIRER': 'firer.gif',
  'WFROST': 'frost.gif',
  'WHOT': 'vhot.gif',
  'WCOLD': 'cold.gif',
  'WMSGNL': 'sms.gif',
  'WRAINA': 'raina.gif',
  'WRAINR': 'rainr.gif',
  'WRAINB': 'rainb.gif',
  'WFNTSA': 'ntfl.gif',
  'WL': 'landslip.gif',
  'TC1': 'tc1.gif',
  'TC3': 'tc3.gif',
  'TC8NE': 'tc8ne.gif',
  'TC8SE': 'tc8b.gif',
  'TC8NW': 'tc8d.gif',
  'TC8SW': 'tc8c.gif',
  'TC9': 'tc9.gif',
  'TC10': 'tc10.gif',
  'WTMW': 'tsunami-warn.gif',
  'WTS': 'ts.gif',
};

/** True iff the code has an exact, real warning icon (no prefix guessing). */
export function hasWarningIcon(warningCode: string): boolean {
  return WARNING_ICON_FILES[warningCode.toUpperCase()] != null;
}

/** Get warning icon asset path for a warning code */
export function getWarningIcon(warningCode: string): string {
  const baseUrl = '/icons/hko-warnings';

  if (WARNING_ICON_FILES[warningCode]) {
    return `${baseUrl}/${WARNING_ICON_FILES[warningCode]}`;
  }

  // Fallbacks for base codes
  if (warningCode.startsWith('WFIRE')) return `${baseUrl}/firey.gif`;
  if (warningCode.startsWith('WRAIN')) return `${baseUrl}/raina.gif`;
  if (warningCode.startsWith('TC') || warningCode.startsWith('WTCSGNL')) return `${baseUrl}/tc1.gif`;
  if (warningCode.startsWith('WFNTSA')) return `${baseUrl}/ntfl.gif`;

  return `${baseUrl}/ts.gif`;
}
