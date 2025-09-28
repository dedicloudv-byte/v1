# VLESS Cloudflare Worker

Proyek ini menyediakan sebuah skrip Cloudflare Worker yang siap-deploy untuk membuat proxy VLESS pribadi Anda. Skrip ini ditulis dalam TypeScript dan dirancang agar mudah diatur, aman, dan efisien.

Ini memungkinkan Anda untuk merutekan lalu lintas internet Anda melalui jaringan CDN global Cloudflare, memberikan koneksi yang cepat, stabil, dan tersamarkan.

## Fitur Utama

- **Protokol VLESS**: Menggunakan protokol VLESS yang modern dan efisien.
- **Transport WebSocket (WS)**: Membungkus lalu lintas VLESS dalam koneksi WebSocket, membuatnya tampak seperti lalu lintas web HTTPS biasa dan sulit untuk dideteksi atau diblokir.
- **Dukungan Penuh Jaringan (Full Proxy)**: Setelah terhubung, semua lalu lintas TCP Anda akan dirutekan melalui worker.
- **Berjalan di Jaringan CDN Cloudflare**: Mendapatkan manfaat dari kecepatan, latensi rendah, dan stabilitas jaringan global Cloudflare.
- **Rute Fallback (Penyamaran)**: Permintaan yang bukan koneksi VLESS (misalnya, kunjungan dari browser) akan dialihkan ke situs web lain, sehingga worker Anda tidak terlihat mencurigakan.
- **Konfigurasi Mudah**: Cukup edit file `wrangler.toml` untuk mengatur UUID, path rahasia, dan host fallback Anda.
- **Keamanan TLS**: Semua koneksi secara otomatis diamankan dengan TLS (HTTPS) oleh Cloudflare.

## Cara Deployment

### Prasyarat

1.  Akun [Cloudflare](https://dash.cloudflare.com/sign-up).
2.  [Node.js](https://nodejs.org/en/) dan `npm` terinstal di komputer Anda.

### Langkah 1: Clone atau Unduh Proyek

Dapatkan semua file proyek ini ke komputer lokal Anda.

### Langkah 2: Instal Dependensi

Buka terminal di direktori proyek dan jalankan perintah berikut. Perintah ini akan menginstal `wrangler`, alat command-line dari Cloudflare.

```bash
npm install
```

### Langkah 3: Konfigurasi `wrangler.toml`

Buka file `wrangler.toml` dan ubah nilai-nilai berikut:

1.  `name`: Ganti `"vless-worker"` dengan nama unik untuk worker Anda (misalnya, `my-secret-proxy-123`).
2.  `UUID`: Ganti nilai yang ada dengan UUID Anda sendiri. Anda bisa membuatnya di [UUID Generator](https://www.uuidgenerator.net/).
3.  `VLESS_PATH`: Ganti `"/your-secret-path"` dengan path rahasia pilihan Anda (misalnya, `"/a1b2-c3d4-e5f6"`). **Harus diawali dengan `/`**.
4.  `FALLBACK_HOST`: (Opsional) Ganti `https://www.wikipedia.org` dengan situs web lain jika Anda mau.

### Langkah 4: Login ke Akun Cloudflare

Di terminal, jalankan perintah berikut. Ini akan membuka browser agar Anda bisa login dan mengotorisasi `wrangler`.

```bash
npx wrangler login
```

### Langkah 5: Deploy Worker

Setelah login, jalankan perintah ini untuk mem-publish worker Anda ke Cloudflare:

```bash
npx wrangler deploy
```

Setelah proses selesai, terminal akan menampilkan URL worker Anda, seperti `https://your-worker-name.your-subdomain.workers.dev`. Simpan URL ini.

## Konfigurasi Klien (Contoh: v2rayN)

Gunakan detail berikut untuk mengatur aplikasi klien V2Ray Anda:

-   **Address (Alamat):** URL worker Anda (misalnya, `my-secret-proxy-123.my-account.workers.dev`)
-   **Port:** `443`
-   **ID (UUID):** UUID yang Anda atur di `wrangler.toml`
-   **Flow:** (biarkan kosong atau atur sesuai kebutuhan)
-   **Security (Keamanan):** `tls`
-   **Network (Jaringan):** `ws`
-   **Path (Jalur):** Path rahasia Anda (misalnya, `/a1b2-c3d4-e5f6`)
-   **Host:** (biarkan kosong atau isi dengan URL worker Anda)
-   **TLS/SNI:** (biarkan kosong atau isi dengan URL worker Anda)

Anda sekarang siap untuk terhubung!