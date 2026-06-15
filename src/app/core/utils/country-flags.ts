/**
 * Maps country names (as they appear in the sheet) to ISO 3166-1 alpha-2 codes.
 * Used with the flag-icons library: <span class="fi fi-{code}"></span>
 * Full 48-team WC2026 participant list plus common name aliases.
 */
export const COUNTRY_ISO: Record<string, string> = {
  // ── WC2026 participants (exact names as used in the Matches sheet) ──────────
  'Algeria': 'dz',
  'Argentina': 'ar',
  'Australia': 'au',
  'Austria': 'at',
  'Belgium': 'be',
  'Bosnia and Herzegovina': 'ba',
  'Brazil': 'br',
  'Cabo Verde': 'cv',
  'Canada': 'ca',
  'Colombia': 'co',
  'Congo DR': 'cd',
  "Côte d'Ivoire": 'ci',
  'Croatia': 'hr',
  'Curaçao': 'cw',
  'Czechia': 'cz',
  'Ecuador': 'ec',
  'Egypt': 'eg',
  'England': 'gb-eng',
  'France': 'fr',
  'Germany': 'de',
  'Ghana': 'gh',
  'Haiti': 'ht',
  'IR Iran': 'ir',
  'Iraq': 'iq',
  'Japan': 'jp',
  'Jordan': 'jo',
  'Korea Republic': 'kr',
  'Mexico': 'mx',
  'Morocco': 'ma',
  'Netherlands': 'nl',
  'New Zealand': 'nz',
  'Norway': 'no',
  'Panama': 'pa',
  'Paraguay': 'py',
  'Portugal': 'pt',
  'Qatar': 'qa',
  'Saudi Arabia': 'sa',
  'Scotland': 'gb-sct',
  'Senegal': 'sn',
  'South Africa': 'za',
  'Spain': 'es',
  'Sweden': 'se',
  'Switzerland': 'ch',
  'Tunisia': 'tn',
  'Türkiye': 'tr',
  'United States': 'us',
  'Uruguay': 'uy',
  'Uzbekistan': 'uz',

  // ── Common name aliases ───────────────────────────────────────────────────
  'USA': 'us',
  'US': 'us',
  'South Korea': 'kr',
  'Korea': 'kr',
  'Iran': 'ir',
  'Turkey': 'tr',
  'DR Congo': 'cd',
  'Congo': 'cd',
  'Ivory Coast': 'ci',
  'Czech Republic': 'cz',
  'Wales': 'gb-wls',
  'Bolivia': 'bo',
  'Chile': 'cl',
  'Venezuela': 've',
  'Costa Rica': 'cr',
  'Honduras': 'hn',
  'Albania': 'al',
  'Serbia': 'rs',
  'Iceland': 'is',
  'Italy': 'it',
  'Ukraine': 'ua',
  'Hungary': 'hu',
  'Slovenia': 'si',
  'Peru': 'pe',
  'Indonesia': 'id',
  'Cuba': 'cu',
  'Jamaica': 'jm',
};

/** Returns the ISO alpha-2 code for a country name, or undefined if not found. */
export function getCountryCode(country: string | undefined | null): string | undefined {
  if (!country) return undefined;
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
