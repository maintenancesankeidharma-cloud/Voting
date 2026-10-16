let sbClient = null;
let selectedStatus = null;
let currentEventId = null;
let currentEventTotalMembers = 22; // fallback default

// Ambil total_members dari event di Supabase; fallback ke 22 jika belum diisi
async function loadEventTotalMembers() {
  if (!currentEventId) { currentEventTotalMembers = 22; return; }
  const { data, error } = await getSupabase()
    .from("events").select("total_members").eq("id", currentEventId).maybeSingle();
  if (error || !data) { currentEventTotalMembers = 22; return; }
  currentEventTotalMembers = Number(data.total_members) || 22;
}
let currentEventMode = "kehadiran";
let currentEventFotoPath = "";
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
  if (hash.startsWith("/penginapan")) { renderPenginapan(); return; }
  renderHome();
}
window.addEventListener("hashchange", router);

function goHome() { location.hash = "#/"; }

// ---------- HOME ----------
async function renderHome() {
  document.getElementById("viewHome").style.display = "block";
  document.getElementById("viewEvent").style.display = "none";
  document.getElementById("viewPenginapan").style.display = "none";
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
  document.getElementById("viewPenginapan").style.display = "none";
  document.getElementById("totalText").textContent = "Memuat...";
  currentEventId = id;

  await loadEventTotalMembers();

  const client = getSupabase();
  if (!client) { alert("Supabase belum dikonfigurasi."); return; }

  const { data, error } = await client
    .from("events")
    .select("id,nama,keterangan,aktif,mode,foto_path")
    .eq("id", id)
    .single();

  if (error || !data) {
    document.getElementById("evTitle").textContent = "Event tidak ditemukan";
    document.getElementById("evDesc").textContent = "";
    return;
  }

  document.getElementById("evTitle").textContent = data.nama;
  document.getElementById("evDesc").textContent = data.keterangan || "";

  currentEventMode = (data.mode === "gambar" || data.mode === "opsi") ? data.mode : "kehadiran";
  currentEventFotoPath = data.foto_path || "";

  // reset form
  document.getElementById("voteForm").reset();
  document.getElementById("alasanGroup").style.display = "none";
  document.querySelectorAll(".option").forEach((o) =>
    o.classList.remove("selected-yes", "selected-no", "selected-maybe")
  );
  document.getElementById("gVoteNama").value = "";
  document.getElementById("gambarMsg").textContent = "";
  document.getElementById("oVoteNama").value = "";
  document.getElementById("opsiMsg").textContent = "";

  const isGambar = currentEventMode === "gambar";
  const isOpsi = currentEventMode === "opsi";
  document.getElementById("formKehadiran").style.display = (isGambar || isOpsi) ? "none" : "block";
  document.getElementById("dashKehadiran").style.display = (isGambar || isOpsi) ? "none" : "block";
  document.getElementById("gambarPanel").style.display =isGambar ? "block" : "none";
  document.getElementById("opsiPanel").style.display = isOpsi ? "block" : "none";
  document.getElementById("panelVote").style.display = "block";

  if (isGambar) {
    loadGambar();
  } else if (isOpsi) {
    loadOpsi();
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
    // Cek duplikat case-insensitive: "Budi" dan "budi" dianggap sama
    const { data: existingRows, error: dupErr } = await client
      .from("responses")
      .select("nama")
      .eq("event_id", currentEventId)
      .limit(500);
    if (dupErr) throw dupErr;
    const alreadyVoted = (existingRows || []).some(
      (r) => String(r.nama || "").trim().toLowerCase() === nama.toLowerCase()
    );
    if (alreadyVoted) {
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
    const msg = String((err && err.message) || err || "");
    if (err && (err.code === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique"))) {
      showMessage("Nama ini sudah pernah mengirim voting untuk event ini.", "error");
    } else {
      showMessage("Gagal mengirim: " + msg, "error");
    }
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
  const totalMembers = currentEventTotalMembers;

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

// ---------- PENGINAPAN (GLOBAL, terpisah dari event) ----------
async function renderPenginapan() {
  document.getElementById("viewHome").style.display = "none";
  document.getElementById("viewEvent").style.display = "none";
  document.getElementById("viewPenginapan").style.display = "block";
  await loadVillaGlobal();
}

async function loadVillaGlobal() {
  const grid = document.getElementById("villaGrid");
  const note = document.getElementById("villaNote");
  const client = getSupabase();
  if (!client) { note.textContent = "Supabase belum dikonfigurasi."; grid.innerHTML = ""; return; }

  const [villaRes, evRes] = await Promise.all([
    client.from("villa").select("id,nama,foto_url,fasilitas,harga,event_id").order("created_at", { ascending: true }),
    client.from("events").select("id,nama"),
  ]);

  if (villaRes.error) { note.textContent = "Gagal memuat: " + (villaRes.error.message || villaRes.error); grid.innerHTML = ""; return; }

  const evMap = {};
  (evRes.data || []).forEach((e) => { evMap[e.id] = e.nama; });

  const rows = villaRes.data || [];
  note.textContent = rows.length ? rows.length + " pilihan penginapan." : "Belum ada data penginapan.";
  if (!rows.length) { grid.innerHTML = '<div class="empty">Belum ada data penginapan.</div>'; return; }

  grid.innerHTML = rows.map((v) =>
    '<div class="villa-card">' +
    (v.foto_url ? '<img src="' + escapeHtml(v.foto_url) + '" alt="' + escapeHtml(v.nama) + '" onclick="openLightbox(this.src)" onerror="villaImgError(this)" />' : '<div class="vc-noimg">Tanpa gambar</div>') +
    '<div class="vc-body">' +
    '<div class="vc-name">' + escapeHtml(v.nama) + "</div>" +
    (v.event_id && evMap[v.event_id] ? '<div class="gc-count">📅 ' + escapeHtml(evMap[v.event_id]) + "</div>" : "") +
    (v.fasilitas ? '<div class="vc-fas">' + escapeHtml(v.fasilitas) + "</div>" : "") +
    (v.harga ? '<div class="vc-price">' + escapeHtml(v.harga) + "</div>" : "") +
    "</div></div>"
  ).join("");
}

// ---------- VOTING DESIGN (GAMBAR) ----------
function gambarPublicUrl(path) {
  const clean = String(path || "").split("/").map((s) => encodeURIComponent(s)).join("/");
  return window.SUPABASE_URL + "/storage/v1/object/public/gambar/" + clean;
}

async function loadGambar() {
  const client = getSupabase();
  const gal = document.getElementById("gGallery");
  const note = document.getElementById("gNote");
  const sum = document.getElementById("gvoterSummary");

  if (!client) { note.textContent = "Supabase belum dikonfigurasi."; return; }

  const [uploadsRes, votesRes] = await Promise.all([
    client.from("gambar_uploads").select("id,nama,foto_path,created_at").eq("event_id", currentEventId).order("created_at", { ascending: true }),
    client.from("gambar_votes").select("id,upload_id,nama,created_at").eq("event_id", currentEventId).order("created_at", { ascending: true }),
  ]);

  if (uploadsRes.error) { note.textContent = "Gagal: " + uploadsRes.error.message; return; }

  const designs = uploadsRes.data || [];
  const votes = votesRes.data || [];
  const countMap = {};
  const votersByDesign = {};
  votes.forEach((v) => {
    countMap[v.upload_id] = (countMap[v.upload_id] || 0) + 1;
    (votersByDesign[v.upload_id] = votersByDesign[v.upload_id] || []).push(v.nama);
  });

  // Urutan sesuai filter: terbanyak (suara), terbaru upload, atau nama A-Z
  const sortMode = (document.getElementById("gSort") && document.getElementById("gSort").value) || "terbanyak";
  designs.sort((a, b) => {
    if (sortMode === "terbanyak") return (countMap[b.id] || 0) - (countMap[a.id] || 0);
    if (sortMode === "terbaru") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    return String(a.nama).localeCompare(String(b.nama), "id");
  });

  const totalMembers = currentEventTotalMembers;
  const votedNames = new Set(votes.map((v) => v.nama.toLowerCase()));
  sum.textContent = totalMembers > 0
    ? votes.length + " dari " + totalMembers + " member telah memilih (" + Math.round((votes.length / totalMembers) * 100) + "%)"
    : votes.length + " member telah memilih";

  note.textContent = designs.length ? designs.length + " pilihan design." : "Belum ada design. Admin belum menambah design.";

  // Daftar pemilih
  renderVoterTable(designs, votes);

  if (!designs.length) { gal.innerHTML = '<div class="empty">Belum ada design.</div>'; return; }

  const myVoteName = (document.getElementById("gVoteNama").value || "").trim().toLowerCase();
  const myVote = myVoteName ? votes.find((v) => v.nama.toLowerCase() === myVoteName) : null;

  gal.innerHTML = designs.map((u) => {
    const cnt = countMap[u.id] || 0;
    let label = "Pilih";
    let btnDisabled = !myVoteName;
    if (myVote) {
      if (myVote.upload_id === u.id) {
        label = "✓ Pilihan Anda";
        btnDisabled = true;
      } else {
        label = "Ganti ke ini";
        btnDisabled = false;
      }
    }
    const names = votersByDesign[u.id] || [];
    const namesHtml = names.length
      ? '<div class="gc-voters">👤 ' + names.map(escapeHtml).join(", ") + "</div>"
      : '<div class="gc-voters muted">Belum ada yang memilih</div>';
    return (
      '<div class="g-card">' +
      '<img src="' + escapeHtml(gambarPublicUrl(u.foto_path)) + '" alt="' + escapeHtml(u.nama) + '" onclick="openLightbox(this.src)" onerror="villaImgError(this)" />' +
      '<div class="gc-body">' +
      '<div class="gc-nama">' + escapeHtml(u.nama) + "</div>" +
      '<div class="gc-count">' + cnt + " suara</div>" +
      namesHtml +
      '<button type="button" class="gc-vote" data-upload-id="' + u.id + '"' + (btnDisabled ? " disabled" : "") + '>' + label + '</button>' +
      "</div></div>"
    );
  }).join("");
}

function renderVoterTable(designs, votes) {
  const tbody = document.getElementById("gVoterTable");
  const noteEl = document.getElementById("gVoterListNote");
  if (!tbody) return;
  const nameMap = {};
  designs.forEach((d) => { nameMap[d.id] = d.nama; });
  if (!votes.length) {
    if (noteEl) noteEl.textContent = "Belum ada yang memilih.";
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Belum ada yang memilih.</td></tr>';
    return;
  }
  if (noteEl) noteEl.textContent = votes.length + " orang sudah memilih.";
  tbody.innerHTML = votes.map((v) => {
    const time = v.created_at
      ? new Date(v.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "–";
    return "<tr><td>" + escapeHtml(v.nama) + "</td><td>" + escapeHtml(nameMap[v.upload_id] || "-") + "</td><td>" + time + "</td></tr>";
  }).join("");
}

async function voteGambar(uploadId) {
  const nama = (document.getElementById("gVoteNama").value || "").trim();
  if (!nama) { alert("Isi nama Anda dulu untuk memilih design."); return; }

  const client = getSupabase();
  if (!client) return;

  // Cek duplikat case-insensitive: "Budi" dan "budi" dianggap sama
  const { data: existingVotes, error: dupErr } = await client
    .from("gambar_votes").select("id,nama")
    .eq("event_id", currentEventId)
    .limit(500);
  if (dupErr) { alert("Gagal memeriksa pilihan: " + (dupErr.message || dupErr)); return; }
  const mine = (existingVotes || []).find(
    (v) => String(v.nama || "").trim().toLowerCase() === nama.toLowerCase()
  );

  if (mine) {
    if (!confirm("Anda sudah pernah memilih. Ganti pilihan ke design ini?")) return;
    const { error: delErr } = await client
      .from("gambar_votes").delete()
      .eq("id", mine.id);
    if (delErr) { alert("Gagal mengganti: " + (delErr.message || delErr)); return; }
  }

  const { error } = await client.from("gambar_votes").insert({ event_id: currentEventId, upload_id: uploadId, nama });
  if (error) { alert("Gagal memilih: " + (error.message || error)); return; }
  alert(mine ? "Pilihan berhasil diganti!" : "Pilihan tersimpan. Terima kasih!");
  loadGambar();
}

// ---------- VOTING OPSI (banyak pertanyaan, 1 orang 1 suara per pertanyaan) ----------
async function loadOpsi() {
  const client = getSupabase();
  const gal = document.getElementById("oGallery");
  const note = document.getElementById("oNote");
  const sum = document.getElementById("ovoterSummary");
  if (!gal || !note || !sum) return;

  if (!client) { note.textContent = "Supabase belum dikonfigurasi."; return; }

  const [qRes, optRes, voteRes] = await Promise.all([
    client.from("opsi_questions").select("id,pertanyaan,keterangan,foto_path,urutan,created_at").eq("event_id", currentEventId).order("urutan", { ascending: true }).order("created_at", { ascending: true }),
    client.from("opsi_options").select("id,nama,keterangan,created_at").eq("event_id", currentEventId).order("created_at", { ascending: true }),
    client.from("opsi_votes").select("id,question_id,option_id,nama,created_at").eq("event_id", currentEventId).order("created_at", { ascending: true }),
  ]);

  if (qRes.error) {
    const msg = String(qRes.error.message || qRes.error);
    if (msg.includes("opsi_questions") || qRes.error.code === "42P01") {
      note.textContent = "Tabel opsi belum ada. Jalankan supabase-schema.sql terbaru di Supabase SQL Editor.";
    } else {
      note.textContent = "Gagal: " + msg;
    }
    return;
  }
  if (optRes.error) { note.textContent = "Gagal: " + (optRes.error.message || optRes.error); return; }
  if (voteRes.error) { note.textContent = "Gagal: " + (voteRes.error.message || voteRes.error); return; }

  const questions = qRes.data || [];
  const options = optRes.data || [];
  const votes = voteRes.data || [];

  const qIds = questions.map((q) => q.id);
  let links = [];
  if (qIds.length) {
    const { data: lk } = await client.from("opsi_question_options").select("question_id,option_id,urutan").in("question_id", qIds);
    links = lk || [];
  }

  const optMap = {};
  options.forEach((o) => { optMap[o.id] = o; });
  const linksByQ = {};
  questions.forEach((q) => { linksByQ[q.id] = []; });
  links.forEach((l) => { if (linksByQ[l.question_id]) linksByQ[l.question_id].push(l); });

  const votesByQ = {};
  questions.forEach((q) => { votesByQ[q.id] = []; });
  votes.forEach((v) => { (votesByQ[v.question_id] = votesByQ[v.question_id] || []).push(v); });

  const totalMembers = currentEventTotalMembers;
  const distinctVoters = new Set(votes.map((v) => String(v.nama || "").trim().toLowerCase())).size;
  sum.textContent = totalMembers > 0
    ? distinctVoters + " dari " + totalMembers + " member telah memilih"
    : distinctVoters + " member telah memilih";

  note.textContent = questions.length
    ? questions.length + " pertanyaan, " + options.length + " opsi."
    : "Belum ada pertanyaan. Admin belum menambah pertanyaan.";
  renderOpsiVoterTable(questions, options, votes);

  if (!questions.length) { gal.innerHTML = '<div class="empty">Belum ada pertanyaan.</div>'; return; }

  const myName = (document.getElementById("oVoteNama").value || "").trim().toLowerCase();
  const sortMode = (document.getElementById("oSort") && document.getElementById("oSort").value) || "terbanyak";

  gal.innerHTML = questions.map((q, qi) => {
    const qLinks = linksByQ[q.id].slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    const qOpts = qLinks.map((l) => optMap[l.option_id]).filter(Boolean);
    const qVotes = votesByQ[q.id] || [];
    const countMap = {};
    const votersByOption = {};
    qVotes.forEach((v) => {
      countMap[v.option_id] = (countMap[v.option_id] || 0) + 1;
      (votersByOption[v.option_id] = votersByOption[v.option_id] || []).push(v.nama);
    });
    const myVote = myName ? qVotes.find((v) => String(v.nama || "").trim().toLowerCase() === myName) : null;
    const totalVotes = qVotes.length || 1;

    qOpts.sort((a, b) => {
      if (sortMode === "terbanyak") return (countMap[b.id] || 0) - (countMap[a.id] || 0);
      if (sortMode === "terbaru") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return String(a.nama).localeCompare(String(b.nama), "id");
    });

    const cards = qOpts.length ? qOpts.map((o) => {
      const cnt = countMap[o.id] || 0;
      const pct = Math.round((cnt / totalVotes) * 100);
      let label = "Pilih";
      let btnDisabled = !myName;
      if (myVote) {
        if (myVote.option_id === o.id) { label = "✓ Pilihan Anda"; btnDisabled = true; }
        else { label = "Ganti ke ini"; btnDisabled = false; }
      }
      const names = votersByOption[o.id] || [];
      const namesHtml = names.length
        ? '<div class="gc-voters">👤 ' + names.map(escapeHtml).join(", ") + "</div>"
        : '<div class="gc-voters muted">Belum ada yang memilih</div>';
      return (
        '<div class="g-card">' +
        '<div class="gc-body">' +
        '<div class="gc-nama">' + escapeHtml(o.nama) + "</div>" +
        (o.keterangan ? '<div class="gc-count">' + escapeHtml(o.keterangan) + "</div>" : "") +
        '<div class="gc-count">' + cnt + " suara (" + pct + "%)</div>" +
        '<div class="bar-track" style="height:10px;"><div class="bar-fill fill-yes" style="width:' + pct + '%"></div></div>' +
        namesHtml +
        '<button type="button" class="gc-vote" data-question-id="' + q.id + '" data-option-id="' + o.id + '"' + (btnDisabled ? " disabled" : "") + '>' + label + '</button>' +
        "</div></div>"
      );
    }).join("") : '<div class="empty">Belum ada opsi untuk pertanyaan ini.</div>';

    const imgHtml = q.foto_path
      ? '<img src="' + escapeHtml(gambarPublicUrl(q.foto_path)) + '" alt="Gambar pertanyaan" style="max-width:100%;max-height:280px;border-radius:12px;display:block;margin:10px 0;cursor:zoom-in;" onclick="openLightbox(this.src)" onerror="this.style.display=\'none\'" />'
      : "";

    return (
      '<div class="opsi-qblock" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:20px;">' +
      '<h3 style="font-size:1rem;margin-bottom:2px;">' + (qi + 1) + ". " + escapeHtml(q.pertanyaan) + "</h3>" +
      (q.keterangan ? '<div class="dashboard-note" style="margin-bottom:4px;">' + escapeHtml(q.keterangan) + "</div>" : "") +
      imgHtml +
      '<div class="dashboard-note">' + qVotes.length + " dari " + (totalMembers || "-") + " member menjawab.</div>" +
      '<div class="gallery">' + cards + "</div>" +
      "</div>"
    );
  }).join("");
}

function renderOpsiVoterTable(questions, options, votes) {
  const tbody = document.getElementById("oVoterTable");
  const noteEl = document.getElementById("oVoterListNote");
  if (!tbody) return;
  const qMap = {};
  questions.forEach((q) => { qMap[q.id] = q.pertanyaan; });
  const oMap = {};
  options.forEach((o) => { oMap[o.id] = o.nama; });
  if (!votes.length) {
    if (noteEl) noteEl.textContent = "Belum ada yang memilih.";
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Belum ada yang memilih.</td></tr>';
    return;
  }
  if (noteEl) noteEl.textContent = votes.length + " jawaban tersimpan.";
  tbody.innerHTML = votes.map((v) => {
    const time = v.created_at
      ? new Date(v.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "–";
    return "<tr><td>" + escapeHtml(v.nama) + "</td><td>" + escapeHtml(qMap[v.question_id] || "-") + "</td><td>" + escapeHtml(oMap[v.option_id] || "-") + "</td><td>" + time + "</td></tr>";
  }).join("");
}

async function voteOpsi(questionId, optionId) {
  const nama = (document.getElementById("oVoteNama").value || "").trim();
  if (!nama) { alert("Isi nama Anda dulu untuk memilih opsi."); return; }
  const client = getSupabase();
  if (!client) return;

  const { data: existingVotes, error: dupErr } = await client
    .from("opsi_votes").select("id,option_id,nama")
    .eq("event_id", currentEventId)
    .eq("question_id", questionId)
    .limit(500);
  if (dupErr) { alert("Gagal memeriksa pilihan: " + (dupErr.message || dupErr)); return; }
  const mine = (existingVotes || []).find(
    (v) => String(v.nama || "").trim().toLowerCase() === nama.toLowerCase()
  );

  if (mine) {
    if (mine.option_id === optionId) { alert("Ini sudah pilihan Anda."); return; }
    if (!confirm("Anda sudah menjawab pertanyaan ini. Ganti pilihan ke opsi ini?")) return;
    const { error: delErr } = await client.from("opsi_votes").delete().eq("id", mine.id);
    if (delErr) { alert("Gagal mengganti: " + (delErr.message || delErr)); return; }
  }

  const { error } = await client.from("opsi_votes").insert({ event_id: currentEventId, question_id: questionId, option_id: optionId, nama });
  if (error) {
    const msg = String(error.message || error);
    if (error.code === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      alert("Nama ini sudah pernah menjawab pertanyaan ini.");
    } else {
      alert("Gagal memilih: " + msg);
    }
    return;
  }
  alert(mine ? "Pilihan berhasil diganti!" : "Pilihan tersimpan. Terima kasih!");
  loadOpsi();
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

async function deleteDesign(id, fotoPath) {
  if (!confirm("Hapus design ini?")) return;
  const client = getSupabase();
  const { error } = await client.from("gambar_uploads").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  // Hapus file di Storage agar tidak jadi orphan (diabaikan jika gagal)
  if (fotoPath) {
    const { error: storageErr } = await client.storage.from("gambar").remove([fotoPath]);
    if (storageErr) { adminMsg("Data terhapus, tapi file gambar gagal dihapus: " + storageErr.message, "error"); }
  }
  manageDesign(currentDesignEventId);
}

// ---------- ADMIN: KELOLA OPSI (pertanyaan + opsi reusable) ----------
let currentOpsiEventId = null;

async function manageOpsi(eventId) {
  currentOpsiEventId = eventId;
  const body = document.getElementById("adminBody");
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const backBtn = '<button type="button" class="btn-back" data-action="backEvents" style="margin-bottom:14px;">← Kembali ke Event</button>';
  const { data: ev } = await client.from("events").select("nama").eq("id", eventId).single();
  const qRes = await client.from("opsi_questions").select("id,pertanyaan,keterangan,foto_path,urutan,created_at").eq("event_id", eventId).order("urutan", { ascending: true }).order("created_at", { ascending: true });
  if (qRes.error) {
    const msg = String(qRes.error.message || qRes.error);
    if (msg.includes("opsi_questions") || qRes.error.code === "42P01") {
      body.innerHTML = backBtn + '<div class="message error" style="display:block;">Tabel pertanyaan opsi belum ada. Jalankan <b>supabase-schema.sql</b> terbaru di Supabase SQL Editor, lalu buka lagi.</div>';
      return;
    }
    body.innerHTML = backBtn + '<div class="empty">' + escapeHtml(msg) + "</div>";
    return;
  }

  const questions = qRes.data || [];
  const { data: optData } = await client.from("opsi_options").select("id,nama,keterangan,created_at").eq("event_id", eventId).order("created_at", { ascending: true });
  const options = optData || [];
  const qIds = questions.map((q) => q.id);
  let links = [];
  if (qIds.length) {
    const { data: lk } = await client.from("opsi_question_options").select("question_id,option_id,urutan").in("question_id", qIds);
    links = lk || [];
  }
  const { data: voteData } = await client.from("opsi_votes").select("id,question_id,option_id").eq("event_id", eventId).limit(1000);
  const votes = voteData || [];

  const optMap = {};
  options.forEach((o) => { optMap[o.id] = o; });
  const countByOption = {};
  votes.forEach((v) => { countByOption[v.option_id] = (countByOption[v.option_id] || 0) + 1; });
  const linksByQ = {};
  questions.forEach((q) => { linksByQ[q.id] = []; });
  links.forEach((l) => { if (linksByQ[l.question_id]) linksByQ[l.question_id].push(l); });

  const usedBefore = [];
  const blocks = questions.map((q, qi) => {
    const qLinks = linksByQ[q.id].slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    const qOpts = qLinks.map((l) => optMap[l.option_id]).filter(Boolean);
    const qOptIds = new Set(qOpts.map((o) => o.id));

    const optRows = qOpts.length ? qOpts.map((o) =>
      '<div class="admin-row">' +
      '<div class="ar-name">' + escapeHtml(o.nama) +
      (o.keterangan ? '<div style="font-size:0.75rem;color:var(--muted);font-weight:400;">' + escapeHtml(o.keterangan) + "</div>" : "") +
      '<div style="font-size:0.72rem;color:var(--muted);font-weight:400;">' + (countByOption[o.id] || 0) + " suara</div>" +
      "</div>" +
      '<div class="ar-actions"><button type="button" class="btn btn-sm btn-danger" data-action="removeOpsiOption" data-qid="' + q.id + '" data-oid="' + o.id + '">Hapus dari pertanyaan</button></div>' +
      "</div>"
    ).join("") : '<div class="empty">Belum ada opsi di pertanyaan ini.</div>';

    const candidates = [];
    usedBefore.forEach((oid) => { if (!qOptIds.has(oid) && optMap[oid]) candidates.push(optMap[oid]); });
    const reuseHtml = candidates.length
      ? '<div style="margin-top:12px;border-top:1px dashed var(--border);padding-top:10px;">' +
        '<div style="font-size:0.82rem;color:var(--muted);margin-bottom:4px;">Gunakan opsi dari pertanyaan sebelumnya:</div>' +
        candidates.map((o) =>
          '<label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;padding:3px 0;">' +
          '<input type="checkbox" class="reuse-cb" data-qid="' + q.id + '" value="' + o.id + '" /> ' +
          escapeHtml(o.nama) + (o.keterangan ? ' <span style="color:var(--muted);font-size:0.75rem;">(' + escapeHtml(o.keterangan) + ")</span>" : "") +
          "</label>"
        ).join("") +
        '<button type="button" class="btn btn-sm" style="width:auto;margin-top:6px;" data-action="attachOpsiOptions" data-id="' + q.id + '">Tambahkan opsi terpilih</button>' +
        "</div>"
      : "";

    qOpts.forEach((o) => usedBefore.push(o.id));

    const imgHtml = q.foto_path
      ? '<img src="' + escapeHtml(gambarPublicUrl(q.foto_path)) + '" style="max-width:100%;max-height:160px;border-radius:10px;display:block;margin:8px 0;cursor:zoom-in;" onclick="openLightbox(this.src)" onerror="this.style.display=\'none\'" />'
      : '<div class="dashboard-note" style="font-style:italic;margin:6px 0;">Belum ada gambar pertanyaan.</div>';

    return '<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
      '<div><h3 style="font-size:0.98rem;margin-bottom:2px;">' + (qi + 1) + ". " + escapeHtml(q.pertanyaan) + "</h3>" +
      (q.keterangan ? '<div style="font-size:0.78rem;color:var(--muted);">' + escapeHtml(q.keterangan) + "</div>" : "") +
      "</div>" +
      '<button type="button" class="btn btn-sm btn-danger" data-action="deleteOpsiQuestion" data-id="' + q.id + '" style="width:auto;">Hapus</button>' +
      "</div>" +
      imgHtml +
      '<div class="form-group" style="margin:8px 0;"><label>Gambar pertanyaan (opsional)</label><input type="file" id="qFile_' + q.id + '" accept="image/*" /></div>' +
      '<button type="button" class="btn btn-sm btn-success" style="width:auto;" data-action="saveQuestionImage" data-id="' + q.id + '">Simpan Gambar</button>' +
      (q.foto_path ? ' <button type="button" class="btn btn-sm btn-danger" style="width:auto;" data-action="removeQuestionImage" data-id="' + q.id + '">Hapus Gambar</button>' : "") +
      '<div style="margin-top:12px;"><h4 style="font-size:0.85rem;margin-bottom:6px;">Opsi pertanyaan ini</h4>' + optRows + "</div>" +
      '<div class="form-group" style="margin-top:10px;"><label>Tambah opsi baru</label><input type="text" id="qoNama_' + q.id + '" placeholder="Nama opsi" /></div>' +
      '<div class="form-group"><input type="text" id="qoKet_' + q.id + '" placeholder="Keterangan (opsional)" /></div>' +
      '<button type="button" class="btn btn-sm" style="width:auto;" data-action="addOpsiOption" data-id="' + q.id + '">Tambah Opsi Baru</button>' +
      reuseHtml +
      "</div>";
  }).join("");

  body.innerHTML =
    backBtn +
    '<h2 style="font-size:1.1rem;margin-bottom:4px;">🗳️ Opsi: ' + escapeHtml(ev ? ev.nama : "") + "</h2>" +
    '<div class="dashboard-note">Bisa banyak pertanyaan. Tiap orang 1 suara per pertanyaan. Opsi bisa dipakai ulang dari pertanyaan sebelumnya.</div>' +
    '<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px;">' +
    '<h3 style="font-size:0.95rem;margin-bottom:6px;">➕ Tambah Pertanyaan</h3>' +
    '<div class="form-group"><label for="oqPertanyaan">Pertanyaan</label><input type="text" id="oqPertanyaan" placeholder="Contoh: Pilih penginapan" /></div>' +
    '<div class="form-group"><label for="oqKeterangan">Keterangan (opsional)</label><input type="text" id="oqKeterangan" placeholder="Contoh: untuk tanggal 20 Des" /></div>' +
    '<div class="form-group"><label for="oqFoto">Gambar pertanyaan (opsional)</label><input type="file" id="oqFoto" accept="image/*" /></div>' +
    '<button type="button" class="btn btn-sm btn-success" style="width:auto;" data-action="addOpsiQuestion">Tambah Pertanyaan</button>' +
    "</div>" +
    '<div style="margin:16px 0;"><h3 style="font-size:1rem;margin-bottom:10px;">Daftar Pertanyaan</h3>' +
    (blocks || '<div class="empty">Belum ada pertanyaan.</div>') + "</div>";
}

async function addOpsiQuestion() {
  const pertanyaan = (document.getElementById("oqPertanyaan").value || "").trim();
  const keterangan = (document.getElementById("oqKeterangan").value || "").trim();
  const fileEl = document.getElementById("oqFoto");
  const file = fileEl && fileEl.files[0];
  if (!pertanyaan) { adminMsg("Pertanyaan wajib diisi.", "error"); return; }
  const client = getSupabase();
  if (!client) return;

  let path = "";
  try {
    if (file) {
      if (!file.type.match(/image/)) { adminMsg("File harus berupa gambar.", "error"); return; }
      path = currentOpsiEventId + "/soal-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { error: upErr } = await client.storage.from("gambar").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
    }
    const { data: maxRow } = await client.from("opsi_questions").select("urutan").eq("event_id", currentOpsiEventId).order("urutan", { ascending: false }).limit(1);
    const urutan = (maxRow && maxRow[0] && Number(maxRow[0].urutan)) || 0;
    const { error } = await client.from("opsi_questions").insert({ event_id: currentOpsiEventId, pertanyaan, keterangan, foto_path: path, urutan: urutan + 1 });
    if (error) throw error;
    manageOpsi(currentOpsiEventId);
  } catch (err) {
    adminMsg("Gagal: " + (err.message || err), "error");
  }
}

async function deleteOpsiQuestion(id) {
  if (!confirm("Hapus pertanyaan ini beserta opsi terpasang & suaranya?")) return;
  const client = getSupabase();
  if (!client) return;
  const { data: q } = await client.from("opsi_questions").select("foto_path").eq("id", id).single();
  const { error } = await client.from("opsi_questions").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  if (q && q.foto_path) { await client.storage.from("gambar").remove([q.foto_path]); }
  manageOpsi(currentOpsiEventId);
}

async function addOpsiOption(questionId) {
  const namaEl = document.getElementById("qoNama_" + questionId);
  const ketEl = document.getElementById("qoKet_" + questionId);
  const nama = (namaEl && namaEl.value || "").trim();
  const keterangan = (ketEl && ketEl.value || "").trim();
  if (!nama) { adminMsg("Nama opsi wajib diisi.", "error"); return; }
  const client = getSupabase();
  if (!client) return;

  let optionId = null;
  const { data: existing } = await client.from("opsi_options").select("id,nama").eq("event_id", currentOpsiEventId).limit(500);
  const found = (existing || []).find((o) => String(o.nama).trim().toLowerCase() === nama.toLowerCase());
  if (found) {
    optionId = found.id;
  } else {
    const { data: ins, error } = await client.from("opsi_options").insert({ event_id: currentOpsiEventId, nama, keterangan }).select("id").single();
    if (error) {
      const msg = String(error.message || error);
      if (error.code === "23505" || msg.toLowerCase().includes("duplicate")) {
        const { data: again } = await client.from("opsi_options").select("id,nama").eq("event_id", currentOpsiEventId).limit(500);
        const f2 = (again || []).find((o) => String(o.nama).trim().toLowerCase() === nama.toLowerCase());
        if (!f2) { adminMsg("Gagal: " + msg, "error"); return; }
        optionId = f2.id;
      } else { adminMsg("Gagal: " + msg, "error"); return; }
    } else optionId = ins.id;
  }

  const { error: linkErr } = await client.from("opsi_question_options").insert({ question_id: questionId, option_id: optionId });
  if (linkErr) {
    const msg = String(linkErr.message || linkErr);
    if (linkErr.code === "23505" || msg.toLowerCase().includes("duplicate")) adminMsg("Opsi ini sudah ada di pertanyaan ini.", "error");
    else adminMsg("Gagal: " + msg, "error");
    return;
  }
  manageOpsi(currentOpsiEventId);
}

async function attachOpsiOptions(questionId) {
  const boxes = Array.prototype.slice.call(document.querySelectorAll('.reuse-cb[data-qid="' + questionId + '"]:checked'));
  if (!boxes.length) { adminMsg("Pilih minimal satu opsi dulu.", "error"); return; }
  const client = getSupabase();
  if (!client) return;
  const rows = boxes.map((b) => ({ question_id: questionId, option_id: b.value }));
  const { error } = await client.from("opsi_question_options").insert(rows);
  if (error) {
    const msg = String(error.message || error);
    if (error.code === "23505" || msg.toLowerCase().includes("duplicate")) adminMsg("Ada opsi yang sudah terpasang.", "error");
    else adminMsg("Gagal: " + msg, "error");
    return;
  }
  manageOpsi(currentOpsiEventId);
}

async function removeOpsiOption(questionId, optionId) {
  if (!confirm("Hapus opsi ini dari pertanyaan? (opsi tetap tersimpan di pustaka untuk dipakai ulang)")) return;
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from("opsi_question_options").delete().eq("question_id", questionId).eq("option_id", optionId);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  await client.from("opsi_votes").delete().eq("question_id", questionId).eq("option_id", optionId);
  manageOpsi(currentOpsiEventId);
}

async function saveQuestionImage(questionId) {
  const fileEl = document.getElementById("qFile_" + questionId);
  const file = fileEl && fileEl.files[0];
  if (!file) { adminMsg("Pilih file gambar dulu.", "error"); return; }
  if (!file.type.match(/image/)) { adminMsg("File harus berupa gambar.", "error"); return; }
  const client = getSupabase();
  if (!client) return;
  try {
    const path = currentOpsiEventId + "/soal-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: upErr } = await client.storage.from("gambar").upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { data: q } = await client.from("opsi_questions").select("foto_path").eq("id", questionId).single();
    const oldPath = q && q.foto_path;
    const { error } = await client.from("opsi_questions").update({ foto_path: path }).eq("id", questionId);
    if (error) throw error;
    if (oldPath && oldPath !== path) { await client.storage.from("gambar").remove([oldPath]); }
    manageOpsi(currentOpsiEventId);
  } catch (err) {
    adminMsg("Gagal: " + (err.message || err), "error");
  }
}

async function removeQuestionImage(questionId) {
  if (!confirm("Hapus gambar pertanyaan ini?")) return;
  const client = getSupabase();
  if (!client) return;
  const { data: q } = await client.from("opsi_questions").select("foto_path").eq("id", questionId).single();
  const oldPath = q && q.foto_path;
  const { error } = await client.from("opsi_questions").update({ foto_path: "" }).eq("id", questionId);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  if (oldPath) { await client.storage.from("gambar").remove([oldPath]); }
  manageOpsi(currentOpsiEventId);
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

function promptTotalMembers(current, onSave) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = current || 22;
  input.min = "1";
  input.className = "admin-input";
  input.style.marginRight = "8px";
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.textContent = "Simpan";
  confirmBtn.className = "btn btn-sm btn-primary";
  confirmBtn.onclick = () => onSave(Number(input.value));
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Batal";
  cancelBtn.className = "btn btn-sm";
  cancelBtn.onclick = () => onSave(null);
  const d = document.createElement("div");
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.style.gap = "8px";
  d.style.margin = "16px 0";
  d.appendChild(input);
  d.appendChild(confirmBtn);
  d.appendChild(cancelBtn);
  document.getElementById("adminBody").appendChild(d);
  // focus input otomatis
  setTimeout(() => input.focus(), 100);
}

async function setTotalMembers(id) {
  if (!confirm("Masukkan total member baru untuk event ini?")) return;
  const val = prompt("Total member baru (angka):") || "";
  if (val === null) return;
  const n = Number(val);
  if (!n || n < 1) { alert("Masukkan angka valid > 0."); return; }
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from("events").update({ total_members: n }).eq("id", id);
  if (error) { alert("Gagal update: " + error.message); return; }
  alert("Total member berhasil diupdate menjadi " + n + ".");
  renderAdmin();
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
        (e.mode === "gambar" ? "Voting Gambar" : e.mode === "opsi" ? "Voting Opsi" : "Voting Kehadiran") + " &bull; " +
        (e.aktif ? "Aktif" : "Nonaktif") + "</div></div>" +
'<div class="ar-actions">' +
        '<button type="button" class="btn btn-sm" data-action="editEvent" data-id="' + e.id + '" data-nama="' + escapeHtml(e.nama) + '" data-ket="' + escapeHtml(e.keterangan || "") + '" data-mode="' + (e.mode || "kehadiran") + '">Edit</button>' +
        (e.mode === "gambar" ? '<button type="button" class="btn btn-sm" data-action="manageDesign" data-id="' + e.id + '">Design</button>' : "") +
        (e.mode === "opsi" ? '<button type="button" class="btn btn-sm" data-action="manageOpsi" data-id="' + e.id + '">Opsi</button>' : "") +
        '<button type="button" class="btn btn-sm" data-action="copyLink" data-id="' + e.id + '">Salin Link</button>' +
        '<button type="button" class="btn btn-sm" data-action="setTotalMembers" data-id="' + e.id + '">Total Members</button>' +
        '<button type="button" class="btn btn-sm ' + (e.aktif ? "btn-danger" : "btn-success") + '" data-action="toggleEvent" data-id="' + e.id + '" data-aktif="' + (e.aktif ? "true" : "false") + '">' +
        (e.aktif ? "Nonaktifkan" : "Aktifkan") + "</button>" +
        '<button type="button" class="btn btn-sm btn-danger" data-action="deleteEvent" data-id="' + e.id + '" data-nama="' + escapeHtml(e.nama) + '">Hapus</button>' +
        "</div></div>"
    )
    .join("");

  body.innerHTML =
    '<button type="button" class="btn" data-action="manageVillaGlobal" style="margin-bottom:18px;">🏠 Kelola Katalog Penginapan</button>' +
    '<div class="dashboard-note" id="evFormNote">Buat event baru.</div>' +
    '<div class="form-group"><label for="evNama">Nama Event</label>' +
    '<input type="text" id="evNama" placeholder="Contoh: Gathering Tahunan 2026" /></div>' +
    '<div class="form-group"><label for="evKet">Keterangan (opsional)</label>' +
    '<textarea id="evKet" placeholder="Deskripsi singkat kegiatan"></textarea></div>' +
    '<div class="form-group"><label for="evMode">Jenis Voting</label>' +
    '<select id="evMode">' +
    '<option value="kehadiran">Voting Kehadiran (Ya / Tidak)</option>' +
    '<option value="gambar">Voting Gambar (Upload & Vote)</option>' +
    '<option value="opsi">Voting Opsi (beberapa pilihan)</option>' +
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

// ---------- ADMIN: KELOLA VILLA (penginapan, global) ----------
let currentVillaId = null;
let currentEditEventId = null;

async function manageVilla() {
  currentVillaId = null;
  const body = document.getElementById("adminBody");
  const client = getSupabase();
  if (!client) { body.innerHTML = '<div class="empty">Supabase belum dikonfigurasi.</div>'; return; }

  const { data, error } = await client.from("villa").select("id,nama,foto_url,fasilitas,harga").order("created_at", { ascending: true });
  if (error) { body.innerHTML = '<div class="empty">Gagal memuat: ' + escapeHtml(error.message || String(error)) + "</div>"; return; }

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
    '<button type="button" class="btn-back" data-action="backEvents" style="margin-bottom:14px;">← Kembali</button>' +
    '<h2 style="font-size:1.1rem;margin-bottom:4px;">🏠 Katalog Penginapan</h2>' +
    '<div class="dashboard-note">Katalog ini terpisah dari event dan tampil untuk semua kegiatan.</div>' +
    '<div class="dashboard-note" id="villaFormNote">Tambah pilihan penginapan.</div>' +
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
    const { error } = await client.from("villa").insert({ nama, foto_url: foto, fasilitas: fas, harga });
    if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  }
  manageVilla();
}

async function deleteVilla(id) {
  if (!confirm("Hapus villa ini?")) return;
  const client = getSupabase();
  const { error } = await client.from("villa").delete().eq("id", id);
  if (error) { adminMsg("Gagal: " + error.message, "error"); return; }
  manageVilla();
}

function villaImgError(img) {
  img.outerHTML = '<div class="vc-noimg">Gambar tidak tersedia</div>';
}

function openLightbox(src) {
  if (!src) return;
  document.getElementById("lightboxImg").src = src;
  document.getElementById("lightbox").classList.add("open");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.getElementById("lightboxImg").src = "";
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  else if (a === "toggleEvent") toggleEvent(el.dataset.id, el.dataset.aktif !== "true");
  else if (a === "deleteEvent") deleteEvent(el.dataset.id, el.dataset.nama);
  else if (a === "manageVillaGlobal") manageVilla();
  else if (a === "manageVilla") manageVilla();
  else if (a === "manageDesign") manageDesign(el.dataset.id);
  else if (a === "manageOpsi") manageOpsi(el.dataset.id);
  else if (a === "addOpsiQuestion") addOpsiQuestion();
  else if (a === "deleteOpsiQuestion") deleteOpsiQuestion(el.dataset.id);
  else if (a === "addOpsiOption") addOpsiOption(el.dataset.id);
  else if (a === "attachOpsiOptions") attachOpsiOptions(el.dataset.id);
  else if (a === "removeOpsiOption") removeOpsiOption(el.dataset.qid, el.dataset.oid);
  else if (a === "saveQuestionImage") saveQuestionImage(el.dataset.id);
  else if (a === "removeQuestionImage") removeQuestionImage(el.dataset.id);
  else if (a === "addDesign") addDesign();
  else if (a === "deleteDesign") deleteDesign(el.dataset.id, el.dataset.path);
  else if (a === "addVilla") addVilla();
  else if (a === "editVilla") editVilla(el.dataset.id);
  else if (a === "deleteVilla") deleteVilla(el.dataset.id);
  else if (a === "backEvents") renderAdmin();
  else if (a === "setTotalMembers") setTotalMembers(el.dataset.id);
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
document.getElementById("oGallery").addEventListener("click", function (ev) {
  const el = ev.target.closest("[data-option-id]");
  if (!el) return;
  voteOpsi(el.dataset.questionId, el.dataset.optionId);
});
document.getElementById("oVoteNama").addEventListener("input", function () {
  if (currentEventMode === "opsi") loadOpsi();
});
router();
