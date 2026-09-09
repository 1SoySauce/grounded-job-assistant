export async function restrictStorageToTrustedContexts(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new Error(
      'Open settings from the installed extension to edit applicant data. The web preview cannot access your profile.',
    );
  }
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}
