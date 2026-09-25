let supabase = null;
let selectedStatus = null;

// Status label & badge helpers
const STATUS_LABEL = { ya: "Ya, Hadir", tidak: "Tidak Hadir", mungkin: "Mungkin" };

function getSupabase() {
  if (supabase) return supabase;
  const url = window.SUPABASE_URL || "";
  const key = window.SUPABASE_ANON_KEY || "";
  if (!url.startsWith("http") || key.indexOf(".") < 0) {
    return null; // belum dikonfigurasi
  }
  supabase = window.supabase.createClient(url, key);
  return supabase;
}

function selectOption(el) {
  document.querySelectorAll(".option").forEach((o) =>
    o.classList.remove("selected-yes", "selected-no", "selected-maybe")
  );
  const v = el.dataset.value;
  selectedStatus = v;
  el.classList.add(v === "ya" ? "selected-yes" : v === "tidak" ? "selected-no" : "selected-maybe");
}

function showMessage(text, type) {
  const m = document.getElementById("message");
  m.className = "message " + type;
  m.textContent = text;
}

async function submitVote() {
  const nama = document.getElementById("nama").value.trim();
  const kontak = document.getElementById("kontak").value.trim();
  const btn = document.getElementById("submitBtn");

  showMessage("", "success"); // reset

  if (!nama) return showMessage("Nama wajib diisi.", "error");
  if (!kontak) return showMessage("Kontak wajib diisi.", "error");
  if (!selectedStatus) return showMessage("Pilih salah satu status kehadiran.", "error");

  const client = getSupabase();
  if (!client) {
    showMessage("Supabase belum dikonfigurasi. Isi config.js dengan URL & anon key.", "warning");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Mengirim...";
  try {
    const { error } = await client.from("responses").insert({
      nama: nama,
      kontak: kontak,
      status: selectedStatus,
    });
    if (error) throw error;

    showMessage("Voting berhasil dikirim. Terima kasih!", "success");
    document.getElementById("nama").value = "";
    document.getElementById("kontak").value = "";
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
  const yes = document.getElementById("countYes");
  const no = document.getElementById("countNo");
  const maybe = document.getElementById("countMaybe");
  const body = document.getElementById("respTable");
  const totalText = document.getElementById("totalText");

  if (!client) {
    yes.textContent = "–";
    no.textContent = "–";
    maybe.textContent = "–";
    totalText.textContent = "Konfigurasi Supabase belum diisi di config.js.";
    body.innerHTML =
      '<tr><td colspan="4" class="empty">Belum bisa memuat data (Supabase belum dikonfigurasi).</td></tr>';
    return;
  }

  const { data, error } = await client
    .from("responses")
    .select("nama,kontak,status,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    body.innerHTML =
      '<tr><td colspan="4" class="empty">Gagal memuat: ' + (error.message || error) + "</td></tr>";
    return;
  }

  const rows = data || [];
  const cYes = rows.filter((r) => r.status === "ya").length;
  const cNo = rows.filter((r) => r.status === "tidak").length;
  const cMaybe = rows.filter((r) => r.status === "mungkin").length;
  const total = rows.length;

  yes.textContent = cYes;
  no.textContent = cNo;
  maybe.textContent = cMaybe;

  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  document.getElementById("pctYes").textContent = pct(cYes) + "%";
  document.getElementById("pctNo").textContent = pct(cNo) + "%";
  document.getElementById("pctMaybe").textContent = pct(cMaybe) + "%";
  document.getElementById("barYes").style.width = pct(cYes) + "%";
  document.getElementById("barNo").style.width = pct(cNo) + "%";
  document.getElementById("barMaybe").style.width = pct(cMaybe) + "%";

  totalText.textContent = total + " peserta terdaftar.";

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Belum ada respons.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const st = r.status || "mungkin";
      const badge = '<span class="badge ' + st + '">' + (STATUS_LABEL[st] || st) + "</span>";
      const time = r.created_at
        ? new Date(r.created_at).toLocaleString("id-ID", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "–";
      return (
        "<tr><td>" + escapeHtml(r.nama) + "</td><td>" + escapeHtml(r.kontak) +
        "</td><td>" + badge + "</td><td>" + time + "</td></tr>"
      );
    })
    .join("");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inisialisasi
loadDashboard();
