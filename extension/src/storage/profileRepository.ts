import { getApplicant } from './applicantRepository';
import type { JobSeekerProfile } from '../types/profile';

// Read compatibility for the Milestone 1 popup and background.
export async function getProfile(): Promise<JobSeekerProfile> {
  const data = await getApplicant();
  return {
    ...data.profile,
    schemaVersion: 1,
    preferences: data.preferences,
    answerLibrary: data.answers,
  };
}
export const getOrCreateProfile = getProfile;
