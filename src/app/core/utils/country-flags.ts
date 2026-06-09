/**
 * Maps country names (as they appear in the sheet) to ISO 3166-1 alpha-2 codes.
 * Used with the flag-icons library: <span class="fi fi-{code}"></span>
 * Full 48-team WC2026 participant list.
 */
export const COUNTRY_ISO: Record<string, string> = {
  // Group A
  'United States': 'us',
  'USA': 'us',
  'Mexico': 'mx',
  'Canada': 'ca',

  // Group B
  'Uruguay': 'uy',
  'Panama': 'pa',
  'Bolivia': 'bo',

  // Group C
  'Argentina': 'ar',
  'Chile': 'cl',
  'Peru': 'pe',

  // Group D
  'Brazil': 'br',
  'Ecuador': 'ec',
  'Paraguay': 'py',
  'Venezuela': 've',

  // Group E
  'Colombia': 'co',
  'Costa Rica': 'cr',
  'Honduras': 'hn',

  // Group F
  'Portugal': 'pt',
  'Croatia': 'hr',
  'Turkey': 'tr',
  'Albania': 'al',

  // Group G
  'Spain': 'es',
  'Netherlands': 'nl',
  'Serbia': 'rs',
  'Iceland': 'is',

  // Group H
  'France': 'fr',
  'Belgium': 'be',
  'Italy': 'it',
  'Ukraine': 'ua',

  // Group I
  'Germany': 'de',
  'Austria': 'at',
  'Hungary': 'hu',
  'Switzerland': 'ch',

  // Group J
  'England': 'gb-eng',
  'Wales': 'gb-wls',
  'Scotland': 'gb-sct',
  'Slovenia': 'si',

  // Group K
  'Morocco': 'ma',
  'Senegal': 'sn',
  'South Africa': 'za',
  'DR Congo': 'cd',
  'Congo': 'cd',

  // Group L
  'Japan': 'jp',
  'South Korea': 'kr',
  'Korea Republic': 'kr',
  'Australia': 'au',
  'Saudi Arabia': 'sa',

  // Group M (shared hosts / others)
  'Nigeria': 'ng',
  'Egypt': 'eg',
  'Cameroon': 'cm',
  'Ghana': 'gh',
  'Tunisia': 'tn',

  // Other qualifiers
  'Iran': 'ir',
  'Qatar': 'qa',
  'China': 'cn',
  'New Zealand': 'nz',
  'Indonesia': 'id',
  'Cuba': 'cu',
  'Jamaica': 'jm',
};

/** Returns the ISO alpha-2 code for a country name, or undefined if not found. */
export function getCountryCode(country: string): string | undefined {
  return COUNTRY_ISO[country] ?? COUNTRY_ISO[country.trim()];
}

/**
 * Group → accent color mapping for WC2026.
 * Colors are subtle, suitable for a dark-theme card background.
 */
export const GROUP_COLORS: Record<string, string> = {
  'Group A': '#1a3a2a',
  'Group B': '#1a2a3a',
  'Group C': '#2a1a3a',
  'Group D': '#3a2a1a',
  'Group E': '#3a1a1a',
  'Group F': '#1a3a3a',
  'Group G': '#2a3a1a',
  'Group H': '#3a1a2a',
  'Group I': '#1a2a1a',
  'Group J': '#2a2a3a',
  'Group K': '#3a2a2a',
  'Group L': '#2a3a2a',
  // knockout / misc
  'Round of 32': '#1e1e2e',
  'Round of 16': '#1e2e1e',
  'Quarter-final': '#2e1e1e',
  'Semi-final': '#2e2e1e',
  'Final': '#2e1e2e',
};

/** Returns a CSS color string for a group label, falling back to a neutral dark tone. */
export function getGroupColor(group: string): string {
  return GROUP_COLORS[group] ?? '#1e1e1e';
}
