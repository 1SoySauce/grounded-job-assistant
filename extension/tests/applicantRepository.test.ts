import { beforeEach, describe, expect, it } from 'vitest';
import { storageHarness } from './storageHarness';
import {
  APPLICANT_KEY,
  confirmImport,
  discardImport,
  getApplicant,
  migrateLegacy,
  saveAnswers,
  saveImport,
  savePreferences,
  saveVerifiedProfile,
} from '../src/storage/applicantRepository';
import { createEmptyProfile } from '../src/types/profile';
import {
  contactValuesEquivalent,
  emptyApplicant,
  facts,
  initializeImportDecisions,
} from '../src/types/applicant';
import { createImportDraft } from '../src/imports/extractCandidates';
import { getOrCreateProfile } from '../src/storage/profileRepository';

let storage: ReturnType<typeof storageHarness>;
beforeEach(() => {
  storage = storageHarness();
});
describe('versioned applicant storage', () => {
  it('initializes a separated v2 record and restricts access before reading', async () => {
    const data = await getApplicant();
    expect(data.schemaVersion).toBe(2);
    expect(data.profile).not.toHaveProperty('answerLibrary');
    expect(data.profile).not.toHaveProperty('preferences');
    expect(storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
    expect(
      storage.local.setAccessLevel.mock.invocationCallOrder[0],
    ).toBeLessThan(storage.local.get.mock.invocationCallOrder[0]!);
    expect((await getOrCreateProfile()).schemaVersion).toBe(1);
  });
  it('migrates all legacy fields and provenance while retaining the exact original', async () => {
    const profile = createEmptyProfile();
    profile.personal.firstName = 'Original';
    profile.skills.cloud = ['Azure'];
    profile.education = [
      {
        id: 'school',
        institution: 'College',
        degree: 'BS',
        major: 'MIS',
        concentration: '',
        minor: '',
        gpa: '',
        startDate: '2020',
        graduationDate: '2024',
        location: 'NY',
      },
    ];
    profile.verification['education[0].institution'] = {
      status: 'verified',
      source: 'manual',
      sourceLabel: 'Original',
      reviewedAt: profile.createdAt,
    };
    profile.preferences.desiredTitles = ['Support'];
    profile.answerLibrary = [
      {
        id: 'answer',
        question: 'Relocate?',
        normalizedQuestion: 'relocate?',
        value: false,
        mode: 'verified_factual',
        updatedAt: profile.updatedAt,
      },
    ];
    const raw = {
      schemaVersion: 1,
      updatedAt: profile.updatedAt,
      value: profile,
    };
    storage = storageHarness({ 'gja.profile.v1': raw });
    const data = await getApplicant();
    expect(data.profile.personal).toEqual(profile.personal);
    expect(data.profile.education).toEqual(profile.education);
    expect(data.profile.skills).toEqual(profile.skills);
    expect(data.answers).toEqual(profile.answerLibrary);
    expect(data.preferences).toEqual(profile.preferences);
    expect(
      data.profile.verification['education.school.institution']?.status,
    ).toBe('verified');
    expect(storage.records['gja.profile.v1']).toEqual(raw);
    const writes = storage.local.set.mock.calls.length;
    expect(await getApplicant()).toEqual(data);
    expect(storage.local.set).toHaveBeenCalledTimes(writes);
  });
  it.each([
    null,
    {},
    { schemaVersion: 99 },
    { schemaVersion: 1, value: { personal: 'broken' } },
  ])('preserves malformed legacy data: %j', async (raw) => {
    storage = storageHarness({ 'gja.profile.v1': raw });
    await expect(getApplicant()).rejects.toThrow(/preserved/);
    expect(storage.records['gja.profile.v1']).toEqual(raw);
    expect(storage.local.set).not.toHaveBeenCalled();
  });
  it('rejects unknown nested fields without stripping them', async () => {
    const data = emptyApplicant();
    const raw = {
      ...data,
      profile: {
        ...data.profile,
        personal: { ...data.profile.personal, unknownFutureField: 'keep me' },
      },
    };
    storage = storageHarness({ [APPLICANT_KEY]: raw });
    await expect(getApplicant()).rejects.toThrow(/unsupported fields/);
    expect(storage.records[APPLICANT_KEY]).toEqual(raw);
  });
  it('never falls back to v1 when v2 is damaged', async () => {
    const legacy = createEmptyProfile();
    storage = storageHarness({
      [APPLICANT_KEY]: { broken: true },
      'gja.profile.v1': {
        schemaVersion: 1,
        updatedAt: legacy.updatedAt,
        value: legacy,
      },
    });
    await expect(getApplicant()).rejects.toThrow(/invalid/);
    expect(storage.local.set).not.toHaveBeenCalled();
  });
  it('preserves source data if migration storage fails', async () => {
    const profile = createEmptyProfile();
    const legacy = {
      schemaVersion: 1,
      updatedAt: profile.updatedAt,
      value: profile,
    };
    storage = storageHarness({ 'gja.profile.v1': legacy });
    storage.local.set.mockRejectedValueOnce(new Error('quota'));
    await expect(getApplicant()).rejects.toThrow('quota');
    expect(storage.records).toEqual({ 'gja.profile.v1': legacy });
    expect(migrateLegacy(legacy).revision).toBe(0);
  });
  it('rejects stale concurrent writes rather than losing the other tab edits', async () => {
    const initial = await getApplicant();
    const first = structuredClone(initial.profile);
    first.personal.firstName = 'First';
    const second = structuredClone(initial.profile);
    second.personal.firstName = 'Second';
    const results = await Promise.allSettled([
      saveVerifiedProfile(first, initial.revision, true),
      saveVerifiedProfile(second, initial.revision, true),
    ]);
    expect(results.map((item) => item.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect((await getApplicant()).profile.personal.firstName).toBe('First');
  });
});
describe('profile CRUD and review', () => {
  it('requires confirmation, verifies exact facts, and removes deleted verification', async () => {
    const data = await getApplicant();
    data.profile.personal.firstName = 'Taylor';
    await expect(
      saveVerifiedProfile(data.profile, data.revision, false),
    ).rejects.toThrow(/confirm/);
    let saved = await saveVerifiedProfile(data.profile, data.revision, true);
    expect(saved.profile.verification['personal.firstName']?.status).toBe(
      'verified',
    );
    expect(saved.profile.verification['personal.email']).toBeUndefined();
    saved.profile.personal.firstName = '';
    saved = await saveVerifiedProfile(saved.profile, saved.revision, true);
    expect(saved.profile.verification['personal.firstName']).toBeUndefined();
  });
  it('supports create, update, read and delete of every history section', async () => {
    let data = await getApplicant();
    data.profile.education = [
      {
        id: 'edu',
        institution: 'College',
        degree: '',
        major: '',
        concentration: '',
        minor: '',
        gpa: '',
        startDate: '2020',
        graduationDate: '',
        location: '',
      },
    ];
    data.profile.employment = [
      {
        id: 'job',
        employer: 'Employer',
        title: 'Support',
        location: '',
        startDate: '2024',
        endDate: '',
        currentlyEmployed: true,
        responsibilities: ['Support users'],
        accomplishments: [],
        technologies: ['Linux'],
        skills: [],
      },
    ];
    data.profile.projects = [
      {
        id: 'project',
        name: 'Lab',
        description: 'Local lab',
        technologies: ['Docker'],
        responsibilities: [],
        accomplishments: [],
        githubUrl: '',
        deployedUrl: '',
      },
    ];
    data.profile.certifications = [
      {
        id: 'cert',
        certification: 'Credential',
        organization: 'Issuer',
        date: '2024',
        expiration: '',
        credentialId: '123',
      },
    ];
    data.profile.skills.databases = ['PostgreSQL'];
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    expect((await getApplicant()).profile).toEqual(data.profile);
    expect(Object.keys(data.profile.verification)).toEqual(
      Object.keys(facts(data.profile)),
    );
    data.profile.education[0]!.major = 'MIS';
    data.profile.employment[0]!.title = 'Analyst';
    data.profile.projects[0]!.name = 'Updated lab';
    data.profile.certifications[0]!.expiration = '2027';
    data.profile.skills.databases = ['SQLite'];
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    expect(data.profile.education[0]!.major).toBe('MIS');
    expect(data.profile.employment[0]!.title).toBe('Analyst');
    expect(data.profile.projects[0]!.name).toBe('Updated lab');
    expect(data.profile.certifications[0]!.expiration).toBe('2027');
    data.profile.education = [];
    data.profile.employment = [];
    data.profile.projects = [];
    data.profile.certifications = [];
    data.profile.skills.databases = [];
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    expect(data.profile.verification).toEqual({});
  });
  it.each(['invalid-email', 'https://example.com'])(
    'rejects invalid email %s',
    async (email) => {
      const data = await getApplicant();
      data.profile.personal.email = email;
      await expect(
        saveVerifiedProfile(data.profile, data.revision, true),
      ).rejects.toThrow(/email/);
      expect((await getApplicant()).profile.personal.email).toBe('');
    },
  );
  it('rejects invalid URLs without changing stored data', async () => {
    const data = await getApplicant();
    data.profile.personal.githubUrl = 'not a URL';
    await expect(
      saveVerifiedProfile(data.profile, data.revision, true),
    ).rejects.toThrow();
    expect((await getApplicant()).revision).toBe(0);
  });
});
describe('answers and preferences', () => {
  it.each([
    'verified_factual',
    'reusable_custom',
    'ai_generated_allowed',
    'always_ask',
  ] as const)('supports %s answers without generating data', async (mode) => {
    let data = await getApplicant();
    data = await saveAnswers(
      [
        {
          id: 'one',
          question: ' A question? ',
          normalizedQuestion: '',
          mode,
          value: 'Explicit answer',
          updatedAt: data.profile.updatedAt,
        },
      ],
      data.revision,
      true,
    );
    expect(data.answers[0]!.normalizedQuestion).toBe('a question?');
    expect(data.answers[0]!.value).toBe(
      ['always_ask', 'ai_generated_allowed'].includes(mode)
        ? undefined
        : 'Explicit answer',
    );
    expect(data.profile.verification).toEqual({});
    data = await saveAnswers([], data.revision, true);
    expect(data.answers).toEqual([]);
  });
  it('blocks demographic generation and blank factual answers', async () => {
    const data = await getApplicant();
    const answer = {
      id: 'a',
      question: 'Gender?',
      normalizedQuestion: '',
      mode: 'ai_generated_allowed' as const,
      sensitiveCategory: 'gender' as const,
      updatedAt: data.profile.updatedAt,
    };
    await expect(saveAnswers([answer], 0, true)).rejects.toThrow(/demographic/);
    await expect(
      saveAnswers(
        [{ ...answer, mode: 'verified_factual', value: '' }],
        0,
        true,
      ),
    ).rejects.toThrow(/explicit value/);
    await expect(saveAnswers([], 0, false)).rejects.toThrow(/Confirm/);
    expect((await getApplicant()).revision).toBe(0);
  });
  it('preserves explicit boolean demographic choices and rejects duplicate questions', async () => {
    const data = await getApplicant();
    const answer = {
      id: 'a',
      question: 'Veteran?',
      normalizedQuestion: '',
      mode: 'verified_factual' as const,
      sensitiveCategory: 'veteran_status' as const,
      value: false,
      updatedAt: data.profile.updatedAt,
    };
    const saved = await saveAnswers([answer], 0, true);
    expect(saved.answers[0]!.value).toBe(false);
    await expect(
      saveAnswers([answer, { ...answer, id: 'b' }], saved.revision, true),
    ).rejects.toThrow(/unique/);
  });
  it('persists preferences separately, checks salary bounds, and clears optional values', async () => {
    let data = await getApplicant();
    data.preferences = {
      ...data.preferences,
      desiredTitles: ['Analyst'],
      excludedTitles: ['Director'],
      desiredLocations: ['NY'],
      workplacePreferences: ['remote', 'hybrid'],
      minimumSalary: 50000,
      desiredSalary: 60000,
      employmentTypes: ['permanent'],
      industries: ['Technology'],
      excludedCompanies: ['Example'],
    };
    data = await savePreferences(data.preferences, data.revision);
    expect((await getApplicant()).preferences).toEqual(data.preferences);
    expect(data.profile).not.toHaveProperty('preferences');
    await expect(
      savePreferences({ ...data.preferences, desiredSalary: 1 }, data.revision),
    ).rejects.toThrow(/salary/);
    await expect(
      savePreferences(
        { ...data.preferences, minimumSalary: -1 },
        data.revision,
      ),
    ).rejects.toThrow();
    data = await savePreferences(
      { ...data.preferences, minimumSalary: null, desiredSalary: null },
      data.revision,
    );
    expect(data.preferences.minimumSalary).toBeNull();
  });
});
describe('unverified imports', () => {
  it('loads an existing draft without stored decisions using safe defaults', async () => {
    const original = emptyApplicant();
    const draft = createImportDraft(crypto.randomUUID(), 'legacy@example.test');
    const legacyDraft = { ...draft } as Partial<typeof draft>;
    delete legacyDraft.decisions;
    original.imports = [legacyDraft as typeof draft];
    storage = storageHarness({ [APPLICANT_KEY]: original });
    const loaded = await getApplicant();
    expect(loaded.imports[0]!.decisions).toEqual({});
    expect(
      initializeImportDecisions(
        loaded.profile,
        loaded.imports[0]!.candidate,
        loaded.imports[0]!.decisions,
      )['personal.email'],
    ).toBe('include');
  });
  it('suggests a standalone name and exact contact data without verifying it', () => {
    const draft = createImportDraft(
      crypto.randomUUID(),
      'Taylor Example\ntaylor@example.com\nhttps://github.com/example\nEngineer since 2019',
    );
    expect(draft.candidate.personal.email).toBe('taylor@example.com');
    expect(draft.candidate.personal.firstName).toBe('Taylor');
    expect(draft.candidate.personal.lastName).toBe('Example');
    expect(draft.candidate.employment).toEqual([]);
    expect(draft.candidate.verification).toEqual({});
    expect(draft.suggestions.every((item) => item.sourceText)).toBe(true);
    expect(
      createImportDraft(crypto.randomUUID(), 'a@example.com b@example.com')
        .candidate.personal.email,
    ).toBe('');
  });
  it('persists draft edits without changing verified data; explicit confirmation applies only selected facts', async () => {
    let data = await getApplicant();
    data.profile.personal.firstName = 'Existing';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), 'new@example.com');
    draft.candidate.verification['personal.email'] = {
      status: 'verified',
      source: 'manual',
      sourceLabel: 'forged',
    };
    data = await saveImport(draft, data.revision);
    expect(data.imports[0]!.candidate.verification).toEqual({});
    expect(data.profile.personal.email).toBe('');
    await expect(confirmImport(draft, data.revision, false)).rejects.toThrow(
      /confirmation/,
    );
    const saved = await confirmImport(draft, data.revision, true);
    expect(saved.profile.personal.firstName).toBe('Existing');
    expect(saved.profile.personal.email).toBe('new@example.com');
    expect(saved.profile.verification['personal.email']!.source).toBe(
      'resume_import',
    );
    expect(saved.imports).toEqual([]);
    await expect(confirmImport(draft, saved.revision, true)).rejects.toThrow(
      /no longer/,
    );
  });
  it('keeps a saved conflict by default and replaces only when selected', async () => {
    let data = await getApplicant();
    data.profile.personal.email = 'old@example.com';
    data = await saveVerifiedProfile(data.profile, 0, true);
    const draft = createImportDraft(crypto.randomUUID(), 'new@example.com');
    data = await saveImport(draft, data.revision);
    draft.decisions = initializeImportDecisions(data.profile, draft.candidate);
    expect(draft.decisions['personal.email']).toBe('keep_saved');
    data = await confirmImport(draft, data.revision, true);
    expect(data.profile.personal.email).toBe('old@example.com');

    const replacement = createImportDraft(
      crypto.randomUUID(),
      'new@example.com',
    );
    replacement.decisions['personal.email'] = 'use_proposed';
    data = await saveImport(replacement, data.revision);
    data = await confirmImport(replacement, data.revision, true);
    expect(data.profile.personal.email).toBe('new@example.com');
  });
  it('does not flag formatting-only phone, state, or email differences as conflicts', async () => {
    let data = await getApplicant();
    data.profile.personal.phone = '(555) 123-4567';
    data.profile.personal.state = 'New York';
    data.profile.personal.email = 'Person@Example.com';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.phone = '555-123-4567';
    draft.candidate.personal.state = 'NY';
    draft.candidate.personal.email = 'person@example.com';
    data = await saveImport(draft, data.revision);
    data = await confirmImport(draft, data.revision, true);
    expect(data.profile.personal).toMatchObject({
      phone: '(555) 123-4567',
      state: 'New York',
      email: 'Person@Example.com',
    });
  });
  it('keeps genuinely different contact values in the explicit conflict flow', () => {
    expect(
      contactValuesEquivalent('phone', '555-123-4567', '555-987-6543'),
    ).toBe(false);
    expect(contactValuesEquivalent('state', 'New York', 'New Jersey')).toBe(
      false,
    );
    expect(
      contactValuesEquivalent(
        'email',
        'person@example.com',
        'different@example.com',
      ),
    ).toBe(false);
  });
  it('applies simultaneous scalar conflict decisions independently', async () => {
    let data = await getApplicant();
    data.profile.personal.email = 'saved@example.test';
    data.profile.personal.phone = '555-111-2222';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.email = 'proposed@example.test';
    draft.candidate.personal.phone = '555-333-4444';
    draft.decisions = {
      'personal.email': 'use_proposed',
      'personal.phone': 'keep_saved',
    };
    data = await saveImport(draft, data.revision);
    data = await confirmImport(draft, data.revision, true);
    expect(data.profile.personal).toMatchObject({
      email: 'proposed@example.test',
      phone: '555-111-2222',
    });
  });
  it('includes a new scalar by default and allows it to be declined', async () => {
    let data = await getApplicant();
    const included = createImportDraft(crypto.randomUUID(), '');
    included.candidate.personal.city = 'Sample City';
    data = await saveImport(included, data.revision);
    data = await confirmImport(included, data.revision, true);
    expect(data.profile.personal.city).toBe('Sample City');

    const declined = createImportDraft(crypto.randomUUID(), '');
    declined.candidate.personal.country = 'Canada';
    declined.decisions['personal.country'] = 'exclude';
    data = await saveImport(declined, data.revision);
    data = await confirmImport(declined, data.revision, true);
    expect(data.profile.personal.country).toBe('');
  });
  it('declines one education record while retaining another', async () => {
    let data = await getApplicant();
    const draft = createImportDraft(crypto.randomUUID(), '');
    const first = {
      id: crypto.randomUUID(),
      institution: 'Example Technical College',
      degree: 'BS',
      major: 'Information Systems',
      concentration: '',
      minor: '',
      gpa: '',
      startDate: '',
      graduationDate: '2025',
      location: '',
    };
    const second = {
      ...first,
      id: crypto.randomUUID(),
      institution: 'Sample State University',
    };
    draft.candidate.education = [first, second];
    draft.decisions[`education.${first.id}`] = 'exclude';
    data = await saveImport(draft, data.revision);
    data = await confirmImport(draft, data.revision, true);
    expect(
      data.profile.education.map(({ institution }) => institution),
    ).toEqual(['Sample State University']);
  });
  it('declines one project while retaining another', async () => {
    let data = await getApplicant();
    const draft = createImportDraft(crypto.randomUUID(), '');
    const first = {
      id: crypto.randomUUID(),
      name: 'Synthetic Queue Console',
      description: '',
      technologies: ['TypeScript'],
      responsibilities: ['Built queue views.'],
      accomplishments: [],
      githubUrl: '',
      deployedUrl: '',
    };
    const second = {
      ...first,
      id: crypto.randomUUID(),
      name: 'Synthetic Audit Portal',
    };
    draft.candidate.projects = [first, second];
    draft.decisions[`projects.${second.id}`] = 'exclude';
    data = await saveImport(draft, data.revision);
    data = await confirmImport(draft, data.revision, true);
    expect(data.profile.projects.map(({ name }) => name)).toEqual([
      'Synthetic Queue Console',
    ]);
  });
  it('merges only included skill categories and never removes saved skills', async () => {
    let data = await getApplicant();
    data.profile.skills.programming = ['JavaScript'];
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.skills.programming = ['TypeScript'];
    draft.candidate.skills.cloud = ['AWS'];
    draft.decisions['skills.cloud'] = 'exclude';
    data = await saveImport(draft, data.revision);
    data = await confirmImport(draft, data.revision, true);
    expect(data.profile.skills.programming).toEqual([
      'JavaScript',
      'TypeScript',
    ]);
    expect(data.profile.skills.cloud).toEqual([]);
  });
  it('persists decisions in the unverified draft and ignores blank proposals', async () => {
    let data = await getApplicant();
    data.profile.personal.city = 'Saved City';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.city = '';
    draft.candidate.personal.country = 'Canada';
    draft.decisions = {
      'personal.city': 'use_proposed',
      'personal.country': 'exclude',
    };
    data = await saveImport(draft, data.revision);
    expect((await getApplicant()).imports[0]!.decisions).toEqual(
      draft.decisions,
    );
    data = await confirmImport(data.imports[0]!, data.revision, true);
    expect(data.profile.personal.city).toBe('Saved City');
    expect(data.profile.personal.country).toBe('');
  });
  it('does not promote unrelated unverified legacy facts during import confirmation', async () => {
    const original = emptyApplicant();
    original.profile.personal.firstName = 'Unreviewed';
    storage = storageHarness({ [APPLICANT_KEY]: original });
    const draft = createImportDraft(crypto.randomUUID(), 'new@example.com');
    const data = await saveImport(draft, 0);
    const saved = await confirmImport(draft, data.revision, true);
    expect(saved.profile.verification['personal.firstName']).toBeUndefined();
  });
  it('discarding an import leaves profile and other concepts untouched', async () => {
    const draft = createImportDraft(crypto.randomUUID(), 'a@example.com');
    const data = await saveImport(draft, 0);
    const saved = await discardImport(draft.id, data.revision);
    expect(saved.imports).toEqual([]);
    expect(saved.profile).toEqual(data.profile);
  });
});
