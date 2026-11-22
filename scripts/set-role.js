'use strict';

// Run locally from a trusted machine with Application Default Credentials.
// Never upload a service-account JSON key or this script's credentials to GitHub.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const [uid, role] = process.argv.slice(2);
const allowed = new Set(['admin', 'teacher', 'student']);
if (!uid || !allowed.has(role)) {
  console.error('Usage: GOOGLE_APPLICATION_CREDENTIALS=/secure/path/key.json node scripts/set-role.js <FIREBASE_UID> <admin|teacher|student>');
  process.exit(1);
}
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT || 'hudhud-344ec'
});
(async () => {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role });
  console.log(`Role "${role}" assigned to UID ${uid}. Ask the user to sign out and sign in again.`);
  process.exit(0);
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
