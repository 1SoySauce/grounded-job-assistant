import { describe, expect, it } from 'vitest';
import {
  createEmptyProfile,
  isMinimumProfileVerified,
  JobSeekerProfileSchema,
} from '../src/types/profile';

describe('job-seeker profile', () => {
  it('creates a schema-valid empty profile', () => {
    const profile = createEmptyProfile(new Date('2026-09-03T12:00:00.000Z'));
    expect(JobSeekerProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.preferences.autoConsiderScore).toBe(75);
    expect(profile.answerLibrary).toEqual([]);
  });

  it('does not consider unverified contact details ready', () => {
    const profile = createEmptyProfile();
    profile.personal.firstName = 'Taylor';
    profile.personal.lastName = 'Example';
    profile.personal.email = 'taylor@example.com';
    expect(isMinimumProfileVerified(profile)).toBe(false);
  });

  it('requires each minimum field to be both present and verified', () => {
    const profile = createEmptyProfile();
    profile.personal.firstName = 'Taylor';
    profile.personal.lastName = 'Example';
    profile.personal.email = 'taylor@example.com';

    for (const path of [
      'personal.firstName',
      'personal.lastName',
      'personal.email',
    ]) {
      profile.verification[path] = {
        status: 'verified',
        source: 'manual',
        sourceLabel: 'Profile editor',
        reviewedAt: '2026-09-03T12:00:00.000Z',
      };
    }

    expect(isMinimumProfileVerified(profile)).toBe(true);
  });
});
