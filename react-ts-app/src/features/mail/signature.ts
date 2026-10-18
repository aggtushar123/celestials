// The mailbox signature's words (agent bundles round 2 D1, Decisions 4 to 6;
// contract §4.3). No em dash.

export const SIGNATURE = {
  LABEL: 'Signature',
  HINT: 'Added under every email you send from Revenact. Up to 10 lines.',
  SAVE: 'Save',
  SAVING: 'Saving…',
  SAVED: 'Signature saved.',
  FAILED: 'Could not save the signature.',
  GMAIL_HINT: 'Change it in Gmail.',
  EDITOR_HINT: 'Your Gmail signature goes out as it is in Gmail.',
} as const;

export const gmailSignatureText = (text: string): string => text || 'None in Gmail';
