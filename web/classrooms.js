/* Hudhud Phase 2 browser API.
 * Requires Firebase Web SDK v8 compat: app, auth, database, functions.
 * Callable Functions enforce roles server-side; RTDB rules are the final gate.
 */
(function (global) {
  'use strict';
  const functions = firebase.functions();

  async function role(forceRefresh = false) {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const token = await user.getIdTokenResult(forceRefresh);
    return token.claims.role || null;
  }
  async function call(name, payload) {
    if (!firebase.auth().currentUser) throw new Error('يجب تسجيل الدخول أولاً.');
    try {
      const result = await functions.httpsCallable(name)(payload || {});
      return result.data;
    } catch (err) {
      const messages = {
        'unauthenticated': 'انتهت جلسة الدخول. سجّل الدخول مجدداً.',
        'permission-denied': 'حسابك لا يملك صلاحية هذا الإجراء.',
        'not-found': 'لم نعثر على الصف أو الطلب المطلوب.',
        'already-exists': 'هذا الطلب موجود مسبقاً أو أنك منضم بالفعل.',
        'failed-precondition': 'لا يمكن تنفيذ العملية في الحالة الحالية.'
      };
      throw new Error(messages[err.code] || err.message || 'تعذر إكمال العملية.');
    }
  }
  async function read(path) {
    if (!firebase.auth().currentUser) throw new Error('يجب تسجيل الدخول أولاً.');
    const snap = await firebase.database().ref(path).once('value');
    return snap.val();
  }
  async function createClass(name) { return call('createClass', { name }); }
  async function requestJoin(code) { return call('requestJoin', { code }); }
  async function decideJoin(classId, studentId, accepted) {
    return call('decideJoinRequest', {
      classId, studentId, decision: accepted ? 'accepted' : 'rejected'
    });
  }
  async function setClassActive(classId, active) {
    return call('setClassActive', { classId, active });
  }
  async function assignRole(uid, roleName) {
    return call('setUserRole', { uid, role: roleName });
  }
  async function listMyClasses() {
    const currentRole = await role();
    const user = firebase.auth().currentUser;
    if (currentRole === 'admin') {
      const all = await read('classes') || {};
      return Object.entries(all).map(([id, value]) => ({ id, ...value }));
    }
    const indexPath = currentRole === 'teacher'
      ? `teacherClasses/${user.uid}` : `memberships/${user.uid}`;
    const index = await read(indexPath) || {};
    const ids = Object.keys(index).filter(id => index[id] === true);
    const records = await Promise.all(ids.map(async id => ({
      id, ...(await read(`classes/${id}`) || {})
    })));
    return records;
  }
  async function listJoinRequests(classId) {
    const data = await read(`joinRequests/${classId}`) || {};
    return Object.entries(data).map(([studentId, value]) => ({ studentId, ...value }));
  }
  async function listClassStudents(classId) {
    const ids = await read(`classMembers/${classId}`) || {};
    return Object.keys(ids).filter(uid => ids[uid] === true);
  }
  async function listMyJoinRequests() {
    const user = firebase.auth().currentUser;
    const mine = await read(`studentJoinRequests/${user.uid}`) || {};
    return Object.entries(mine).map(([classId, value]) => ({ classId, ...value }));
  }
  global.HudhudClassrooms = Object.freeze({
    role, createClass, requestJoin, decideJoin, setClassActive,
    assignRole, listMyClasses, listJoinRequests, listClassStudents, listMyJoinRequests
  });
})(window);
