let sbClient = null;
let selectedStatus = null;
let currentEventId = null;
let adminAuthed = sessionStorage.getItem("vote_admin_auth") === "1";

const STATUS_LABEL = { ya: "Ya, Hadir", tidak: "Tidak Hadir", mungkin: "Mungkin" };

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
    .select("id,nama,keterangan,aktif")
    .eq("id", id)
    .single();

  if (error || !data) {
    document.getElementById("evTitle").textContent = "Event tidak ditemukan";
    document.getElementById("evDesc").textContent = "";
    return;
  }

  document.getElementById("evTitle").textContent = data.nama;
  document.getElementById("evDesc").textContent = data.keterangan || "";

  // reset form
  document.getElementById("voteForm").reset();
  document.getElementById("alasanGroup").style.display = "none";
  document.querySelectorAll(".option").forEach((o) =>
    o.classList.remove("selected-yes", "selected-no", "selected-maybe")
  );
  selectedStatus = null;

  loadDashboard();
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
  const cMaybe = rows.filter((r) => r.status === "mungkin").length;
  const total = rows.length;
  const totalMembers = Number(window.TOTAL_MEMBERS) || 0;

  document.getElementById("countYes").textContent = cYes;
  document.getElementById("countNo").textContent = cNo;
  document.getElementById("countMaybe").textContent = cMaybe;

  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  document.getElementById("pctYes").textContent = pct(cYes) + "%";
  document.getElementById("pctNo").textContent = pct(cNo) + "%";
  document.getElementById("pctMaybe").textContent = pct(cMaybe) + "%";
  document.getElementById("barYes").style.width = pct(cYes) + "%";
  document.getElementById("barNo").style.width = pct(cNo) + "%";
  document.getElementById("barMaybe").style.width = pct(cMaybe) + "%";

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
      const st = r.status || "mungkin";
      const symbols = { ya: "✓", tidak: "✗", mungkin: "?" };
      const symbol = symbols[st] || st;
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
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const { data } = await client.from("events").select("id,nama,keterangan,aktif").order("created_at", { ascending: false });

  const rows = (data || [])
    .map(
      (e) =>
        '<div class="admin-row">' +
        '<div class="ar-name">' + escapeHtml(e.nama) +
        '<div style="font-size:0.75rem;color:var(--muted);font-weight:400;">' +
        (e.aktif ? "Aktif" : "Nonaktif") + "</div></div>" +
        '<div class="ar-actions">' +
        '<button type="button" class="btn btn-sm" data-action="copyLink" data-id="' + e.id + '">🔗 Salin Link</button>' +
        '<button type="button" class="btn btn-sm ' + (e.aktif ? "btn-danger" : "btn-success") + '" data-action="toggleEvent" data-id="' + e.id + '" data-aktif="' + (e.aktif ? "true" : "false") + '">' +
        (e.aktif ? "Nonaktifkan" : "Aktifkan") + "</button>" +
        '<button type="button" class="btn btn-sm btn-danger" data-action="deleteEvent" data-id="' + e.id + '" data-nama="' + escapeHtml(e.nama) + '">Hapus</button>' +
        "</div></div>"
    )
    .join("");

  body.innerHTML =
    '<div class="form-group"><label for="evNama">Nama Event Baru</label>' +
    '<input type="text" id="evNama" placeholder="Contoh: Gathering Tahunan 2026" /></div>' +
    '<div class="form-group"><label for="evKet">Keterangan (opsional)</label>' +
    '<textarea id="evKet" placeholder="Deskripsi singkat kegiatan"></textarea></div>' +
    '<button type="button" class="btn" data-action="createEvent">Buat Event</button>' +
    '<div style="margin:16px 0;"><h3 style="font-size:1rem;">Daftar Event</h3>' +
    (rows || '<div class="empty">Belum ada event.</div>') + "</div>";
}

async function createEvent() {
  const nama = document.getElementById("evNama").value.trim();
  const ket = document.getElementById("evKet").value.trim();
  const client = getSupabase();
  if (!nama) { adminMsg("Nama event wajib diisi.", "error"); return; }
  const { error } = await client.from("events").insert({ nama, keterangan: ket });
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
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
  else if (a === "copyLink") copyLink(el.dataset.id);
  else if (a === "toggleEvent") toggleEvent(el.dataset.id, el.dataset.aktif === "true");
  else if (a === "deleteEvent") deleteEvent(el.dataset.id, el.dataset.nama);
});

// ---------- Init ----------
router();
