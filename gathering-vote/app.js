let sbClient = null;
let selectedStatus = null;
let currentEventId = null;
let currentEventMode = "kehadiran";
let adminAuthed = sessionStorage.getItem("vote_admin_auth") === "1";

const STATUS_LABEL = { ya: "Ya, Hadir", tidak: "Tidak Hadir" };

// ---------- Supabase ----------
function getSupabase() {
  if (sbClient) return sbClient;
  const url = window.SUPABASE_URL || "";
  const key = window.SUPABASE_ANON_KEY || "";
  if (!url.startsWith("http") || key.indexOf(".") < 0) return null;
  sbClient = window.supabase.createClient(url, key);
  return sbClient;
}

// ---------- Router ----------
function router() {
  const hash = (location.hash || "#/").replace("#", "");
  if (hash.startsWith("/e/")) {
    const id = hash.split("/")[2];
    if (id) { openEvent(id); return; }
  }
  renderHome();
}
window.addEventListener("hashchange", router);

function goHome() { location.hash = "#/"; }

// ---------- HOME ----------
async function renderHome() {
  document.getElementById("viewHome").style.display = "block";
  document.getElementById("viewEvent").style.display = "none";
  const list = document.getElementById("eventList");
  const note = document.getElementById("homeNote");

  const client = getSupabase();
  if (!client) {
    note.textContent = "Supabase belum dikonfigurasi di config.js.";
    list.innerHTML = '<div class="empty">Tidak bisa memuat event.</div>';
    return;
  }

  const { data, error } = await client
    .from("events")
    .select("id,nama,keterangan,aktif")
    .order("created_at", { ascending: false });

  if (error) {
    note.textContent = "Gagal memuat: " + (error.message || error);
    return;
  }

  const active = (data || []).filter((e) => e.aktif);
  note.textContent = active.length + " kegiatan aktif.";

  if (!active.length) {
    list.innerHTML = '<div class="empty">Belum ada kegiatan. Hubungi admin.</div>';
    return;
  }

  list.innerHTML = active
    .map(
      (e) =>
        '<div class="event-card" onclick="location.hash=\'#/e/' + e.id + '\'">' +
        '<div class="ec-body"><div class="ec-name">' + escapeHtml(e.nama) + "</div>" +
        (e.keterangan ? '<div class="ec-desc">' + escapeHtml(e.keterangan) + "</div>" : "") +
        "</div><div class='ec-arrow'>›</div></div>"
    )
    .join("");
}

// ---------- EVENT ----------
async function openEvent(id) {
  document.getElementById("viewHome").style.display = "none";
  document.getElementById("viewEvent").style.display = "block";
  document.getElementById("totalText").textContent = "Memuat...";
  currentEventId = id;

  const client = getSupabase();
  if (!client) { alert("Supabase belum dikonfigurasi."); return; }

  const { data, error } = await client
    .from("events")
    .select("id,nama,keterangan,aktif,mode")
    .eq("id", id)
    .single();

  if (error || !data) {
    document.getElementById("evTitle").textContent = "Event tidak ditemukan";
    document.getElementById("evDesc").textContent = "";
    return;
  }

  document.getElementById("evTitle").textContent = data.nama;
  document.getElementById("evDesc").textContent = data.keterangan || "";

  currentEventMode = data.mode === "gambar" ? "gambar" : "kehadiran";

  // reset form
  document.getElementById("voteForm").reset();
  document.getElementById("alasanGroup").style.display = "none";
  document.querySelectorAll(".option").forEach((o) =>
    o.classList.remove("selected-yes", "selected-no", "selected-maybe")
  );
  document.getElementById("gVoteNama").value = "";
  document.getElementById("gambarMsg").textContent = "";

  const isGambar = currentEventMode === "gambar";
  document.getElementById("formKehadiran").style.display = isGambar ? "none" : "block";
  document.getElementById("dashKehadiran").style.display = isGambar ? "none" : "block";
  document.getElementById("gambarPanel").style.display =isGambar ? "block" : "none";

  switchTab("vote");
  if (isGambar) {
    loadGambar();
  } else {
    loadDashboard();
  }
}

function selectOption(el) {
  document.querySelectorAll(".option").forEach((o) =>
    o.classList.remove("selected-yes", "selected-no", "selected-maybe")
  );
  selectedStatus = el.dataset.value;
  el.classList.add(selectedStatus === "ya" ? "selected-yes" : selectedStatus === "tidak" ? "selected-no" : "selected-maybe");
  document.getElementById("alasanGroup").style.display = selectedStatus === "tidak" ? "block" : "none";
}

function showMessage(text, type) {
  const m = document.getElementById("message");
  m.className = "message " + type;
  m.textContent = text;
}

async function submitVote(event) {
  if (event) event.preventDefault();
  const nama = document.getElementById("nama").value.trim();
  const email = document.getElementById("email").value.trim();
  const nowa = document.getElementById("nowa").value.trim();
  const alasan = document.getElementById("alasan").value.trim();
  const btn = document.getElementById("submitBtn");

  showMessage("", "success");

  if (!nama) return showMessage("Nama wajib diisi.", "error");
  if (!email) return showMessage("Email wajib diisi.", "error");
  if (!nowa) return showMessage("No. WA wajib diisi.", "error");
  if (!selectedStatus) return showMessage("Pilih salah satu status kehadiran.", "error");
  if (selectedStatus === "tidak" && !alasan) return showMessage("Tuliskan alasan tidak hadir.", "error");

  const client = getSupabase();
  if (!client) { showMessage("Supabase belum dikonfigurasi.", "warning"); return; }

  btn.disabled = true;
  btn.textContent = "Mengirim...";
  try {
    const { count: existing, error: dupErr } = await client
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("event_id", currentEventId)
      .eq("nama", nama);
    if (dupErr) throw dupErr;
    if (existing > 0) {
      btn.disabled = false;
      btn.textContent = "Kirim Voting";
      return showMessage("Nama ini sudah pernah mengirim voting untuk event ini.", "error");
    }

    const { error } = await client.from("responses").insert({
      event_id: currentEventId,
      nama, email, no_wa: nowa, status: selectedStatus,
      alasan: selectedStatus === "tidak" ? alasan : "",
    });
    if (error) throw error;
    showMessage("Voting berhasil dikirim. Terima kasih!", "success");
    document.getElementById("voteForm").reset();
    document.getElementById("alasanGroup").style.display = "none";
    document.querySelectorAll(".option").forEach((o) =>
      o.classList.remove("selected-yes", "selected-no", "selected-maybe")
    );
    selectedStatus = null;
    loadDashboard();
  } catch (err) {
    showMessage("Gagal mengirim: " + (err.message || err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Kirim Voting";
  }
}

async function loadDashboard() {
  const client = getSupabase();
  const body = document.getElementById("respTable");
  const totalText = document.getElementById("totalText");

  if (!client) {
    totalText.textContent = "Supabase belum dikonfigurasi.";
    body.innerHTML = '<tr><td colspan="6" class="empty">Tidak bisa memuat.</td></tr>';
    return;
  }

  const { data, error } = await client
    .from("responses")
    .select("nama,email,no_wa,status,alasan,created_at")
    .eq("event_id", currentEventId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    totalText.textContent = "Gagal memuat.";
    body.innerHTML = '<tr><td colspan="6" class="empty">' + escapeHtml(error.message) + "</td></tr>";
    return;
  }

  const rows = data || [];
  const cYes = rows.filter((r) => r.status === "ya").length;
  const cNo = rows.filter((r) => r.status === "tidak").length;
  const total = rows.length;
  const totalMembers = Number(window.TOTAL_MEMBERS) || 0;

  document.getElementById("countYes").textContent = cYes;
  document.getElementById("countNo").textContent = cNo;

  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  document.getElementById("pctYes").textContent = pct(cYes) + "%";
  document.getElementById("pctNo").textContent = pct(cNo) + "%";
  document.getElementById("barYes").style.width = pct(cYes) + "%";
  document.getElementById("barNo").style.width = pct(cNo) + "%";

  const summary = document.getElementById("voterSummary");
  if (totalMembers > 0) {
    const pctVoted = Math.round((total / totalMembers) * 100);
    summary.textContent = total + " dari " + totalMembers + " member telah memilih (" + pctVoted + "%)";
  } else {
    summary.textContent = total + " member telah memilih";
  }

  totalText.textContent = total + " peserta terdaftar.";

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Belum ada respons.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const st = r.status || "tidak";
      const symbols = { ya: "✅", tidak: "❌", mungkin: "🤔" };
      const symbol = symbols[st] || (STATUS_LABEL[st] || st);
      const badge = '<span class="badge ' + st + '">' + symbol + "</span>";
      const time = r.created_at
        ? new Date(r.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "–";
      const alasanCell = st === "tidak" && r.alasan ? escapeHtml(r.alasan) : "–";
      return (
        "<tr><td>" + escapeHtml(r.nama) + "</td><td>" + escapeHtml(r.email) +
        "</td><td>" + escapeHtml(r.no_wa) + "</td><td>" + badge + "</td><td>" + alasanCell +
        "</td><td>" + time + "</td></tr>"
      );
    })
    .join("");
}

// ---------- TAB & VILLA ----------
function switchTab(tab) {
  document.getElementById("tabVoteBtn").classList.toggle("active", tab === "vote");
  document.getElementById("tabVillaBtn").classList.toggle("active", tab === "villa");
  document.getElementById("panelVote").style.display = tab === "vote" ? "block" : "none";
  document.getElementById("panelVilla").style.display = tab === "villa" ? "block" : "none";
  if (tab === "villa") loadVilla();
}

async function loadVilla() {
  const grid = document.getElementById("villaGrid");
  const note = document.getElementById("villaNote");
  const client = getSupabase();
  if (!client) { note.textContent = "Supabase belum dikonfigurasi."; grid.innerHTML = ""; return; }

  const { data, error } = await client
    .from("villa")
    .select("id,nama,foto_url,fasilitas,harga")
    .eq("event_id", currentEventId)
    .order("created_at", { ascending: true });

  if (error) { note.textContent = "Gagal memuat: " + (error.message || error); grid.innerHTML = ""; return; }

  const rows = data || [];
  note.textContent = rows.length ? rows.length + " pilihan penginapan." : "Belum ada penginapan untuk event ini.";
  if (!rows.length) { grid.innerHTML = '<div class="empty">Belum ada data penginapan.</div>'; return; }

  grid.innerHTML = rows.map((v) =>
    '<div class="villa-card">' +
    (v.foto_url ? '<img src="' + escapeHtml(v.foto_url) + '" alt="' + escapeHtml(v.nama) + '" onerror="villaImgError(this)" />' : '<div class="vc-noimg">Tanpa gambar</div>') +
    '<div class="vc-body">' +
    '<div class="vc-name">' + escapeHtml(v.nama) + "</div>" +
    (v.fasilitas ? '<div class="vc-fas">' + escapeHtml(v.fasilitas) + "</div>" : "") +
    (v.harga ? '<div class="vc-price">' + escapeHtml(v.harga) + "</div>" : "") +
    "</div></div>"
  ).join("");
}

// ---------- VOTING DESIGN (GAMBAR) ----------
function gambarPublicUrl(path) {
  return window.SUPABASE_URL + "/storage/v1/object/public/gambar/" + encodeURIComponent(path);
}

async function loadGambar() {
  const client = getSupabase();
  const gal = document.getElementById("gGallery");
  const note = document.getElementById("gNote");
  const sum = document.getElementById("gvoterSummary");

  if (!client) { note.textContent = "Supabase belum dikonfigurasi."; return; }

  const [uploadsRes, votesRes] = await Promise.all([
    client.from("gambar_uploads").select("id,nama,foto_path").eq("event_id", currentEventId).order("created_at", { ascending: true }),
    client.from("gambar_votes").select("id,upload_id,nama").eq("event_id", currentEventId),
  ]);

  if (uploadsRes.error) { note.textContent = "Gagal: " + uploadsRes.error.message; return; }

  const designs = uploadsRes.data || [];
  const votes = votesRes.data || [];
  const countMap = {};
  votes.forEach((v) => { countMap[v.upload_id] = (countMap[v.upload_id] || 0) + 1; });

  const totalMembers = Number(window.TOTAL_MEMBERS) || 0;
  const votedNames = new Set(votes.map((v) => v.nama.toLowerCase()));
  sum.textContent = totalMembers > 0
    ? votes.length + " dari " + totalMembers + " member telah memilih (" + Math.round((votes.length / totalMembers) * 100) + "%)"
    : votes.length + " member telah memilih";

  note.textContent = designs.length ? designs.length + " pilihan design." : "Belum ada design. Admin belum menambah design.";

  if (!designs.length) { gal.innerHTML = '<div class="empty">Belum ada design.</div>'; return; }

  const myVoteName = (document.getElementById("gVoteNama").value || "").trim().toLowerCase();
  const alreadyVoted = myVoteName && votedNames.has(myVoteName);

  gal.innerHTML = designs.map((u) => {
    const cnt = countMap[u.id] || 0;
    const btnDisabled = !myVoteName || alreadyVoted;
    const label = alreadyVoted ? "Sudah voting" : "Pilih";
    return (
      '<div class="g-card">' +
      '<img src="' + escapeHtml(gambarPublicUrl(u.foto_path)) + '" alt="' + escapeHtml(u.nama) + '" onerror="villaImgError(this)" />' +
      '<div class="gc-body">' +
      '<div class="gc-nama">' + escapeHtml(u.nama) + "</div>" +
      '<div class="gc-count">' + cnt + " suara</div>" +
      '<button type="button" class="gc-vote" data-upload-id="' + u.id + '"' + (btnDisabled ? " disabled" : "") + '>' + label + '</button>' +
      "</div></div>"
    );
  }).join("");
}

async function voteGambar(uploadId) {
  const nama = (document.getElementById("gVoteNama").value || "").trim();
  if (!nama) { alert("Isi nama Anda dulu untuk memilih design."); return; }

  const client = getSupabase();
  if (!client) return;

  const { count: dup } = await client
    .from("gambar_votes").select("id", { count: "exact", head: true })
    .eq("event_id", currentEventId).eq("nama", nama);
  if (dup > 0) { alert("Nama ini sudah pernah memilih di event ini."); return; }

  const { error } = await client.from("gambar_votes").insert({ event_id: currentEventId, upload_id: uploadId, nama });
  if (error) { alert("Gagal memilih: " + (error.message || error)); return; }
  alert("Pilihan tersimpan. Terima kasih!");
  loadGambar();
}

// ---------- ADMIN: KELOLA DESIGN ----------
let currentDesignEventId = null;

async function manageDesign(eventId) {
  currentDesignEventId = eventId;
  const body = document.getElementById("adminBody");
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const { data: ev } = await client.from("events").select("nama").eq("id", eventId).single();
  const { data } = await client.from("gambar_uploads").select("id,nama,foto_path").eq("event_id", eventId).order("created_at", { ascending: true });

  const rows = (data || []).map((d) =>
    '<div class="admin-row">' +
    '<div class="ar-name">' + escapeHtml(d.nama) + "</div>" +
    '<div class="ar-actions"><button type="button" class="btn btn-sm btn-danger" data-action="deleteDesign" data-id="' + d.id + '" data-path="' + escapeHtml(d.foto_path) + '">Hapus</button></div>' +
    "</div>"
  ).join("");

  body.innerHTML =
    '<button type="button" class="btn-back" data-action="backEvents" style="margin-bottom:14px;">← Kembali ke Event</button>' +
    '<h2 style="font-size:1.1rem;margin-bottom:4px;">🎨 Design: ' + escapeHtml(ev ? ev.nama : "") + "</h2>" +
    '<div class="dashboard-note" id="designFormNote">Tambah gambar design untuk dipilih peserta.</div>' +
    '<div class="form-group"><label for="dNama">Nama Design</label><input type="text" id="dNama" placeholder="Contoh: Design A" /></div>' +
    '<div class="form-group"><label for="dFile">File Gambar</label><input type="file" id="dFile" accept="image/*" /></div>' +
    '<button type="button" class="btn" id="designSubmitBtn" data-action="addDesign">Tambah Design</button>' +
    '<div style="margin:16px 0;"><h3 style="font-size:1rem;">Daftar Design</h3>' +
    (rows || '<div class="empty">Belum ada design.</div>') + "</div>";
}

async function addDesign() {
  const nama = document.getElementById("dNama").value.trim();
  const file = document.getElementById("dFile").files[0];
  const note = document.getElementById("designFormNote");
  const btn = document.getElementById("designSubmitBtn");
  if (!nama) { adminMsg("Nama design wajib diisi.", "error"); return; }
  if (!file) { adminMsg("Pilih file gambar.", "error"); return; }
  if (!file.type.match(/image/)) { adminMsg("File harus berupa gambar.", "error"); return; }

  const client = getSupabase();
  btn.disabled = true; btn.textContent = "Mengupload...";
  try {
    const path = currentDesignEventId + "/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: upErr } = await client.storage.from("gambar").upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { error } = await client.from("gambar_uploads").insert({ event_id: currentDesignEventId, nama, foto_path: path });
    if (error) throw error;
    manageDesign(currentDesignEventId);
  } catch (err) {
    adminMsg("Gagal: " + (err.message || err), "error");
    btn.disabled = false; btn.textContent = "Tambah Design";
  }
}

async function deleteDesign(id) {
  if (!confirm("Hapus design ini?")) return;
  const client = getSupabase();
  const { error } = await client.from("gambar_uploads").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  manageDesign(currentDesignEventId);
}

// ---------- ADMIN ----------
function openAdmin() {
  const modal = document.getElementById("adminModal");
  modal.classList.add("open");
  if (!adminAuthed) {
    document.getElementById("adminBody").innerHTML =
      '<div class="form-group"><label for="adminPass">Password Admin</label>' +
      '<input type="password" id="adminPass" placeholder="Masukkan password" /></div>' +
      '<button type="button" class="btn" data-action="adminLogin">Masuk</button>' +
      '<div class="message" id="adminMsg" style="display:none;"></div>';
    return;
  }
  renderAdmin();
}

function closeAdmin() { document.getElementById("adminModal").classList.remove("open"); }

function adminLogin() {
  const pass = document.getElementById("adminPass").value;
  const msg = document.getElementById("adminMsg");
  if (pass === (window.ADMIN_PASSWORD || "")) {
    adminAuthed = true;
    sessionStorage.setItem("vote_admin_auth", "1");
    renderAdmin();
  } else {
    msg.className = "message error";
    msg.textContent = "Password salah.";
    msg.style.display = "block";
  }
}

function adminMsg(text, type) {
  document.getElementById("adminBody").innerHTML +=
    '<div class="message ' + type + '" style="display:block;">' + text + "</div>";
}

async function renderAdmin() {
  const body = document.getElementById("adminBody");
  currentEditEventId = null;
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const { data } = await client.from("events").select("id,nama,keterangan,aktif,mode").order("created_at", { ascending: false });

  const rows = (data || [])
    .map(
      (e) =>
        '<div class="admin-row">' +
        '<div class="ar-name">' + escapeHtml(e.nama) +
        '<div style="font-size:0.75rem;color:var(--muted);font-weight:400;">' +
        (e.mode === "gambar" ? "Voting Gambar" : "Voting Kehadiran") + " &bull; " +
        (e.aktif ? "Aktif" : "Nonaktif") + "</div></div>" +
        '<div class="ar-actions">' +
        '<button type="button" class="btn btn-sm" data-action="editEvent" data-id="' + e.id + '" data-nama="' + escapeHtml(e.nama) + '" data-ket="' + escapeHtml(e.keterangan || "") + '" data-mode="' + (e.mode || "kehadiran") + '">Edit</button>' +
        (e.mode === "gambar" ? '<button type="button" class="btn btn-sm" data-action="manageDesign" data-id="' + e.id + '">Design</button>' : "") +
        '<button type="button" class="btn btn-sm" data-action="manageVilla" data-id="' + e.id + '">Penginapan</button>' +
        '<button type="button" class="btn btn-sm" data-action="copyLink" data-id="' + e.id + '">Salin Link</button>' +
        '<button type="button" class="btn btn-sm ' + (e.aktif ? "btn-danger" : "btn-success") + '" data-action="toggleEvent" data-id="' + e.id + '" data-aktif="' + (e.aktif ? "true" : "false") + '">' +
        (e.aktif ? "Nonaktifkan" : "Aktifkan") + "</button>" +
        '<button type="button" class="btn btn-sm btn-danger" data-action="deleteEvent" data-id="' + e.id + '" data-nama="' + escapeHtml(e.nama) + '">Hapus</button>' +
        "</div></div>"
    )
    .join("");

  body.innerHTML =
    '<div class="dashboard-note" id="evFormNote">Buat event baru.</div>' +
    '<div class="form-group"><label for="evNama">Nama Event</label>' +
    '<input type="text" id="evNama" placeholder="Contoh: Gathering Tahunan 2026" /></div>' +
    '<div class="form-group"><label for="evKet">Keterangan (opsional)</label>' +
    '<textarea id="evKet" placeholder="Deskripsi singkat kegiatan"></textarea></div>' +
    '<div class="form-group"><label for="evMode">Jenis Voting</label>' +
    '<select id="evMode">' +
    '<option value="kehadiran">Voting Kehadiran (Ya / Tidak)</option>' +
    '<option value="gambar">Voting Gambar (Upload & Vote)</option>' +
    '</select></div>' +
    '<button type="button" class="btn" id="evSubmitBtn" data-action="createEvent">Buat Event</button>' +
    '<div style="margin:16px 0;"><h3 style="font-size:1rem;">Daftar Event</h3>' +
    (rows || '<div class="empty">Belum ada event.</div>') + "</div>";
}

function editEvent(id, nama, ket, mode) {
  currentEditEventId = id;
  document.getElementById("evNama").value = nama;
  document.getElementById("evKet").value = ket || "";
  document.getElementById("evMode").value = mode || "kehadiran";
  document.getElementById("evFormNote").textContent = "Mengedit: " + nama + ". Klik 'Update Event' untuk menyimpan.";
  document.getElementById("evSubmitBtn").textContent = "Update Event";
}

async function createEvent() {
  const nama = document.getElementById("evNama").value.trim();
  const ket = document.getElementById("evKet").value.trim();
  const mode = document.getElementById("evMode").value || "kehadiran";
  const client = getSupabase();
  if (!nama) { adminMsg("Nama event wajib diisi.", "error"); return; }
  if (currentEditEventId) {
    const { error } = await client.from("events").update({ nama, keterangan: ket, mode }).eq("id", currentEditEventId);
    if (error) { adminMsg("Gagal update: " + error.message, "error"); return; }
  } else {
    const { error } = await client.from("events").insert({ nama, keterangan: ket, mode });
    if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  }
  renderAdmin();
}

function copyLink(id) {
  const url = location.origin + location.pathname + "#/e/" + id;
  const done = function () {
    const b = document.getElementById("adminBody");
    const d = document.createElement("div");
    d.className = "message success";
    d.style.display = "block";
    d.textContent = "Link disalin: " + url;
    b.appendChild(d);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
  } else {
    fallbackCopy(url, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
  done();
}

async function toggleEvent(id, aktif) {
  const client = getSupabase();
  const { error } = await client.from("events").update({ aktif }).eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  renderAdmin();
}

async function deleteEvent(id, nama) {
  if (!confirm("Hapus event '" + nama + "' beserta semua voting-nya?")) return;
  const client = getSupabase();
  const { error } = await client.from("events").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  renderAdmin();
}

// ---------- ADMIN: KELOLA VILLA (penginapan) ----------
let currentAdminEventId = null;
let currentVillaId = null;
let currentEditEventId = null;

async function manageVilla(eventId) {
  currentAdminEventId = eventId;
  currentVillaId = null;
  const body = document.getElementById("adminBody");
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const { data: ev } = await client.from("events").select("nama").eq("id", eventId).single();
  const { data, error } = await client.from("villa").select("id,nama,foto_url,fasilitas,harga").eq("event_id", eventId).order("created_at", { ascending: true });

  const rows = (data || []).map((v) =>
    '<div class="admin-row">' +
    '<div class="ar-name">' + escapeHtml(v.nama) +
    (v.harga ? '<div style="font-size:0.75rem;color:var(--primary);font-weight:600;">' + escapeHtml(v.harga) + "</div>" : "") +
    "</div>" +
    '<div class="ar-actions">' +
    '<button type="button" class="btn btn-sm" data-action="editVilla" data-id="' + v.id + '">Edit</button>' +
    '<button type="button" class="btn btn-sm btn-danger" data-action="deleteVilla" data-id="' + v.id + '">Hapus</button>' +
    "</div></div>"
  ).join("");

  body.innerHTML =
    '<button type="button" class="btn-back" data-action="backEvents" style="margin-bottom:14px;">← Kembali ke Event</button>' +
    '<h2 style="font-size:1.1rem;margin-bottom:4px;">🏠  Penginapan: ' + escapeHtml(ev ? ev.nama : "") + "</h2>" +
    '<div class="dashboard-note" id="villaFormNote">Tambah katalog villa untuk event ini.</div>' +
    '<div class="form-group"><label for="vNama">Nama Villa</label><input type="text" id="vNama" placeholder="Contoh: Villa Melati" /></div>' +
    '<div class="form-group"><label for="vFoto">URL Foto</label><input type="text" id="vFoto" placeholder="https://gambar.example.com/villa.jpg" /></div>' +
    '<div class="form-group"><label for="vFas">Fasilitas (pisahkan dengan baris baru)</label><textarea id="vFas" placeholder="Kapasitas 10 orang&#10;Kolam renang&#10;Dapur lengkap"></textarea></div>' +
    '<div class="form-group"><label for="vHarga">Harga</label><input type="text" id="vHarga" placeholder="Rp 1.500.000 / malam" /></div>' +
    '<button type="button" class="btn" id="villaSubmitBtn" data-action="addVilla">Simpan Villa</button>' +
    '<div style="margin:16px 0;"><h3 style="font-size:1rem;">Daftar Villa</h3>' +
    (rows || '<div class="empty">Belum ada villa.</div>') + "</div>";
}

async function editVilla(id) {
  const client = getSupabase();
  const { data, error } = await client.from("villa").select("id,nama,foto_url,fasilitas,harga").eq("id", id).single();
  if (error || !data) { adminMsg("Gagal memuat villa.", "error"); return; }
  currentVillaId = data.id;
  document.getElementById("vNama").value = data.nama || "";
  document.getElementById("vFoto").value = data.foto_url || "";
  document.getElementById("vFas").value = data.fasilitas || "";
  document.getElementById("vHarga").value = data.harga || "";
  const note = document.getElementById("villaFormNote");
  note.textContent = "Mengedit: " + data.nama;
  document.getElementById("villaSubmitBtn").textContent = "Update Villa";
}

async function addVilla() {
  const nama = document.getElementById("vNama").value.trim();
  const foto = document.getElementById("vFoto").value.trim();
  const fas = document.getElementById("vFas").value.trim();
  const harga = document.getElementById("vHarga").value.trim();
  if (!nama) { adminMsg("Nama villa wajib diisi.", "error"); return; }
  const client = getSupabase();
  if (currentVillaId) {
    const { error } = await client.from("villa").update({ nama, foto_url: foto, fasilitas: fas, harga }).eq("id", currentVillaId);
    if (error) { adminMsg("Gagal update: " + error.message, "error"); return; }
  } else {
    const { error } = await client.from("villa").insert({ event_id: currentAdminEventId, nama, foto_url: foto, fasilitas: fas, harga });
    if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  }
  manageVilla(currentAdminEventId);
}

async function deleteVilla(id) {
  if (!confirm("Hapus villa ini?")) return;
  const client = getSupabase();
  const { error } = await client.from("villa").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  manageVilla(currentAdminEventId);
}

function villaImgError(img) {
  img.outerHTML = '<div class="vc-noimg">Gambar tidak tersedia</div>';
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- Delegated click untuk panel admin ----------
document.getElementById("adminModal").addEventListener("click", function (ev) {
  const el = ev.target.closest("[data-action]");
  if (!el || !el.dataset.action) return;
  const a = el.dataset.action;
  if (a === "adminLogin") adminLogin();
  else if (a === "createEvent") createEvent();
  else if (a === "editEvent") editEvent(el.dataset.id, el.dataset.nama, el.dataset.ket, el.dataset.mode);
  else if (a === "copyLink") copyLink(el.dataset.id);
  else if (a === "toggleEvent") toggleEvent(el.dataset.id, el.dataset.aktif === "true");
  else if (a === "deleteEvent") deleteEvent(el.dataset.id, el.dataset.nama);
  else if (a === "manageVilla") manageVilla(el.dataset.id);
  else if (a === "manageDesign") manageDesign(el.dataset.id);
  else if (a === "addDesign") addDesign();
  else if (a === "deleteDesign") deleteDesign(el.dataset.id);
  else if (a === "addVilla") addVilla();
  else if (a === "editVilla") editVilla(el.dataset.id);
  else if (a === "deleteVilla") deleteVilla(el.dataset.id);
  else if (a === "backEvents") renderAdmin();
});

// ---------- Init ----------
document.getElementById("gGallery").addEventListener("click", function (ev) {
  const el = ev.target.closest("[data-upload-id]");
  if (!el) return;
  voteGambar(el.dataset.uploadId);
});
document.getElementById("gVoteNama").addEventListener("input", function () {
  if (currentEventMode === "gambar") loadGambar();
});
router();
