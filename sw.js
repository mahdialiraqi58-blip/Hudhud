async function saveData() {
  try {
    const u = firebase.auth().currentUser;
    if (!u) throw new Error('no auth');
    const token = await u.getIdToken();
    const r = await fetch(FIREBASE_URL + 'data.json?auth=' + token, {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(lib)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    localStorage.setItem('hudhud_lib_cache', JSON.stringify(lib));
  } catch (e) { showToast('فشل الحفظ. تأكد من تسجيل الدخول والصلاحيات.', 'error'); }
}
