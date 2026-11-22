'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const crypto = require('crypto');

initializeApp();
const db = getDatabase();
const auth = getAuth();

const VALID_ROLES = new Set(['admin', 'teacher', 'student']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function requireRole(request, roles) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'سجّل الدخول أولاً.');
  if (!roles.includes(request.auth.token.role)) {
    throw new HttpsError('permission-denied', 'ليست لديك صلاحية تنفيذ هذا الإجراء.');
  }
}
function cleanText(value, max = 100) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}
function makeJoinCode() {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}
async function isClassTeacher(classId, uid) {
  const snap = await db.ref(`classes/${classId}/teacherId`).get();
  return snap.exists() && snap.val() === uid;
}

/**
 * Assign a role. This callable can only be used by an existing admin.
 * Initial admin bootstrap is intentionally performed by the local
 * scripts/set-role.js utility, never from the public browser.
 */
exports.setUserRole = onCall(async (request) => {
  requireRole(request, ['admin']);
  const uid = cleanText(request.data && request.data.uid, 128);
  const role = request.data && request.data.role;
  if (!uid || !VALID_ROLES.has(role)) {
    throw new HttpsError('invalid-argument', 'أدخل UID صحيحاً ودوراً صالحاً.');
  }
  if (uid === request.auth.uid && role !== 'admin') {
    throw new HttpsError('failed-precondition', 'لا يمكن خفض صلاحية حساب المدير الحالي من هنا.');
  }
  const target = await auth.getUser(uid);
  const claims = { ...(target.customClaims || {}), role };
  await auth.setCustomUserClaims(uid, claims);
  await db.ref(`users/${uid}/profile`).update({
    roleLabel: role,
    roleUpdatedAt: Date.now()
  });
  return { ok: true, uid, role };
});

exports.createClass = onCall(async (request) => {
  requireRole(request, ['teacher']);
  const name = cleanText(request.data && request.data.name, 100);
  if (name.length < 2) throw new HttpsError('invalid-argument', 'اسم الصف يجب أن يكون حرفين على الأقل.');
  const uid = request.auth.uid;
  const classId = `cl_${crypto.randomUUID().replace(/-/g, '')}`;
  let code = null;

  // Resolve collisions before writing; the final multi-location update is atomic.
  for (let i = 0; i < 8; i++) {
    const candidate = makeJoinCode();
    const existing = await db.ref(`classCodes/${candidate}`).get();
    if (!existing.exists()) { code = candidate; break; }
  }
  if (!code) throw new HttpsError('resource-exhausted', 'تعذر إنشاء رمز صف فريد. حاول مجدداً.');

  const now = Date.now();
  const updates = {};
  updates[`classes/${classId}`] = {
    teacherId: uid, name, joinCode: code, active: true, createdAt: now
  };
  updates[`teacherClasses/${uid}/${classId}`] = true;
  updates[`classCodes/${code}`] = classId;
  await db.ref().update(updates);
  return { id: classId, name, joinCode: code, active: true, createdAt: now };
});

exports.requestJoin = onCall(async (request) => {
  requireRole(request, ['student']);
  const code = cleanText(request.data && request.data.code, 10).toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'رمز الصف يجب أن يتكون من 8 أحرف أو أرقام.');
  }
  const codeSnap = await db.ref(`classCodes/${code}`).get();
  if (!codeSnap.exists()) throw new HttpsError('not-found', 'رمز الصف غير صحيح.');
  const classId = codeSnap.val();
  const classSnap = await db.ref(`classes/${classId}`).get();
  const classroom = classSnap.val();
  if (!classroom || classroom.active !== true || classroom.joinCode !== code) {
    throw new HttpsError('failed-precondition', 'هذا الصف غير متاح حالياً.');
  }
  const uid = request.auth.uid;
  const memberSnap = await db.ref(`memberships/${uid}/${classId}`).get();
  if (memberSnap.val() === true) throw new HttpsError('already-exists', 'أنت منضم إلى هذا الصف بالفعل.');

  const requestRef = db.ref(`joinRequests/${classId}/${uid}`);
  const result = await requestRef.transaction(current => {
    if (current && current.status === 'pending') return;
    return { studentId: uid, status: 'pending', createdAt: Date.now() };
  });
  if (!result.committed) throw new HttpsError('already-exists', 'لديك طلب انضمام قيد الانتظار.');
  await db.ref(`studentJoinRequests/${uid}/${classId}`).set({ classId, status: 'pending', createdAt: Date.now() });
  return { classId, className: classroom.name, status: 'pending' };
});

exports.decideJoinRequest = onCall(async (request) => {
  requireRole(request, ['teacher', 'admin']);
  const classId = cleanText(request.data && request.data.classId, 128);
  const studentId = cleanText(request.data && request.data.studentId, 128);
  const decision = request.data && request.data.decision;
  if (!classId || !studentId || !['accepted', 'rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'بيانات الطلب غير مكتملة.');
  }
  if (request.auth.token.role === 'teacher' && !(await isClassTeacher(classId, request.auth.uid))) {
    throw new HttpsError('permission-denied', 'هذا الصف لا يتبع لك.');
  }
  const reqRef = db.ref(`joinRequests/${classId}/${studentId}`);
  const reviewedAt = Date.now();
  const tx = await reqRef.transaction(current => {
    if (!current || current.status !== 'pending') return;
    return { ...current, status: decision, reviewedAt };
  });
  if (!tx.committed) {
    throw new HttpsError('failed-precondition', 'طلب الانضمام غير موجود أو تمت معالجته مسبقاً.');
  }
  const updates = {};
  if (decision === 'accepted') {
    updates[`memberships/${studentId}/${classId}`] = true;
    updates[`classMembers/${classId}/${studentId}`] = true;
  }
  updates[`studentJoinRequests/${studentId}/${classId}`] = {
    classId, status: decision, updatedAt: reviewedAt
  };
  await db.ref().update(updates);
  return { ok: true, status: decision };
});

exports.setClassActive = onCall(async (request) => {
  requireRole(request, ['teacher', 'admin']);
  const classId = cleanText(request.data && request.data.classId, 128);
  const active = request.data && request.data.active;
  if (!classId || typeof active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'بيانات الصف غير صحيحة.');
  }
  if (request.auth.token.role === 'teacher' && !(await isClassTeacher(classId, request.auth.uid))) {
    throw new HttpsError('permission-denied', 'هذا الصف لا يتبع لك.');
  }
  await db.ref(`classes/${classId}/active`).set(active);
  return { ok: true, active };
});
