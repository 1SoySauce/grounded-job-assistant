import { z } from 'zod';

const text = (maxLength = 500) => z.string().trim().max(maxLength);
const id = z.string().min(1).max(120);
const urlText = z.union([z.literal(''), z.url().max(2_048)]);

export const VerificationRecordSchema = z.object({
  status: z.enum(['unverified', 'verified']),
  source: z.enum(['manual', 'resume_import', 'saved_answer']),
  sourceLabel: text(200),
  reviewedAt: z.iso.datetime().optional(),
});

export const PersonalInformationSchema = z.object({
  firstName: text(100),
  middleName: text(100),
  lastName: text(100),
  preferredName: text(100),
  email: text(254),
  phone: text(50),
  city: text(120),
  state: text(120),
  zip: text(30),
  country: text(120),
  linkedinUrl: urlText,
  githubUrl: urlText,
  portfolioUrl: urlText,
});

export const EducationEntrySchema = z.object({
  id,
  institution: text(200),
  degree: text(200),
  major: text(200),
  concentration: text(200),
  gpa: text(30),
  startDate: text(30),
  graduationDate: text(30),
  location: text(200),
});

export const EmploymentEntrySchema = z.object({
  id,
  employer: text(200),
  title: text(200),
  location: text(200),
  startDate: text(30),
  endDate: text(30),
  currentlyEmployed: z.boolean(),
  responsibilities: z.array(text(1_000)).max(100),
  accomplishments: z.array(text(1_000)).max(100),
  technologies: z.array(text(100)).max(200),
  skills: z.array(text(100)).max(200),
});

export const ProjectEntrySchema = z.object({
  id,
  name: text(200),
  description: text(3_000),
  technologies: z.array(text(100)).max(200),
  responsibilities: z.array(text(1_000)).max(100),
  accomplishments: z.array(text(1_000)).max(100),
  githubUrl: urlText,
  deployedUrl: urlText,
});

export const CertificationEntrySchema = z.object({
  id,
  certification: text(200),
  organization: text(200),
  date: text(30),
  expiration: text(30),
  credentialId: text(200),
});

export const SkillCategoriesSchema = z.object({
  programming: z.array(text(100)).max(200),
  databases: z.array(text(100)).max(200),
  cloud: z.array(text(100)).max(200),
  networking: z.array(text(100)).max(200),
  cybersecurity: z.array(text(100)).max(200),
  ai: z.array(text(100)).max(200),
  operatingSystems: z.array(text(100)).max(200),
  businessMis: z.array(text(100)).max(200),
  productivityTools: z.array(text(100)).max(200),
  other: z.array(text(100)).max(200),
});

export const JobPreferencesSchema = z.object({
  desiredTitles: z.array(text(200)).max(200),
  titleKeywords: z.array(text(100)).max(200),
  excludedTitles: z.array(text(200)).max(200),
  desiredLocations: z.array(text(200)).max(200),
  workplacePreferences: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3),
  minimumSalary: z.number().nonnegative().nullable(),
  desiredSalary: z.number().nonnegative().nullable(),
  employmentTypes: z.array(text(100)).max(30),
  roleTypes: z
    .array(z.enum(['internship', 'full_time', 'part_time', 'contract']))
    .max(4),
  industries: z.array(text(150)).max(200),
  excludedCompanies: z.array(text(200)).max(200),
  autoConsiderScore: z.number().int().min(0).max(100),
});

export const AnswerLibraryEntrySchema = z.object({
  id,
  question: text(1_000),
  normalizedQuestion: text(1_000),
  mode: z.enum([
    'verified_factual',
    'reusable_custom',
    'ai_generated_allowed',
    'always_ask',
  ]),
  value: z.union([z.string().max(10_000), z.number(), z.boolean()]).optional(),
  sensitiveCategory: z
    .enum([
      'disability',
      'veteran_status',
      'gender',
      'race_ethnicity',
      'religion',
      'sexual_orientation',
      'other_protected',
    ])
    .optional(),
  updatedAt: z.iso.datetime(),
});

export const JobSeekerProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  personal: PersonalInformationSchema,
  education: z.array(EducationEntrySchema).max(100),
  employment: z.array(EmploymentEntrySchema).max(200),
  projects: z.array(ProjectEntrySchema).max(200),
  skills: SkillCategoriesSchema,
  certifications: z.array(CertificationEntrySchema).max(200),
  preferences: JobPreferencesSchema,
  answerLibrary: z.array(AnswerLibraryEntrySchema).max(1_000),
  verification: z.record(z.string(), VerificationRecordSchema),
});

export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
export type JobSeekerProfile = z.infer<typeof JobSeekerProfileSchema>;

export function createEmptyProfile(now = new Date()): JobSeekerProfile {
  const timestamp = now.toISOString();

  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    personal: {
      firstName: '',
      middleName: '',
      lastName: '',
      preferredName: '',
      email: '',
      phone: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
    },
    education: [],
    employment: [],
    projects: [],
    skills: {
      programming: [],
      databases: [],
      cloud: [],
      networking: [],
      cybersecurity: [],
      ai: [],
      operatingSystems: [],
      businessMis: [],
      productivityTools: [],
      other: [],
    },
    certifications: [],
    preferences: {
      desiredTitles: [],
      titleKeywords: [],
      excludedTitles: [],
      desiredLocations: [],
      workplacePreferences: [],
      minimumSalary: null,
      desiredSalary: null,
      employmentTypes: [],
      roleTypes: [],
      industries: [],
      excludedCompanies: [],
      autoConsiderScore: 75,
    },
    answerLibrary: [],
    verification: {},
  };
}

export function isMinimumProfileVerified(profile: JobSeekerProfile): boolean {
  const requiredPaths = [
    'personal.firstName',
    'personal.lastName',
    'personal.email',
  ] as const;

  return requiredPaths.every(
    (path) =>
      profile.verification[path]?.status === 'verified' &&
      profile.personal[path.split('.')[1] as 'firstName' | 'lastName' | 'email']
        .length > 0,
  );
}
