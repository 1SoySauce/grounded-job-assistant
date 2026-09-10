import {
  emptyApplicant,
  type ApplicantProfile,
  type ImportDraft,
  type ImportSuggestion,
} from '../types/applicant';

export type ResumeSectionName =
  | 'Header'
  | 'Education'
  | 'Employment'
  | 'Projects'
  | 'Skills'
  | 'Certifications';
export type ResumeSection = {
  name: ResumeSectionName;
  heading: string;
  lines: string[];
};

const headingAliases: Array<[RegExp, ResumeSectionName]> = [
  [/^(education|academic background|academic history)$/i, 'Education'],
  [
    /^(experience|work experience|professional experience|employment|employment history|career history)$/i,
    'Employment',
  ],
  [
    /^(projects|selected projects|personal projects|academic projects)$/i,
    'Projects',
  ],
  [
    /^(technical skills|skills|skills (?:&|and) technologies|technical competencies|technologies)$/i,
    'Skills',
  ],
  [
    /^(certifications|certificates|licenses (?:&|and) certifications)$/i,
    'Certifications',
  ],
];
const month =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const dateToken = `(?:${month}\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}|${month}\\.?)`;
const dateRangePattern = new RegExp(
  `(${dateToken})\\s*(?:-|–|—|to)\\s*(Present|Current|Now|${dateToken})`,
  'i',
);
const bulletPattern = /^(?:[•●▪◦‣∙*]|[-–—]\s+)\s*/;
const urlPattern = /(?:https?:\/\/|www\.)[^\s<>()[\]{}]+/gi;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}/g;
const institutionPattern =
  /\b(university|college|institute|school|academy|polytechnic)\b/i;
const degreePattern =
  /\b(?:associate(?:'s)?|bachelor(?:'s)?|master(?:'s)?|doctor(?:ate)?|ph\.?d\.?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|a\.?s\.?|a\.?a\.?|diploma|certificate)\b/i;
const titlePattern =
  /\b(engineer|developer|analyst|manager|specialist|consultant|administrator|technician|intern|director|coordinator|architect|scientist|designer|lead|associate|officer|assistant)\b/i;
const companyPattern =
  /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?|group|systems|solutions|technologies)\b/i;
const usStates = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
    ' ',
  ),
);
const countryNames = new Set(
  [
    'Argentina',
    'Australia',
    'Austria',
    'Belgium',
    'Brazil',
    'Canada',
    'China',
    'Colombia',
    'Denmark',
    'Finland',
    'France',
    'Germany',
    'Ghana',
    'Greece',
    'India',
    'Ireland',
    'Israel',
    'Italy',
    'Japan',
    'Kenya',
    'Mexico',
    'Netherlands',
    'New Zealand',
    'Nigeria',
    'Norway',
    'Pakistan',
    'Philippines',
    'Poland',
    'Portugal',
    'Singapore',
    'South Africa',
    'South Korea',
    'Spain',
    'Sweden',
    'Switzerland',
    'Taiwan',
    'United Arab Emirates',
    'United Kingdom',
    'United States',
    'United States of America',
    'USA',
    'US',
  ].map((value) => value.toLocaleLowerCase()),
);
for (const country of 'Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Armenia|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belize|Benin|Bhutan|Bolivia|Bosnia and Herzegovina|Botswana|Brunei|Bulgaria|Burkina Faso|Burundi|Cabo Verde|Cambodia|Cameroon|Central African Republic|Chad|Chile|Costa Rica|Croatia|Cuba|Cyprus|Czech Republic|Democratic Republic of the Congo|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Eswatini|Ethiopia|Fiji|Gabon|Gambia|Georgia|Grenada|Guatemala|Guinea|Guinea-Bissau|Guyana|Haiti|Honduras|Hungary|Iceland|Indonesia|Iran|Iraq|Jamaica|Jordan|Kazakhstan|Kiribati|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Nicaragua|Niger|North Korea|North Macedonia|Oman|Palau|Palestine|Panama|Papua New Guinea|Paraguay|Peru|Qatar|Romania|Russia|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|Sao Tome and Principe|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Slovakia|Slovenia|Solomon Islands|Somalia|South Sudan|Sri Lanka|Sudan|Suriname|Syria|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe'.split(
  '|',
))
  countryNames.add(country.toLocaleLowerCase());
const technologyNames = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'C#',
  'C++',
  'Go',
  'Rust',
  'Ruby',
  'PHP',
  'SQL',
  'HTML',
  'CSS',
  'React',
  'Angular',
  'Vue',
  'Node.js',
  'Express',
  'Django',
  'Flask',
  'Spring',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'AWS',
  'Azure',
  'GCP',
  'Docker',
  'Kubernetes',
  'Terraform',
  'Git',
  'GitHub',
  'Linux',
  'Windows',
  'macOS',
  'Jest',
  'Vitest',
  'Cypress',
  'Playwright',
  'PyTorch',
  'TensorFlow',
  'OpenAI',
  'REST',
  'GraphQL',
];

function cleanLine(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .trim();
}
function headingText(value: string): string {
  const cleaned = cleanLine(value)
    .replace(/^[|:;,.\-–—]+|[|:;,.\-–—]+$/g, '')
    .trim();
  return /^(?:[A-Za-z]\s+){2,}[A-Za-z]$/.test(cleaned)
    ? cleaned.replace(/\s+/g, '')
    : cleaned;
}
function headingFor(value: string): ResumeSectionName | undefined {
  const candidate = headingText(value);
  return headingAliases.find(([pattern]) => pattern.test(candidate))?.[1];
}
export function detectSections(text: string): ResumeSection[] {
  const sections: ResumeSection[] = [
    { name: 'Header', heading: 'Header', lines: [] },
  ];
  let current = sections[0]!;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanLine(raw);
    const inline = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    const direct = headingFor(line);
    const inlineLabel = inline?.[1] ? headingText(inline[1]) : '';
    const detected =
      direct ??
      (inlineLabel.toLocaleLowerCase() === 'technologies'
        ? undefined
        : headingFor(inlineLabel));
    if (detected) {
      current = { name: detected, heading: inline?.[1] ?? line, lines: [] };
      sections.push(current);
      if (inline?.[2]) current.lines.push(cleanLine(inline[2]));
    } else current.lines.push(line);
  }
  return sections;
}
function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function trimUrl(value: string): string {
  const cleaned = value.replace(/[.,;:!?]+$/, '');
  return cleaned.startsWith('www.') ? `https://${cleaned}` : cleaned;
}
function urlsIn(text: string): string[] {
  return unique((text.match(urlPattern) ?? []).map(trimUrl)).filter((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
}
function confidence(score: number): ImportSuggestion['confidence'] {
  return score >= 0.85 ? 'high' : score >= 0.6 ? 'medium' : 'low';
}
function addSuggestion(
  suggestions: ImportSuggestion[],
  path: string,
  score: number,
  sourceSection: ResumeSectionName,
  sourceText: string,
): void {
  suggestions.push({
    path,
    score,
    confidence: confidence(score),
    sourceSection,
    sourceText: sourceText.slice(0, 2_000),
  });
}
function lineLocation(
  value: string,
): { city: string; state: string; country: string } | undefined {
  const parts = value
    .split(/\s*(?:,|\||·)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return undefined;
  const state = parts[1]!.replace(/\s+\d{5}(?:-\d{4})?$/, '');
  const country = parts[2] && isExplicitCountry(parts[2]) ? parts[2] : '';
  if (!usStates.has(state.toUpperCase()) && !country) return undefined;
  if (/\d|@|https?:/i.test(parts[0]!)) return undefined;
  return { city: parts[0]!, state, country };
}
function isExplicitCountry(value: string): boolean {
  const cleaned = value.trim();
  return (
    !/\d|@|https?:\/\/|www\.|\b(?:present|current)\b/i.test(cleaned) &&
    /^[\p{L}][\p{L} .'-]{1,80}$/u.test(cleaned) &&
    countryNames.has(cleaned.toLocaleLowerCase())
  );
}
function trailingLocation(
  value: string,
): { text: string; location: string } | undefined {
  const state =
    '(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)';
  const city = "[\\p{Lu}][\\p{L}'-]*(?:\\s+[\\p{Lu}][\\p{L}'-]*){0,2}";
  const titleWord =
    '(?:engineer|developer|analyst|manager|specialist|consultant|administrator|technician|intern|director|coordinator|architect|scientist|designer|lead|associate|officer|assistant)';
  const companyWord =
    '(?:inc\\.?|llc|ltd\\.?|corp\\.?|corporation|company|co\\.?|group|systems|solutions|technologies)';
  const institutionWord =
    '(?:university|college|institute|school|academy|polytechnic)';
  for (const pattern of [
    new RegExp(
      `^(.*\\b${titleWord}\\b)\\s+(${city},\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?)$`,
      'iu',
    ),
    new RegExp(
      `^(.*\\b${companyWord}\\b)\\s+(${city},\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?)$`,
      'iu',
    ),
    new RegExp(
      `^(.*\\b${institutionWord}\\b),?\\s+(${city},\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?)$`,
      'iu',
    ),
    new RegExp(
      `^(.*?\\S)\\s+([\\p{Lu}][\\p{L}'-]*,\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?)$`,
      'u',
    ),
  ]) {
    const match = pattern.exec(value);
    if (match?.[1] && match[2])
      return { text: match[1].trim(), location: match[2].trim() };
  }
  return undefined;
}
function dateRange(
  value: string,
):
  { start: string; end: string; current: boolean; source: string } | undefined {
  const match = dateRangePattern.exec(value);
  if (!match) return undefined;
  return {
    start: cleanLine(match[1]!),
    end: cleanLine(match[2]!),
    current: /^(present|current|now)$/i.test(match[2]!),
    source: match[0],
  };
}
function terminalEducationDate(
  value: string,
): { text: string; date: string } | undefined {
  const match = new RegExp(
    `^(.*?)(?:[,|•·]|\\s)\\s*(${month}\\.?\\s+\\d{4}|\\d{4})$`,
    'i',
  ).exec(value);
  if (!match?.[1] || !match[2]) return undefined;
  if (/^\d{4}$/.test(match[2])) {
    const year = Number(match[2]);
    if (year < 1950 || year > 2100) return undefined;
  }
  const text = match[1].replace(/[\s,|•·-]+$/, '').trim();
  return text ? { text, date: cleanLine(match[2]) } : undefined;
}
function labeledEducationValues(
  value: string,
): Partial<Record<'major' | 'concentration' | 'minor' | 'gpa', string>> {
  const matches = [
    ...value.matchAll(/\b(major|concentration|minor|gpa)\s*:/gi),
  ];
  const result: Partial<
    Record<'major' | 'concentration' | 'minor' | 'gpa', string>
  > = {};
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const key = match[1]!.toLocaleLowerCase() as
      'major' | 'concentration' | 'minor' | 'gpa';
    const start = match.index! + match[0].length;
    const end = matches[index + 1]?.index ?? value.length;
    const field = value
      .slice(start, end)
      .replace(/^[\s|•·:;-]+|[\s|•·:;-]+$/g, '')
      .trim();
    if (field) result[key] = field;
  }
  return result;
}
function technologiesIn(lines: string[]): string[] {
  const text = lines.join(' ');
  return technologyNames.filter((technology) => {
    const escaped = technology.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(^|[^A-Za-z0-9+#])${escaped}(?=$|[^A-Za-z0-9+#])`,
      'i',
    ).test(text);
  });
}
function splitItems(value: string): string[] {
  return unique(
    value
      .replace(bulletPattern, '')
      .split(/\s*(?:,|;|\||•)\s*/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 100),
  );
}

function headerCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
  fullText: string,
): void {
  const nonempty = section.lines.filter(Boolean);
  const emails = unique(fullText.match(emailPattern) ?? []);
  if (emails.length === 1) {
    candidate.personal.email = emails[0]!;
    addSuggestion(suggestions, 'personal.email', 0.99, 'Header', emails[0]!);
  }
  const phones = unique(fullText.match(phonePattern) ?? []);
  if (phones.length === 1) {
    candidate.personal.phone = phones[0]!;
    addSuggestion(suggestions, 'personal.phone', 0.94, 'Header', phones[0]!);
  }
  const urls = urlsIn(fullText);
  for (const [key, domain] of [
    ['linkedinUrl', 'linkedin.com'],
    ['githubUrl', 'github.com'],
  ] as const) {
    const matches = urls.filter(
      (value) =>
        new URL(value).hostname.replace(/^www\./, '').toLowerCase() === domain,
    );
    if (matches.length === 1) {
      candidate.personal[key] = matches[0]!;
      addSuggestion(
        suggestions,
        `personal.${key}`,
        0.98,
        'Header',
        matches[0]!,
      );
    }
  }
  const reserved = new Set(
    [candidate.personal.linkedinUrl, candidate.personal.githubUrl].filter(
      Boolean,
    ),
  );
  const portfolios = urls.filter((value) => !reserved.has(value));
  if (portfolios.length === 1) {
    candidate.personal.portfolioUrl = portfolios[0]!;
    addSuggestion(
      suggestions,
      'personal.portfolioUrl',
      0.86,
      'Header',
      portfolios[0]!,
    );
  }
  const firstLine = nonempty[0];
  const nameLine =
    firstLine &&
    (() => {
      const line = firstLine;
      const words = line.split(/\s+/);
      return words.length >= 2 &&
        words.length <= 4 &&
        words.every((word) => /^[\p{L}][\p{L}'’-]*\.?$/u.test(word)) &&
        !headingFor(line) &&
        !institutionPattern.test(line)
        ? line
        : undefined;
    })();
  if (nameLine) {
    const names = nameLine.split(/\s+/).map((part) => part.replace(/\.$/, ''));
    candidate.personal.firstName = names[0]!;
    candidate.personal.lastName = names.at(-1)!;
    if (names.length > 2)
      candidate.personal.middleName = names.slice(1, -1).join(' ');
    addSuggestion(suggestions, 'personal.firstName', 0.88, 'Header', nameLine);
    if (candidate.personal.middleName)
      addSuggestion(
        suggestions,
        'personal.middleName',
        0.78,
        'Header',
        nameLine,
      );
    addSuggestion(suggestions, 'personal.lastName', 0.88, 'Header', nameLine);
  }
  const locationSource = nonempty
    .slice(0, 10)
    .find((line) => lineLocation(line));
  const location = locationSource ? lineLocation(locationSource) : undefined;
  if (location && locationSource) {
    candidate.personal.city = location.city;
    candidate.personal.state = location.state;
    addSuggestion(suggestions, 'personal.city', 0.86, 'Header', locationSource);
    addSuggestion(
      suggestions,
      'personal.state',
      0.86,
      'Header',
      locationSource,
    );
    if (location.country) {
      candidate.personal.country = location.country;
      addSuggestion(
        suggestions,
        'personal.country',
        0.92,
        'Header',
        locationSource,
      );
    }
  }
  const countryLine = nonempty.find((line) => /^country\s*:/i.test(line));
  const explicitCountry = countryLine?.replace(/^country\s*:\s*/i, '').trim();
  if (
    explicitCountry &&
    isExplicitCountry(explicitCountry) &&
    !candidate.personal.country
  ) {
    candidate.personal.country = explicitCountry;
    addSuggestion(
      suggestions,
      'personal.country',
      0.98,
      'Header',
      countryLine!,
    );
  }
}

function educationCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
): void {
  const lines = section.lines.filter(Boolean);
  const starts = lines
    .map((line, index) => (institutionPattern.test(line) ? index : -1))
    .filter((index) => index >= 0);
  for (let item = 0; item < starts.length; item++) {
    const block = lines.slice(starts[item]!, starts[item + 1] ?? lines.length);
    const institutionLine = block[0]!;
    const institutionLocation = trailingLocation(institutionLine);
    const institution = institutionLocation
      ? institutionLocation.text.replace(/[\s,]+$/, '')
      : institutionLine;
    const id = crypto.randomUUID();
    const entry: ApplicantProfile['education'][number] = {
      id,
      institution,
      degree: '',
      major: '',
      concentration: '',
      minor: '',
      gpa: '',
      startDate: '',
      graduationDate: '',
      location: '',
    };
    addSuggestion(
      suggestions,
      `education.${id}.institution`,
      0.96,
      'Education',
      institutionLine,
    );
    if (institutionLocation) {
      entry.location = institutionLocation.location;
      addSuggestion(
        suggestions,
        `education.${id}.location`,
        0.91,
        'Education',
        institutionLine,
      );
    }
    const degreeLine = block.find((line) => degreePattern.test(line));
    if (degreeLine) {
      const degreeDate = terminalEducationDate(degreeLine);
      const degreeSource = degreeDate?.text ?? degreeLine;
      const concentration =
        /\b(?:concentration|focus|specialization)\s*(?:in|:)\s*([^|;,]+)/i.exec(
          degreeSource,
        );
      const major =
        /\b(?:major(?:ed)?\s*(?:in|:)|\bin)\s*([^|;,]+?)(?=\s+(?:with\s+)?(?:concentration|focus|specialization)\b|$)/i.exec(
          degreeSource,
        );
      entry.degree = degreeSource
        .replace(/\s*(?:\||,|;)\s*(?:major|concentration|focus|gpa)\b.*$/i, '')
        .replace(/\s+in\s+.+$/i, '')
        .trim();
      entry.major = major?.[1]?.trim() ?? '';
      entry.concentration = concentration?.[1]?.trim() ?? '';
      addSuggestion(
        suggestions,
        `education.${id}.degree`,
        0.9,
        'Education',
        degreeLine,
      );
      if (entry.major)
        addSuggestion(
          suggestions,
          `education.${id}.major`,
          0.86,
          'Education',
          degreeLine,
        );
      if (entry.concentration)
        addSuggestion(
          suggestions,
          `education.${id}.concentration`,
          0.9,
          'Education',
          degreeLine,
        );
      if (degreeDate) {
        entry.graduationDate = degreeDate.date;
        addSuggestion(
          suggestions,
          `education.${id}.graduationDate`,
          0.94,
          'Education',
          degreeLine,
        );
      }
    }
    for (const source of block) {
      const labeled = labeledEducationValues(source);
      for (const key of ['major', 'concentration', 'minor'] as const) {
        const value = labeled[key];
        if (!value) continue;
        entry[key] = value;
        const existingSuggestion = suggestions.findIndex(
          (suggestion) => suggestion.path === `education.${id}.${key}`,
        );
        if (existingSuggestion >= 0) suggestions.splice(existingSuggestion, 1);
        addSuggestion(
          suggestions,
          `education.${id}.${key}`,
          0.98,
          'Education',
          source,
        );
      }
    }
    const gpaLine = block.find((line) => /\bGPA\b/i.test(line));
    const gpa = gpaLine
      ? /\bGPA\s*(?::|of)?\s*([0-4](?:\.\d{1,2})?(?:\s*\/\s*[0-4](?:\.\d{1,2})?)?)/i.exec(
          gpaLine,
        )
      : undefined;
    if (gpa?.[1] && gpaLine) {
      entry.gpa = gpa[1].replace(/\s+/g, '');
      addSuggestion(
        suggestions,
        `education.${id}.gpa`,
        0.98,
        'Education',
        gpaLine,
      );
    }
    const dates = block.map(dateRange).find(Boolean);
    if (dates) {
      entry.startDate = dates.start;
      entry.graduationDate = dates.end;
      const source = block.find((line) => line.includes(dates.source))!;
      const existingGraduation = suggestions.findIndex(
        (suggestion) => suggestion.path === `education.${id}.graduationDate`,
      );
      if (existingGraduation >= 0) suggestions.splice(existingGraduation, 1);
      addSuggestion(
        suggestions,
        `education.${id}.startDate`,
        0.94,
        'Education',
        source,
      );
      addSuggestion(
        suggestions,
        `education.${id}.graduationDate`,
        0.94,
        'Education',
        source,
      );
    } else if (!entry.graduationDate) {
      const graduationLine = block.find((line) =>
        /\b(?:expected|graduat(?:ed|ion))\b/i.test(line),
      );
      const date = graduationLine?.match(new RegExp(dateToken, 'i'))?.[0];
      if (date && graduationLine) {
        entry.graduationDate = date;
        addSuggestion(
          suggestions,
          `education.${id}.graduationDate`,
          0.91,
          'Education',
          graduationLine,
        );
      }
    }
    const locationLine = entry.location
      ? undefined
      : block.slice(1).find((line) => lineLocation(line));
    if (locationLine && !entry.location) {
      entry.location = locationLine;
      addSuggestion(
        suggestions,
        `education.${id}.location`,
        0.82,
        'Education',
        locationLine,
      );
    }
    candidate.education.push(entry);
  }
}

function employmentCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
): void {
  const lines = section.lines.filter(Boolean);
  const dateIndexes = lines
    .map((line, index) => (dateRange(line) ? index : -1))
    .filter((index) => index >= 0);
  for (let record = 0; record < dateIndexes.length; record++) {
    const dateIndex = dateIndexes[record]!;
    const dates = dateRange(lines[dateIndex]!)!;
    const previousDate = dateIndexes[record - 1] ?? -1;
    const prelude = lines
      .slice(Math.max(previousDate + 1, dateIndex - 2), dateIndex + 1)
      .filter((line) => !bulletPattern.test(line));
    const dateLine = lines[dateIndex]!;
    const prefix = dateLine
      .replace(dateRangePattern, '')
      .replace(/[|,;\-–—]+$/g, '')
      .trim();
    const parts = prefix ? prefix.split(/\s*(?:\||•)\s*/).filter(Boolean) : [];
    const rawDescriptors = unique([...prelude.slice(0, -1), ...parts]);
    const descriptors: string[] = [];
    let locationValue = '';
    let locationSource = '';
    for (const rawDescriptor of rawDescriptors) {
      const split = trailingLocation(rawDescriptor);
      if (split) {
        descriptors.push(split.text);
        locationValue ||= split.location;
        locationSource ||= rawDescriptor;
        continue;
      }
      if (lineLocation(rawDescriptor)) {
        locationValue ||= rawDescriptor;
        locationSource ||= rawDescriptor;
        continue;
      }
      descriptors.push(rawDescriptor);
      if (/^(remote|hybrid|onsite)$/i.test(rawDescriptor)) {
        locationValue ||= rawDescriptor;
        locationSource ||= rawDescriptor;
      }
    }
    const title = descriptors.find((line) => titlePattern.test(line));
    const employer =
      descriptors.find((line) => line !== title && companyPattern.test(line)) ??
      descriptors.findLast((line) => line !== title && !lineLocation(line));
    if (!title || !employer) continue;
    const nextDate = dateIndexes[record + 1] ?? lines.length;
    let bodyEnd = nextDate;
    if (record + 1 < dateIndexes.length) {
      const nextDateLine = lines[nextDate]!;
      const nextPrefix = nextDateLine
        .replace(dateRangePattern, '')
        .replace(/[|,;\-–—]+$/g, '')
        .trim();
      const nextParts = nextPrefix
        ? nextPrefix.split(/\s*(?:\||•)\s*/).filter(Boolean)
        : [];
      const reservedHeaderLines =
        nextParts.length >= 2 ? 0 : nextParts.length === 1 ? 1 : 2;
      bodyEnd = Math.max(dateIndex + 1, nextDate - reservedHeaderLines);
    } else {
      for (let index = dateIndex + 1; index < lines.length; index++) {
        if (looksLikeEmploymentBoundary(lines, index)) {
          bodyEnd = index;
          break;
        }
      }
    }
    const following = lines.slice(dateIndex + 1, bodyEnd);
    const bullets: string[] = [];
    for (const line of following) {
      if (bulletPattern.test(line)) {
        bullets.push(line.replace(bulletPattern, '').trim());
        continue;
      }
      if (
        !bullets.length ||
        /^\s*(?:technologies|tech|tech stack)\s*:/i.test(line)
      )
        continue;
      bullets[bullets.length - 1] += ` ${line}`;
    }
    const titleSource =
      rawDescriptors.find((line) => line.includes(title)) ?? title;
    const employerSource =
      rawDescriptors.find((line) => line.includes(employer)) ?? employer;
    const id = crypto.randomUUID();
    const technologies = unique([
      ...technologiesIn([dateLine, ...following]),
      ...[dateLine, ...following]
        .filter((line) =>
          /^\s*(?:technologies|tech|tech stack|built with)\s*:/i.test(line),
        )
        .flatMap((line) => splitItems(line.replace(/^[^:]+:/, ''))),
    ]);
    candidate.employment.push({
      id,
      employer,
      title,
      location: locationValue,
      startDate: dates.start,
      endDate: dates.end,
      currentlyEmployed: dates.current,
      responsibilities: bullets,
      accomplishments: [],
      technologies,
      skills: [],
    });
    addSuggestion(
      suggestions,
      `employment.${id}.employer`,
      0.8,
      'Employment',
      employerSource,
    );
    addSuggestion(
      suggestions,
      `employment.${id}.title`,
      0.87,
      'Employment',
      titleSource,
    );
    addSuggestion(
      suggestions,
      `employment.${id}.startDate`,
      0.95,
      'Employment',
      dateLine,
    );
    addSuggestion(
      suggestions,
      `employment.${id}.endDate`,
      0.95,
      'Employment',
      dateLine,
    );
    if (dates.current)
      addSuggestion(
        suggestions,
        `employment.${id}.currentlyEmployed`,
        0.99,
        'Employment',
        dateLine,
      );
    if (locationValue)
      addSuggestion(
        suggestions,
        `employment.${id}.location`,
        0.78,
        'Employment',
        locationSource,
      );
    if (bullets.length)
      addSuggestion(
        suggestions,
        `employment.${id}.responsibilities`,
        0.93,
        'Employment',
        following.join('\n'),
      );
    if (technologies.length)
      addSuggestion(
        suggestions,
        `employment.${id}.technologies`,
        0.86,
        'Employment',
        following.join('\n'),
      );
  }
}

function looksLikeEmploymentBoundary(lines: string[], index: number): boolean {
  const line = lines[index]!;
  if (!line || bulletPattern.test(line) || /[.;:]$/.test(line)) return false;
  const next = lines[index + 1] ?? '';
  const afterNext = lines[index + 2] ?? '';
  if (companyPattern.test(line) && titlePattern.test(next)) return true;
  if (looksLikeProjectHeader(line) && titlePattern.test(line)) return true;
  return (
    looksLikeProjectHeader(line) &&
    looksLikeProjectHeader(next) &&
    (dateRange(afterNext) !== undefined ||
      new RegExp(
        `\\b${month}\\.?\\s+\\d{4}\\b|\\b(?:19|20)\\d{2}\\b`,
        'i',
      ).test(afterNext))
  );
}

function looksLikeProjectHeader(value: string): boolean {
  const range = dateRange(value);
  const withoutDate = range ? value.replace(range.source, '') : value;
  const withoutUrls = withoutDate.replace(urlPattern, '').trim();
  const name = withoutUrls.split(/\s*(?:\||—|–)\s*/)[0]!.trim();
  if (
    !name ||
    bulletPattern.test(value) ||
    /^\s*(?:technologies|tech|built with|responsibilities|documentation)\s*:/i.test(
      value,
    ) ||
    /^(?:and|or|with|using|to|for|that|which|including)\b/i.test(name) ||
    /[.,;:]$/.test(name) ||
    name.includes(',')
  )
    return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  const significant = words.filter(
    (word) => !/^(?:a|an|and|of|for|the|to|with|&|\+)$/i.test(word),
  );
  if (!significant.length) return false;
  const titleLike = significant.filter((word) =>
    /^[\p{Lu}\d][\p{L}\d+#.'/-]*$/u.test(word),
  ).length;
  return titleLike / significant.length >= 0.7;
}

function looksLikeProjectDescriptor(value: string): boolean {
  const range = dateRange(value);
  const withoutDate = range ? value.replace(range.source, '') : value;
  const text = withoutDate
    .replace(urlPattern, '')
    .replace(/^[\s|—–-]+|[\s|—–-]+$/g, '')
    .trim();
  if (!text || bulletPattern.test(value) || /[.;:]$/.test(text)) return false;
  if (
    /\b(?:personal|team|capstone|academic|course|class|independent|open[ -]source)\s+project\b/i.test(
      text,
    )
  )
    return true;
  return (
    /\bproject$/i.test(text) &&
    /[&/]|\b(?:analysis|management|platform|application|app|system|website|full[ -]?stack|development|engineering|design)\b/i.test(
      text,
    )
  );
}

function nextNonemptyIndex(lines: string[], start: number): number | undefined {
  for (let index = start; index < lines.length; index++)
    if (lines[index]) return index;
  return undefined;
}

function projectCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
): void {
  const lines = section.lines;
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line || !looksLikeProjectHeader(line)) continue;
    const previous = [...lines.slice(0, index)].findLastIndex(Boolean);
    const next = nextNonemptyIndex(lines, index + 1);
    const afterNext =
      next === undefined ? undefined : nextNonemptyIndex(lines, next + 1);
    const third =
      afterNext === undefined
        ? undefined
        : nextNonemptyIndex(lines, afterNext + 1);
    const touchesPrevious =
      previous >= 0 && !lines.slice(previous + 1, index).some((item) => !item);
    const descriptorForPrevious =
      looksLikeProjectDescriptor(line) &&
      touchesPrevious &&
      looksLikeProjectHeader(lines[previous]!) &&
      !looksLikeProjectDescriptor(lines[previous]!);
    if (descriptorForPrevious) continue;
    const ambiguousLeadingTitle =
      next !== undefined &&
      afterNext !== undefined &&
      !lines.slice(index + 1, next).some((item) => !item) &&
      looksLikeProjectHeader(lines[next]!) &&
      !looksLikeProjectDescriptor(lines[next]!) &&
      bulletPattern.test(lines[afterNext]!) &&
      urlsIn(line).length === 0 &&
      !/\s[|—–]\s/.test(line);
    if (ambiguousLeadingTitle) continue;
    const first = starts.length === 0 && previous < 0;
    const blankBoundary =
      previous >= 0 && lines.slice(previous + 1, index).some((item) => !item);
    const adjacentBullets =
      previous >= 0 &&
      bulletPattern.test(lines[previous]!) &&
      next !== undefined &&
      bulletPattern.test(lines[next]!);
    const strongContext = urlsIn(line).length > 0 || /\s[|—–]\s/.test(line);
    const nextIsBullet = next !== undefined && bulletPattern.test(lines[next]!);
    const descriptorContext = [next, afterNext]
      .filter((value): value is number => value !== undefined)
      .some(
        (value) =>
          dateRange(lines[value]!) !== undefined ||
          looksLikeProjectDescriptor(lines[value]!),
      );
    const nearbyBullet = [next, afterNext, third]
      .filter((value): value is number => value !== undefined)
      .some((value) => bulletPattern.test(lines[value]!));
    if (
      first ||
      blankBoundary ||
      adjacentBullets ||
      nextIsBullet ||
      strongContext ||
      (descriptorContext && nearbyBullet)
    )
      starts.push(index);
  }
  const firstNonempty = nextNonemptyIndex(lines, 0);
  if (
    !starts.length &&
    firstNonempty !== undefined &&
    looksLikeProjectHeader(lines[firstNonempty]!)
  )
    starts.push(firstNonempty);
  for (let index = 0; index < starts.length; index++) {
    const block = lines.slice(
      starts[index]!,
      starts[index + 1] ?? lines.length,
    );
    const nameLine = block[0]!;
    const urls = urlsIn(block.join(' '));
    const cleanedName = nameLine
      .replace(urlPattern, '')
      .split(/\s*(?:\||—|–)\s*/)[0]!
      .trim();
    if (!cleanedName) continue;
    const id = crypto.randomUUID();
    const bullets: string[] = [];
    const responsibilitySourceLines: string[] = [];
    const descriptions: string[] = [];
    for (const line of block.slice(1)) {
      if (!line) continue;
      if (bulletPattern.test(line)) {
        bullets.push(line.replace(bulletPattern, '').trim());
        responsibilitySourceLines.push(line);
        continue;
      }
      if (
        /^\s*(?:technologies|tech|built with)\s*:/i.test(line) ||
        urlsIn(line).some((url) => line.trim() === url)
      )
        continue;
      if (bullets.length && looksLikeProjectHeader(line)) continue;
      if (bullets.length) {
        bullets[bullets.length - 1] += ` ${line}`;
        responsibilitySourceLines.push(line);
      } else descriptions.push(line);
    }
    const technologies = unique([
      ...technologiesIn(block),
      ...block
        .filter((line) =>
          /^\s*(?:technologies|tech|built with)\s*:/i.test(line),
        )
        .flatMap((line) => splitItems(line.replace(/^[^:]+:/, ''))),
    ]);
    const technologySource = block.filter(
      (line) =>
        /^\s*(?:technologies|tech|built with)\s*:/i.test(line) ||
        technologiesIn([line]).length > 0,
    );
    const githubUrl =
      urls.find((url) => /(^|\.)github\.com$/i.test(new URL(url).hostname)) ??
      '';
    const deployedUrl = urls.find((url) => url !== githubUrl) ?? '';
    candidate.projects.push({
      id,
      name: cleanedName,
      description: descriptions.join('\n'),
      technologies,
      responsibilities: bullets,
      accomplishments: [],
      githubUrl,
      deployedUrl,
    });
    addSuggestion(
      suggestions,
      `projects.${id}.name`,
      0.83,
      'Projects',
      nameLine,
    );
    if (descriptions.length)
      addSuggestion(
        suggestions,
        `projects.${id}.description`,
        0.76,
        'Projects',
        descriptions.join('\n'),
      );
    if (bullets.length)
      addSuggestion(
        suggestions,
        `projects.${id}.responsibilities`,
        0.9,
        'Projects',
        responsibilitySourceLines.join('\n'),
      );
    if (technologies.length)
      addSuggestion(
        suggestions,
        `projects.${id}.technologies`,
        0.88,
        'Projects',
        technologySource.join('\n'),
      );
    if (githubUrl)
      addSuggestion(
        suggestions,
        `projects.${id}.githubUrl`,
        0.98,
        'Projects',
        githubUrl,
      );
    if (deployedUrl)
      addSuggestion(
        suggestions,
        `projects.${id}.deployedUrl`,
        0.9,
        'Projects',
        deployedUrl,
      );
  }
}

const skillCategoryMap: Array<[RegExp, keyof ApplicantProfile['skills']]> = [
  [
    /^(languages?|programming(?: languages?)?|web|frameworks?)$/i,
    'programming',
  ],
  [/^(databases?|data)$/i, 'databases'],
  [/^(cloud|cloud \/ devops|devops|infrastructure)$/i, 'cloud'],
  [/^(security(?: \/ testing)?|cybersecurity|testing)$/i, 'cybersecurity'],
  [/^(operating systems?|os)$/i, 'operatingSystems'],
  [/^networking$/i, 'networking'],
  [/^(ai|machine learning|artificial intelligence)$/i, 'ai'],
  [/^(tools?|productivity tools?)$/i, 'productivityTools'],
  [/^(business|mis)$/i, 'businessMis'],
];
function skillCategory(
  label: string,
): keyof ApplicantProfile['skills'] | undefined {
  const normalized = label.trim().replace(/\s+/g, ' ');
  const exact = skillCategoryMap.find(([pattern]) => pattern.test(normalized));
  if (exact) return exact[1];
  if (/\b(?:cloud|devops|infrastructure)\b/i.test(normalized)) return 'cloud';
  if (/\b(?:security|cybersecurity|testing|qa)\b/i.test(normalized))
    return 'cybersecurity';
  if (/\b(?:languages?|programming|frameworks?|web)\b/i.test(normalized))
    return 'programming';
  if (/\b(?:databases?|data)\b/i.test(normalized)) return 'databases';
  if (/\b(?:operating systems?|os)\b/i.test(normalized))
    return 'operatingSystems';
  if (/\bnetworking\b/i.test(normalized)) return 'networking';
  if (/\b(?:artificial intelligence|machine learning|ai)\b/i.test(normalized))
    return 'ai';
  if (/\b(?:tools?|systems?)\b/i.test(normalized)) return 'productivityTools';
  return undefined;
}
function skillCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
): void {
  for (const line of section.lines.filter(Boolean)) {
    const labeled = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    const mapping = labeled ? skillCategory(labeled[1]!) : undefined;
    const key = mapping ?? 'other';
    const items = splitItems(labeled?.[2] ?? line.replace(bulletPattern, ''));
    if (!items.length) continue;
    candidate.skills[key] = unique([...candidate.skills[key], ...items]);
    addSuggestion(
      suggestions,
      `skills.${key}`,
      mapping ? 0.95 : 0.68,
      'Skills',
      line,
    );
  }
}
function certificationCandidates(
  candidate: ApplicantProfile,
  suggestions: ImportSuggestion[],
  section: ResumeSection,
): void {
  for (const line of section.lines.filter(Boolean)) {
    const cleaned = line.replace(bulletPattern, '').trim();
    if (!cleaned || cleaned.length > 300) continue;
    const date = cleaned.match(new RegExp(dateToken, 'i'))?.[0] ?? '';
    const withoutDate = date
      ? cleaned
          .replace(date, '')
          .replace(/[|,;\-–—]+$/g, '')
          .trim()
      : cleaned;
    const parts = withoutDate.split(/\s*(?:\||—|–|\s+-\s+)\s*/).filter(Boolean);
    const certification = parts[0]!;
    if (!certification || certification.length > 200) continue;
    const id = crypto.randomUUID();
    candidate.certifications.push({
      id,
      certification,
      organization: parts[1] ?? '',
      date,
      expiration: '',
      credentialId: '',
    });
    addSuggestion(
      suggestions,
      `certifications.${id}.certification`,
      0.94,
      'Certifications',
      line,
    );
    if (parts[1])
      addSuggestion(
        suggestions,
        `certifications.${id}.organization`,
        0.75,
        'Certifications',
        line,
      );
    if (date)
      addSuggestion(
        suggestions,
        `certifications.${id}.date`,
        0.9,
        'Certifications',
        line,
      );
  }
}

export function createImportDraft(resumeId: string, text: string): ImportDraft {
  if (text.length > 200_000)
    throw new Error('Extracted text exceeds the 200,000 character limit.');
  const candidate = emptyApplicant().profile;
  const suggestions: ImportSuggestion[] = [];
  const sections = detectSections(text);
  headerCandidates(candidate, suggestions, sections[0]!, text);
  for (const section of sections) {
    if (section.name === 'Education')
      educationCandidates(candidate, suggestions, section);
    if (section.name === 'Employment')
      employmentCandidates(candidate, suggestions, section);
    if (section.name === 'Projects')
      projectCandidates(candidate, suggestions, section);
    if (section.name === 'Skills')
      skillCandidates(candidate, suggestions, section);
    if (section.name === 'Certifications')
      certificationCandidates(candidate, suggestions, section);
  }
  return {
    id: crypto.randomUUID(),
    resumeId,
    status: 'unverified',
    text,
    createdAt: new Date().toISOString(),
    candidate,
    suggestions,
    decisions: {},
  };
}
