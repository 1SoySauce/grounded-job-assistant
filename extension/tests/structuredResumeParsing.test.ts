import { describe, expect, it } from 'vitest';
import {
  createImportDraft,
  detectSections,
} from '../src/imports/extractCandidates';
import {
  DraftSchema,
  emptyApplicant,
  findImportDuplicates,
  mergeImport,
} from '../src/types/applicant';

const id = () => crypto.randomUUID();

describe('structured resume section detection', () => {
  it.each([
    ['EDUCATION', 'Education'],
    [' professional experience: ', 'Employment'],
    ['Work Experience.', 'Employment'],
    ['Technical Skills —', 'Skills'],
    ['C E R T I F I C A T I O N S', 'Certifications'],
    ['Projects:', 'Projects'],
  ])('normalizes the heading %s', (heading, expected) => {
    expect(detectSections(`Candidate Name\n${heading}\nvalue`)[1]?.name).toBe(
      expected,
    );
  });

  it('recognizes an inline heading without losing its content', () => {
    const skills = detectSections('Skills: Languages: Python, Go')[1]!;
    expect(skills.name).toBe('Skills');
    expect(skills.lines).toEqual(['Languages: Python, Go']);
  });
});

describe('structured resume candidate parsing', () => {
  it('parses a standard contact header conservatively', () => {
    const draft = createImportDraft(
      id(),
      `Jordan Lee Rivera
Buffalo, NY, United States
(716) 555-0123
jordan@example.test
https://www.linkedin.com/in/jordan-rivera
https://github.com/jrivera
https://jordan.dev`,
    );
    expect(draft.candidate.personal).toMatchObject({
      firstName: 'Jordan',
      middleName: 'Lee',
      lastName: 'Rivera',
      city: 'Buffalo',
      state: 'NY',
      country: 'United States',
      phone: '(716) 555-0123',
      email: 'jordan@example.test',
      portfolioUrl: 'https://jordan.dev',
    });
    expect(draft.candidate.verification).toEqual({});
  });

  it('does not infer a name from an email or ambiguous prose', () => {
    const draft = createImportDraft(
      id(),
      'alex.smith@example.test\nExperienced professional helping teams deliver outcomes.',
    );
    expect(draft.candidate.personal.firstName).toBe('');
    expect(draft.candidate.personal.lastName).toBe('');
  });

  it('does not map ambiguous duplicate emails or phones', () => {
    const draft = createImportDraft(
      id(),
      'one@example.test two@example.test\n716-555-0101 716-555-0102',
    );
    expect(draft.candidate.personal.email).toBe('');
    expect(draft.candidate.personal.phone).toBe('');
  });

  it('never treats a phone or another contact token as a country', () => {
    const draft = createImportDraft(
      id(),
      `Casey Example
Albany, NY, (212) 555-0147
casey@example.test
Country: https://example.test`,
    );
    expect(draft.candidate.personal).toMatchObject({
      city: 'Albany',
      state: 'NY',
      country: '',
      phone: '(212) 555-0147',
    });
    expect(
      draft.suggestions.some(
        (suggestion) => suggestion.path === 'personal.country',
      ),
    ).toBe(false);
  });

  it('accepts only an explicit recognized country value', () => {
    const personal = createImportDraft(
      id(),
      'Casey Example\nAlbany, NY\nCountry: Canada',
    ).candidate.personal;
    expect(personal.country).toBe('Canada');
  });

  it('parses multiple education entries and preserves date precision', () => {
    const draft = createImportDraft(
      id(),
      `EDUCATION
North Lake University
Bachelor of Science in Computer Science with Concentration in Security
Buffalo, NY
Aug 2021 - May 2025
GPA: 3.82/4.0
Western Community College
Associate of Science in Information Systems
2020 - 2021`,
    );
    expect(draft.candidate.education).toHaveLength(2);
    expect(draft.candidate.education[0]).toMatchObject({
      institution: 'North Lake University',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      concentration: 'Security',
      gpa: '3.82/4.0',
      startDate: 'Aug 2021',
      graduationDate: 'May 2025',
    });
    expect(draft.candidate.education[1]).toMatchObject({
      startDate: '2020',
      graduationDate: '2021',
    });
  });

  it('preserves an expected graduation date without inventing a day', () => {
    const entry = createImportDraft(
      id(),
      'Education\nExample Institute\nMaster of Science in Data Science\nExpected graduation: Dec 2027',
    ).candidate.education[0]!;
    expect(entry.graduationDate).toBe('Dec 2027');
    expect(entry.startDate).toBe('');
  });

  it('preserves a standalone education year as the graduation date', () => {
    const entry = createImportDraft(
      id(),
      'Education\nExample Community College\nAssociate of Science, Information Technology\n2022',
    ).candidate.education[0]!;
    expect(entry.graduationDate).toBe('2022');
    expect(entry.startDate).toBe('');
  });

  it('preserves an abbreviated standalone education month and year', () => {
    const entry = createImportDraft(
      id(),
      'Education\nExample Community College\nAssociate of Science, Information Technology\nMar. 2026',
    ).candidate.education[0]!;
    expect(entry.graduationDate).toBe('Mar. 2026');
    expect(entry.startDate).toBe('');
  });

  it.each(['March 2026 project', 'Project 2026', 'Started March 2026'])(
    'does not treat "%s" as a standalone education date',
    (line) => {
      const entry = createImportDraft(
        id(),
        `Education\nExample Community College\nAssociate of Science, Information Technology\n${line}`,
      ).candidate.education[0]!;
      expect(entry.graduationDate).toBe('');
      expect(entry.startDate).toBe('');
    },
  );

  it('associates explicitly labeled education fields with their record', () => {
    const draft = createImportDraft(
      id(),
      `EDUCATION
Example State University
Bachelor of Science
Major: Business Administration
Concentration: Management Information Systems
Minor: Applied Computing
GPA: 3.75`,
    );
    expect(draft.candidate.education[0]).toMatchObject({
      major: 'Business Administration',
      concentration: 'Management Information Systems',
      minor: 'Applied Computing',
      gpa: '3.75',
    });
    const concentration = draft.suggestions.find((suggestion) =>
      suggestion.path.endsWith('.concentration'),
    );
    expect(concentration).toMatchObject({
      confidence: 'high',
      sourceText: 'Concentration: Management Information Systems',
    });
  });

  it('separates education fields without field bleeding', () => {
    const draft = createImportDraft(
      id(),
      `EDUCATION
Example University, Sample City, CA
Bachelor of Science, Example Major May 2026
Concentration: Information Systems | GPA: 3.4`,
    );
    expect(draft.candidate.education[0]).toMatchObject({
      institution: 'Example University',
      location: 'Sample City, CA',
      degree: 'Bachelor of Science, Example Major',
      concentration: 'Information Systems',
      gpa: '3.4',
      graduationDate: 'May 2026',
    });
    const sources = Object.fromEntries(
      draft.suggestions
        .filter((suggestion) => suggestion.path.startsWith('education.'))
        .map((suggestion) => [
          suggestion.path.split('.').at(-1),
          suggestion.sourceText,
        ]),
    );
    expect(sources).toMatchObject({
      institution: 'Example University, Sample City, CA',
      location: 'Example University, Sample City, CA',
      degree: 'Bachelor of Science, Example Major May 2026',
      graduationDate: 'Bachelor of Science, Example Major May 2026',
      concentration: 'Concentration: Information Systems | GPA: 3.4',
      gpa: 'Concentration: Information Systems | GPA: 3.4',
    });
  });

  it('leaves ambiguous education suffixes unsplit', () => {
    const education = createImportDraft(
      id(),
      `EDUCATION
Example University, Research Division
Bachelor of Science, Model 2200`,
    ).candidate.education[0]!;
    expect(education.institution).toBe('Example University, Research Division');
    expect(education.location).toBe('');
    expect(education.degree).toBe('Bachelor of Science, Model 2200');
    expect(education.graduationDate).toBe('');
  });

  it('parses multiple jobs, Present, bullets, location, and mentioned technologies', () => {
    const jobs = createImportDraft(
      id(),
      `WORK EXPERIENCE
Example Systems LLC
Software Engineer | Buffalo, NY | Jan 2023 - Present
• Built TypeScript and React services on AWS.
• Improved PostgreSQL query performance.
Northwind Group
IT Support Specialist | Remote | 2021 - 2022
- Supported Windows and Linux endpoints.`,
    ).candidate.employment;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      employer: 'Example Systems LLC',
      title: 'Software Engineer',
      startDate: 'Jan 2023',
      endDate: 'Present',
      currentlyEmployed: true,
      location: 'Buffalo, NY',
    });
    expect(jobs[0]!.responsibilities).toHaveLength(2);
    expect(jobs[0]!.technologies).toEqual(
      expect.arrayContaining(['TypeScript', 'React', 'AWS', 'PostgreSQL']),
    );
    expect(jobs[1]).toMatchObject({
      startDate: '2021',
      endDate: '2022',
      currentlyEmployed: false,
    });
  });

  it('preserves partial month ranges', () => {
    const job = createImportDraft(
      id(),
      'EMPLOYMENT\nExample Company\nEngineering Intern | Oct - Nov 2025\n• Tested APIs.',
    ).candidate.employment[0]!;
    expect(job.startDate).toBe('Oct');
    expect(job.endDate).toBe('Nov 2025');
  });

  it('recognizes Current without changing the source value', () => {
    const job = createImportDraft(
      id(),
      'Experience\nNorthwind Company\nSystems Analyst | 2024 - Current',
    ).candidate.employment[0]!;
    expect(job.endDate).toBe('Current');
    expect(job.currentlyEmployed).toBe(true);
  });

  it('separates a US city/state appended to a job title', () => {
    const job = createImportDraft(
      id(),
      `EXPERIENCE
Example Innovation Lab
Automation Engineering Intern Buffalo, NY
Jan 2025 - Present`,
    ).candidate.employment[0]!;
    expect(job).toMatchObject({
      employer: 'Example Innovation Lab',
      title: 'Automation Engineering Intern',
      location: 'Buffalo, NY',
    });
  });

  it('separates a US city/state appended to a company', () => {
    const job = createImportDraft(
      id(),
      `WORK EXPERIENCE
Platform Engineer
Northwind Company Rochester, NY
2022 - 2024`,
    ).candidate.employment[0]!;
    expect(job).toMatchObject({
      employer: 'Northwind Company',
      title: 'Platform Engineer',
      location: 'Rochester, NY',
    });
  });

  it('does not split an ambiguous unlabeled title suffix', () => {
    const job = createImportDraft(
      id(),
      `EMPLOYMENT
Example Company
Operations Intern New Markets
2024 - 2025`,
    ).candidate.employment[0]!;
    expect(job.title).toBe('Operations Intern New Markets');
    expect(job.location).toBe('');
  });

  it('keeps wrapped responsibilities out of the next employment record header', () => {
    const jobs = createImportDraft(
      id(),
      `EXPERIENCE
Example Systems Company
Software Engineer | Jan 2022 - Feb 2024
• Built reliable services
with monitored retry handling.
Northwind Company
Systems Analyst | Mar 2024 - Present
• Supported internal platforms.`,
    ).candidate.employment;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.responsibilities).toEqual([
      'Built reliable services with monitored retry handling.',
    ]);
    expect(jobs[0]!.responsibilities.join(' ')).not.toContain('Northwind');
    expect(jobs[1]).toMatchObject({
      employer: 'Northwind Company',
      title: 'Systems Analyst',
      startDate: 'Mar 2024',
      endDate: 'Present',
    });
  });

  it('does not attach an uncertain next employment header to prior responsibilities', () => {
    const jobs = createImportDraft(
      id(),
      `EMPLOYMENT
Example Company
Support Specialist | Jan 2023 - Dec 2024
• Resolved service requests
with documented escalation steps.
Orchard Labs
Product Owner
Spring 2025 - ongoing`,
    ).candidate.employment;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.responsibilities).toEqual([
      'Resolved service requests with documented escalation steps.',
    ]);
    expect(jobs[0]!.responsibilities.join(' ')).not.toContain('Orchard');
    expect(jobs[0]!.responsibilities.join(' ')).not.toContain('Product Owner');
  });

  it('parses categorized skills and normalizes separators only', () => {
    const skills = createImportDraft(
      id(),
      `Technical Skills:
Languages: Python, TypeScript | Go
Databases: PostgreSQL; Redis
Cloud / DevOps: AWS, Docker
Security / Testing: Jest, Burp Suite
Operating Systems: Linux, Windows
Networking: TCP/IP
AI: PyTorch
Tools: Git, Jira`,
    ).candidate.skills;
    expect(skills.programming).toEqual(['Python', 'TypeScript', 'Go']);
    expect(skills.databases).toEqual(['PostgreSQL', 'Redis']);
    expect(skills.cloud).toEqual(['AWS', 'Docker']);
    expect(skills.cybersecurity).toEqual(['Jest', 'Burp Suite']);
    expect(skills.other).toEqual([]);
  });

  it('maps meaningful composite skill labels without inventing skills', () => {
    const skills = createImportDraft(
      id(),
      `SKILLS
Data / Cloud / DevOps: Snowflake, AWS, Terraform
Languages / Programming: Python, Go
Security / Testing: Burp Suite, Vitest
Systems / Tools: ServiceNow, Git`,
    ).candidate.skills;
    expect(skills.cloud).toEqual(['Snowflake', 'AWS', 'Terraform']);
    expect(skills.programming).toEqual(['Python', 'Go']);
    expect(skills.cybersecurity).toEqual(['Burp Suite', 'Vitest']);
    expect(skills.productivityTools).toEqual(['ServiceNow', 'Git']);
    expect(skills.other).toEqual([]);
  });

  it('parses projects only when a clear Projects section exists', () => {
    const draft = createImportDraft(
      id(),
      `PROJECTS
Transit Dashboard | https://github.com/example/transit
• Built an accessible React dashboard.
Technologies: React, TypeScript
https://transit.example.test`,
    );
    expect(draft.candidate.projects[0]).toMatchObject({
      name: 'Transit Dashboard',
      githubUrl: 'https://github.com/example/transit',
      deployedUrl: 'https://transit.example.test',
    });
    expect(draft.candidate.projects[0]!.technologies).toEqual(
      expect.arrayContaining(['React', 'TypeScript']),
    );
    expect(
      createImportDraft(id(), 'Built a project called Transit Dashboard.')
        .candidate.projects,
    ).toEqual([]);
  });

  it('keeps wrapped PDF bullet continuations in one project', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Support Operations Portal | TypeScript, Docker
• Built a local service layer
and Docker-based development environment.
• Added protected ticket workflows,
comments, queue management, and
escalation safeguards.
Documentation and responsibility continuation lines

Network Health Monitor
• Created availability checks
with alert summaries and retry handling.`,
    ).candidate.projects;
    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.name)).toEqual([
      'Support Operations Portal',
      'Network Health Monitor',
    ]);
    expect(projects[0]!.responsibilities).toEqual([
      'Built a local service layer and Docker-based development environment.',
      'Added protected ticket workflows, comments, queue management, and escalation safeguards. Documentation and responsibility continuation lines',
    ]);
    expect(projects[1]!.responsibilities).toEqual([
      'Created availability checks with alert summaries and retry handling.',
    ]);
  });

  it('recognizes consecutive strong project headers without promoting sentence fragments', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Inventory Dashboard
• Built reporting views.
API Status Console
• Added health checks.
and retry safeguards.`,
    ).candidate.projects;
    expect(projects.map((project) => project.name)).toEqual([
      'Inventory Dashboard',
      'API Status Console',
    ]);
    expect(projects[1]!.responsibilities).toEqual([
      'Added health checks. and retry safeguards.',
    ]);
  });

  it('separates three genuine URL-free projects', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Inventory Dashboard
• Built inventory reporting.
Service Health Console
• Added availability checks.
Access Review Toolkit
• Created permission reports.`,
    ).candidate.projects;
    expect(projects.map((project) => project.name)).toEqual([
      'Inventory Dashboard',
      'Service Health Console',
      'Access Review Toolkit',
    ]);
  });

  it('uses project descriptor and date context without creating a descriptor project', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Campus Scheduling Portal
Capstone Project | Jan 2025 - May 2025
• Built scheduling workflows.
Volunteer Coordination App
Team Project | 2024 - 2025
• Added volunteer assignment tools.`,
    ).candidate.projects;
    expect(projects.map((project) => project.name)).toEqual([
      'Campus Scheduling Portal',
      'Volunteer Coordination App',
    ]);
    expect(projects[0]!.description).toContain('Capstone Project');
    expect(projects[1]!.description).toContain('Team Project');
  });

  it('keeps standalone project month/year and year-only lines as context', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Help Desk Test Project
March 2026
- Built a ticket-tracking test application.
Cloud Lab Project
2025
- Configured virtual machines and Docker containers.`,
    ).candidate.projects;
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      name: 'Help Desk Test Project',
      description: 'March 2026',
      responsibilities: ['Built a ticket-tracking test application.'],
    });
    expect(projects[1]).toMatchObject({
      name: 'Cloud Lab Project',
      description: '2025',
      responsibilities: ['Configured virtual machines and Docker containers.'],
    });
  });

  it('omits an uncertain header-like line instead of merging it into a bullet', () => {
    const projects = createImportDraft(
      id(),
      `PROJECTS
Reporting Workspace
• Built export workflows.
Operational Notes
continuation text remains descriptive.`,
    ).candidate.projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]!.responsibilities).toEqual([
      'Built export workflows. continuation text remains descriptive.',
    ]);
    expect(projects[0]!.responsibilities.join(' ')).not.toContain(
      'Operational Notes',
    );
  });

  describe('project title and descriptor pairing', () => {
    it('pairs a title with a personal-project descriptor', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Service Desk Console
Full-Stack Service Platform - Personal Project
- Built guarded request workflows.`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'Service Desk Console',
        description: 'Full-Stack Service Platform - Personal Project',
        responsibilities: ['Built guarded request workflows.'],
      });
    });

    it('keeps two title, descriptor, and bullet groups separate', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Queue Review Workspace
Full-Stack Operations Platform - Team Project
- Added queue filters.
Resource Planning Console
Systems Analysis & Project Management Project
- Modeled staffing scenarios.`,
      ).candidate.projects;
      expect(projects.map(({ name }) => name)).toEqual([
        'Queue Review Workspace',
        'Resource Planning Console',
      ]);
      expect(projects.map(({ description }) => description)).toEqual([
        'Full-Stack Operations Platform - Team Project',
        'Systems Analysis & Project Management Project',
      ]);
    });

    it('preserves a month and year attached to the project title', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Release Tracker March 2026
Academic Project
- Built release summaries.`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Release Tracker March 2026');
      expect(projects[0]!.description).toBe('Academic Project');
    });

    it('pairs a dated descriptor without promoting it to a project', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Campus Route Planner
Capstone Project | January 2025 - May 2025
- Designed route comparison tools.`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'Campus Route Planner',
        description: 'Capstone Project | January 2025 - May 2025',
      });
    });

    it('handles mixed projects with and without descriptor lines', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Audit Review Portal
Independent Project
- Built audit views.
Availability Monitor
- Added retry alerts.
Capacity Forecast Tool
Systems Analysis & Management Project
- Produced capacity forecasts.`,
      ).candidate.projects;
      expect(projects.map(({ name }) => name)).toEqual([
        'Audit Review Portal',
        'Availability Monitor',
        'Capacity Forecast Tool',
      ]);
      expect(projects.map(({ description }) => description)).toEqual([
        'Independent Project',
        '',
        'Systems Analysis & Management Project',
      ]);
    });

    it('retains URLs while pairing an adjacent descriptor', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Incident Review Board | https://github.com/example/incident-board
Open Source Project
- Added incident timelines.
https://incident-board.example.test`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'Incident Review Board',
        description: 'Open Source Project',
        githubUrl: 'https://github.com/example/incident-board',
        deployedUrl: 'https://incident-board.example.test',
      });
    });

    it('keeps field provenance tied to the lines that produced each value', () => {
      const draft = createImportDraft(
        id(),
        `PROJECTS
Permission Review Console
Security Engineering Project
- Built approval safeguards.
Technologies: TypeScript, PostgreSQL
https://reviews.example.test`,
      );
      const project = draft.candidate.projects[0]!;
      const sources = Object.fromEntries(
        draft.suggestions
          .filter(({ path }) => path.startsWith(`projects.${project.id}.`))
          .map(({ path, sourceText }) => [path.split('.').at(-1), sourceText]),
      );
      expect(sources).toMatchObject({
        name: 'Permission Review Console',
        description: 'Security Engineering Project',
        responsibilities: '- Built approval safeguards.',
        technologies: 'Technologies: TypeScript, PostgreSQL',
        deployedUrl: 'https://reviews.example.test',
      });
    });

    it('keeps wrapped responsibility text in its original project', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Deployment Readiness Tool
Development Team Project
- Built preflight checks
with retry safeguards and clear failure summaries.`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.responsibilities).toEqual([
        'Built preflight checks with retry safeguards and clear failure summaries.',
      ]);
    });

    it('does not promote sentence fragments or technology lines to projects', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Search Quality Dashboard
Web Application Project
- Measured search quality
using representative queries and review notes.
Technologies: React, TypeScript`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Search Quality Dashboard');
      expect(projects[0]!.responsibilities).toEqual([
        'Measured search quality using representative queries and review notes.',
      ]);
    });

    it('omits the contentless side of an ambiguous adjacent-title pair', () => {
      const projects = createImportDraft(
        id(),
        `PROJECTS
Operations Workspace
Status Dashboard
- Added service health views.`,
      ).candidate.projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Status Dashboard');
      expect(projects[0]!.responsibilities).toEqual([
        'Added service health views.',
      ]);
    });
  });

  it('parses only explicit certification-section entries', () => {
    const certifications = createImportDraft(
      id(),
      `SKILLS
Cloud: AWS
CERTIFICATES
AWS Certified Cloud Practitioner | Amazon Web Services | 2025
CompTIA Security+ - CompTIA`,
    ).candidate.certifications;
    expect(certifications).toHaveLength(2);
    expect(certifications[0]).toMatchObject({
      certification: 'AWS Certified Cloud Practitioner',
      organization: 'Amazon Web Services',
      date: '2025',
    });
  });

  it('handles missing sections and malformed extraction text without inventing records', () => {
    const draft = createImportDraft(
      id(),
      '\u0000\u0000 SUMMARY --- words words\n???\n2025',
    );
    expect(draft.candidate.education).toEqual([]);
    expect(draft.candidate.employment).toEqual([]);
    expect(draft.candidate.projects).toEqual([]);
    expect(draft.candidate.certifications).toEqual([]);
  });

  it('assigns confidence and traceable source text to every mapped suggestion', () => {
    const draft = createImportDraft(
      id(),
      'Morgan Chen\nmorgan@example.test\nSKILLS\nLanguages: Python',
    );
    expect(draft.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of draft.suggestions) {
      expect(['high', 'medium', 'low']).toContain(suggestion.confidence);
      expect(suggestion.score).toBeGreaterThanOrEqual(0);
      expect(suggestion.score).toBeLessThanOrEqual(1);
      expect(suggestion.sourceSection).toBeTruthy();
      expect(suggestion.sourceText).toBeTruthy();
    }
  });

  it('keeps older unverified drafts readable with safe review defaults', () => {
    const draft = createImportDraft(id(), 'Taylor Example');
    const legacyDraft: Partial<typeof draft> = { ...draft };
    delete legacyDraft.suggestions;
    delete legacyDraft.decisions;
    expect(DraftSchema.parse(legacyDraft)).toMatchObject({
      suggestions: [],
      decisions: {},
    });
  });
});

describe('structured import duplicate handling', () => {
  it('detects and skips exact history duplicates', () => {
    const current = emptyApplicant().profile;
    current.education.push({
      id: id(),
      institution: 'North Lake University',
      degree: 'BS',
      major: '',
      concentration: '',
      minor: '',
      gpa: '',
      startDate: '',
      graduationDate: '2025',
      location: '',
    });
    const candidate = structuredClone(current);
    candidate.education[0]!.id = id();
    const duplicates = findImportDuplicates(current, candidate);
    expect(duplicates[0]?.kind).toBe('exact');
    expect(mergeImport(current, candidate).education).toHaveLength(1);
  });

  it('requires approval to append a possible duplicate and never merges it', () => {
    const current = emptyApplicant().profile;
    current.employment.push({
      id: id(),
      employer: 'Example Systems',
      title: 'Engineer',
      location: '',
      startDate: '2024',
      endDate: 'Current',
      currentlyEmployed: true,
      responsibilities: [],
      accomplishments: [],
      technologies: [],
      skills: [],
    });
    const candidate = emptyApplicant().profile;
    candidate.employment.push({
      ...current.employment[0]!,
      id: id(),
      title: 'Senior Engineer',
    });
    expect(findImportDuplicates(current, candidate)[0]?.kind).toBe('possible');
    expect(mergeImport(current, candidate).employment).toHaveLength(1);
    const merged = mergeImport(current, candidate, {
      [`employment.${candidate.employment[0]!.id}`]: 'approve_separate',
    });
    expect(merged.employment).toHaveLength(2);
    expect(merged.employment[0]!.title).toBe('Engineer');
    expect(merged.employment[1]!.title).toBe('Senior Engineer');
  });
});
