export function labelFor(key: string): string {
  const labels: Record<string, string> = {
    zip: 'ZIP / postal code',
    gpa: 'GPA',
    githubUrl: 'GitHub URL',
    linkedinUrl: 'LinkedIn URL',
    portfolioUrl: 'Portfolio URL',
    businessMis: 'Business / MIS',
    ai: 'AI',
    autoConsiderScore: 'Future consideration threshold',
    roleTypes: 'Role types',
    currentlyEmployed: 'Currently employed',
    credentialId: 'Credential ID',
  };
  return (
    labels[key] ??
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())
  );
}
export function cleanLists<T>(input: T): T {
  if (Array.isArray(input))
    return input
      .filter((item) => typeof item !== 'string' || item.trim() !== '')
      .map(cleanLists) as T;
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, cleanLists(value)]),
    ) as T;
  return input;
}
