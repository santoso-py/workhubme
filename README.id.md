<div align="center">

# workhubme

**Beberapa situs yang Anda pakai setiap hari, ditambah terminal, dalam satu jendela. Dikendalikan dari keyboard.**

[![Lisensi: MIT](https://img.shields.io/badge/lisensi-MIT-blue.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Status: awal](https://img.shields.io/badge/status-awal%20(0.0.2)-orange)
![Tanpa telemetri](https://img.shields.io/badge/telemetri-tidak%20ada-success)

[English](README.md) · **Bahasa Indonesia** · [日本語](README.ja.md)

<img src="docs/split.png" width="880" alt="Tampilan terbagi: halaman pengganti di samping tab terminal, di bawah bilah tab">

<sub>Tampilan terbagi: halaman pengganti di samping tab terminal. Ilustrasi yang disusun dari render asli bilah tab dan terminal aplikasi.</sub>

</div>

---

## Apa ini sebenarnya

workhubme adalah **cangkang browser yang kecil**. Isinya Chromium (lewat [Electron](https://www.electronjs.org/)) yang menampilkan sekumpulan situs yang *Anda* sematkan, satu tab per situs, dan setiap tab punya login sendiri. Ada juga **tab terminal** opsional dan **prefix keyboard ala tmux** untuk berpindah dengan cepat.

Jadi ini satu keluarga dengan [Ferdium](https://ferdium.org/), [Rambox](https://rambox.app/), Station, dan alat sejenis yang "menaruh aplikasi web dalam satu jendela". Bukan teknologi baru, bukan aplikasi pesan, dan **bukan klien resmi layanan mana pun**: ia hanya membuka halaman yang Anda minta, seperti browser biasa.

Alasannya satu: berpindah antara lima atau enam tab dan sebuah terminal dengan cepat tanpa menyentuh mouse. Misalnya saat ada masalah di server dan Anda butuh chat dan shell berdampingan.

**Cocok untuk Anda** kalau menyematkan beberapa situs saja, suka alur kerja lewat keyboard, dan ingin sesuatu yang cukup kecil untuk dibaca dalam satu sore.

**Tidak cocok** kalau Anda butuh katalog layanan siap pakai, sinkronisasi antar perangkat, dukungan Windows atau Linux, atau proyek matang dengan komunitas besar. Untuk itu pakai Ferdium atau Rambox. Mereka lebih mapan dan melakukan lebih banyak.

## Tampilannya

<img src="docs/tabs.png" width="880" alt="Bilah tab: Chat, Mail, Docs, Board, Server, dan Terminal sebagai segmen satu kapsul, dengan tombol plus">

| Panel prefix | Pengalih |
|:---:|:---:|
| <img src="docs/prefix.png" alt="Panel prefix berisi daftar tombol"> | <img src="docs/switcher.png" alt="Pengalih Ctrl+Tab dengan satu tab disorot"> |

| Tambah tab | Pengaturan |
|:---:|:---:|
| <img src="docs/add-tab.png" alt="Dialog untuk menambah tab situs web atau terminal"> | <img src="docs/settings.png" alt="Pengaturan: bahasa dan gesek dua jari"> |

<img src="docs/terminal.png" width="560" alt="Tab terminal menjalankan python dan ssh">

<sub>Semua gambar adalah halaman UI aplikasi yang dirender di luar layar dengan isi demo fiktif dan halaman pengganti di belakang panel; tampilan terbagi di bagian atas disusun dari dua di antaranya. Bahasa antarmuka (English, Bahasa Indonesia, 日本語) dipilih di Pengaturan.</sub>

## Fitur

- **Tab dan daftar milik Anda.** Dimulai kosong. Isi nama dan alamat `https://`; hapus tab lewat menu klik kanan. Daftarnya disimpan di folder pengguna, bukan di repo ini.
- **Login terpisah.** Setiap tab menyimpan cookie dan data situsnya sendiri. Preset "Login dengan Google" bersifat opsional dan menyatukan sesi Google untuk tab yang memakainya.
- **Ketat secara bawaan.** Tab hanya boleh membuka alamatnya sendiri (ditambah domain tambahan yang Anda daftarkan). Selebihnya dibuka di browser bawaan Anda.
- **Tampilan terbagi.** Dua tab berdampingan.
- **Prefix keyboard.** `Cmd+R`, lalu satu tombol. Seperti tmux, tetapi untuk tab.
- **Pengalih.** Tahan `Ctrl`, tekan `Tab`: tab diurutkan dari yang terakhir dipakai.
- **Tab terminal.** Shell login Anda, untuk pengecekan cepat dengan `ssh` atau `python`. Baru berjalan saat tab pertama kali dibuka.
- **Tiga bahasa.** English, Bahasa Indonesia, dan 日本語, diganti di Pengaturan (`Cmd+,`). Bawaannya mengikuti bahasa sistem.
- **Gesek dua jari (eksperimental, mati secara bawaan).** Gesek ke kanan untuk tab berikutnya, ke kiri untuk sebelumnya. Aktifkan di Pengaturan.
- **Senyap.** Tanpa akun, tanpa telemetri, tanpa lalu lintas jaringan milik aplikasi sendiri.

## Mulai cepat

```sh
git clone https://github.com/santoso-py/workhubme.git
cd workhubme
npm install
npm start
```

Saat pertama dijalankan, binary Electron diunduh (sekitar 100 MB), jadi bisa lama berhenti di "Downloading Electron binary...". Kalau npm Anda memblokir install script, `node node_modules/electron/install.js` menjalankan langkah itu secara eksplisit. Binary `node-pty` sudah tersedia (prebuilt), jadi tidak ada yang dikompilasi.

Peluncuran pertama menampilkan jendela kosong. Klik **+**, tambahkan situs atau terminal, selesai. [`services.example.json`](services.example.json) menunjukkan format berkasnya kalau Anda lebih suka menyuntingnya langsung.

<img src="docs/empty.png" width="720" alt="Layar awal: fungsi aplikasi, tombol Tambah tab, dan panduan singkat tombol">

<sub>Layar awal menjelaskan fungsi aplikasi dan beberapa tombol yang perlu Anda tahu, dan langsung menyediakan pilihan bahasa.</sub>

Persyaratan: macOS (dikembangkan dan diuji di Apple Silicon), Node.js, dan npm.

## Tampilan terbagi

Tampilkan dua tab berdampingan, misalnya chat di samping terminal saat ada masalah di server.

1. Buka tab pertama: klik, atau `Cmd+R` lalu nomornya.
2. Tambahkan yang kedua: `Cmd+R`, `s`, lalu nomor tab yang ingin Anda taruh di sampingnya. `Shift`+klik pada tab melakukan hal yang sama.
3. Tab kedua diberi garis berwarna di bawah namanya. Klik di dalam sebuah panel untuk memfokuskannya: mundur, maju, muat ulang, dan awal bekerja pada panel yang fokus.
4. `Cmd+R`, `x` menutup tampilan terbagi. Memilih tab tanpa `Shift` mengganti panel kiri.

<img src="docs/split.png" width="720" alt="Tampilan terbagi: halaman pengganti di samping tab terminal">

## Keyboard

Prefix-nya `Cmd+R`, lalu satu tombol. `Esc` membatalkan.

| Tombol | Aksi |
|---|---|
| `Cmd+R`, `1`-`9` | Pindah ke tab tersebut |
| `Cmd+R`, `s`, `1`-`9` | Bagi: tampilkan tab itu di samping tab sekarang |
| `Cmd+R`, `x` | Tutup tampilan terbagi |
| `Cmd+R`, `b` | Sembunyikan atau tampilkan bilah tab |
| `Cmd+R`, `p` / `n` | Mundur / maju di halaman yang sedang fokus |
| `Cmd+R`, `r` | Muat ulang |
| `Cmd+R`, `h` | Kembali ke halaman awal tab |
| `Cmd+R`, `c` | Keluar dari akun tab yang fokus (ada konfirmasi) |
| `Cmd+R`, `,` atau `Cmd+,` | Pengaturan: bahasa dan gesek |
| Tahan `Ctrl`, tekan `Tab` | Pengalih; lepas `Ctrl` untuk pindah |
| `Shift`+klik tab | Bagi layar dengan tab itu |

## Tips

- **Buka dengan satu kata pendek.** Tambahkan alias ke `~/.zshrc`. Nama seperti `me`, `work`, atau `hub` mudah diketik; pastikan namanya belum dipakai dengan `type work`.
  ```sh
  alias work='(cd ~/workhubme && npm start >/dev/null 2>&1 &)'
  ```
  Jalankan `source ~/.zshrc` sekali, lalu cukup ketik `work`. Aplikasi berjalan di latar belakang, jadi terminal tetap bebas; hapus `>/dev/null 2>&1` kalau ingin melihat keluarannya. Ganti path sesuai lokasi Anda meng-clone repo.
- **Pertama kali dijalankan.** `npm start` yang pertama mengunduh Electron (sekitar 100 MB). Kalau terlewat, atau `node_modules` terhapus (misalnya oleh `npm ci`), jalankan `node node_modules/electron/install.js`.
- **Bahasa.** Layar awal punya pilihan bahasa (English, Bahasa Indonesia, 日本語). Sebelum Anda memilih, aplikasi mengikuti bahasa sistem. Ubah nanti di Pengaturan (`Cmd+,`).
- **Halaman login terbuka di browser dan tab terus memuat.** Tab mencoba membuka domain yang tidak boleh dibukanya. Lihat `~/Library/Logs/workhubme/blocked-navigation.log`, lalu tambahkan domain itu di "Domain tambahan" saat menambah tab (atau centang "Login dengan Google" untuk Google). Untuk tab yang sudah ada, ubah `hosts`-nya di `services.json` lalu mulai ulang.
- **Terjebak di halaman yang tidak bisa ditinggalkan?** `Cmd+R`, `p` untuk mundur; `Cmd+R`, `h` ke halaman awal tab; `Cmd+R`, `c` keluar dari akun tab, berguna saat halaman bilang akun Anda tidak punya akses.
- **Cadangkan pengaturan Anda.** Salin `services.json` dan `settings.json` dari `~/Library/Application Support/workhubme/`.
- **Jaga Electron tetap baru.** Jalankan `npm update electron` sesekali.

## Di mana data Anda tersimpan

- Daftar tab: `~/Library/Application Support/workhubme/services.json` (di luar repo ini, tidak pernah di-commit)
- Pengaturan: `settings.json` di folder yang sama
- Login dan data situs: folder yang sama, satu partisi per tab
- Log: `~/Library/Logs/workhubme/`. `blocked-navigation.log` dan `actions.log` hanya mencatat origin dan path, tidak pernah query string.

Tidak ada yang keluar dari komputer Anda selain yang dikirim dan diterima oleh situs yang Anda sematkan sendiri.

## Model keamanan

Layak dibaca sebelum Anda mempercayakan akun sungguhan.

- Tab situs berjalan dengan `sandbox` dan `contextIsolation` serta tanpa integrasi Node. Mereka punya tepat satu preload kecil, [`wheel-preload.js`](wheel-preload.js) (sekitar sepuluh baris), yang berjalan di dunia terisolasi dan hanya meneruskan besar gulir (dua angka) ke aplikasi untuk fitur gesek. Ia tidak membaca hal lain dari halaman dan tidak membuka apa pun ke halaman. Aplikasi tidak mengubah halaman yang Anda buka. Satu-satunya pesan yang bisa dikirim renderer halaman adalah dua angka itu; aplikasi hanya menerimanya dari tab situs dan satu-satunya efeknya adalah berpindah tab.
- Navigasi dan redirect halaman itu sendiri dibatasi ke host yang diizinkan untuk tab tersebut (hanya HTTPS). Selebihnya dibuka di browser bawaan dan dicatat.
- Halaman hanya diberi izin notifikasi, tulis clipboard, dan layar penuh.
- Terminal menjalankan shell login Anda **dengan hak akses Anda**. Halamannya lokal, tidak bisa berpindah halaman atau membuka jendela, dan setiap pesan ke terminal harus berasal dari frame utama halaman itu, dengan ukuran dan tipe yang divalidasi. Perlakukan seperti terminal lain.
- `services.json` divalidasi lagi saat dibaca, sehingga berkas yang disunting tangan tidak bisa memperluas apa yang boleh dibuka sebuah tab.
- Dependensi dikunci pada versi eksak (Electron, `node-pty`, `xterm`). **Tidak ada pembaruan otomatis**: jalankan `npm update electron` sendiri sesekali, karena Electron membawa Chromium.

Menemukan masalah? Lihat [SECURITY.md](SECURITY.md).

## Catatan jujur

Mohon dibaca. Ini bagian yang sering dilewatkan README lain.

- **Independen dan tidak resmi.** Tidak berafiliasi, didukung, atau disponsori oleh situs mana pun yang Anda sematkan. Nama produk seperti WhatsApp atau Gmail milik pemiliknya masing-masing dan hanya disebut untuk menjelaskan apa yang bisa Anda sematkan. Tidak ada logo yang disertakan.
- **Ini hanya jendela browser.** Tidak mengotomatisasi, mengambil data (scraping), atau mengubah halaman, dan tidak mengirim pesan atas nama Anda. Satu-satunya yang dibaca dari halaman adalah besar gulir, untuk fitur gesek yang opsional.
- **User agent.** Supaya lebih banyak situs menerima login, aplikasi menghapus token `Electron` dari user agent-nya. Itu mengubah cara browser Anda memperkenalkan diri. Sebagian layanan bisa menolak atau membatasinya, dan Google memblokir sign-in OAuth dari webview tertanam sejak 2021 ([pengumuman](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/); pengumuman itu tidak menyebut Electron, jadi belum jelas apakah berlaku di sini). Karena itu login Google di dalam aplikasi ini bisa gagal.
- **Baca syarat tiap layanan.** Sebagai contoh, ketentuan layanan WhatsApp (dibaca Oktober 2026) membatasi akses otomatis, pesan massal, dan penggunaan non-personal. Aplikasi ini tidak melakukan itu, tetapi Anda bertanggung jawab atas cara Anda memakai layanan yang disematkan. Ini bukan nasihat hukum.
- **Gratis dan akan tetap begitu.** Lisensi MIT. Tanpa versi berbayar, tanpa iklan, tanpa pelacakan, tanpa ajakan donasi.
- **Dibuat dengan bantuan AI.** Dibangun dengan asisten pemrograman AI (Claude Code), diarahkan dan diuji oleh pemelihara. Belum pernah diaudit keamanannya oleh pihak independen. Baca kodenya sebelum mempercayakan hal penting; ukurannya sengaja kecil.
- **Tanpa garansi.** Lihat [LICENSE](LICENSE).

## Keterbatasan

- Bukan browser umum: tanpa address bar, riwayat, bookmark, atau ekstensi.
- Baru macOS. Windows dan Linux belum diuji dan sebagian kode jendela khusus macOS.
- Unduhan memakai dialog simpan bawaan Electron. Klik notifikasi tidak memfokuskan tab. Tidak ada lencana pesan belum dibaca.
- Antarmuka tersedia dalam English, Bahasa Indonesia, dan Jepang. Teks Indonesia dan Jepang ditulis tanpa ditinjau penutur asli; koreksi sangat diterima.
- Gesek dua jari masih eksperimental dan tidak semulus gesek bawaan macOS: tab berpindah setelah gesekan melewati ambang, bukan mengikuti jari Anda, dan menggulir halaman ke samping juga bisa memicunya. Mati secara bawaan dan tidak pernah aktif di tab terminal.
- Prefix (`Cmd+R`) dan pintasan lain belum bisa diubah; Pengaturan baru berisi bahasa dan gesek.
- Tidak bertanda tangan, dijalankan dari source. Kalau Anda membuat dan membagikan `.app` sendiri, sertakan `LICENSE` Electron dan `LICENSES.chromium.html` Chromium dari distribusi Electron.
- Perangkat lunak awal (0.0.2). Harap maklum kalau masih kasar.

## Kredit dan lisensi

MIT, lihat [LICENSE](LICENSE). Lisensi pihak ketiga ada di [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Dibangun dengan [Electron](https://www.electronjs.org/), [xterm.js](https://xtermjs.org/), dan [node-pty](https://github.com/microsoft/node-pty). Bentuk tab terinspirasi dari desain tab browser dan kontrol segmen yang umum; kodenya ditulis untuk proyek ini.
