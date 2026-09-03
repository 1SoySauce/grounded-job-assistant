export async function restrictStorageToTrustedContexts(): Promise<void> {
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}
