# Discord Clone (Tek Oda) — Sesli / Görüntülü / Ekran Paylaşımı

Arkadaş grubunuz için tek odalı (Genel Oda) Discord benzeri web uygulaması.

- Tek oda sistemi: Siteye giren herkes aynı odaya bağlanır
- WebRTC: Gerçek zamanlı ses + isteğe bağlı kamera
- Ekran paylaşımı: `getDisplayMedia()` ile
- Canlı chat + katılımcı listesi: Socket.io
- Discord benzeri koyu tema + mobilde uygulama gibi görünüm

## Klasör Yapısı

```text
/discord-clone
  server.js
  package.json
  /public
    index.html
    style.css
    app.js
```

## Kurulum

Node.js 20+ önerilir.

```bash
npm install
```

## Çalıştırma

```bash
npm start
```

Varsayılan port: `3000`

Tarayıcıdan giriş (davet token zorunlu):

```text
http://localhost:3000/?room=arkadaslar
```

## Davet / Güvenlik

Sunucu sadece izin verilen `room` token’larına izin verir.

- Varsayılan token: `arkadaslar`
- Birden fazla token:

PowerShell:
```powershell
$env:INVITE_ROOMS="arkadaslar,baska_grup"
npm start
```

Linux/macOS:
```bash
INVITE_ROOMS="arkadaslar,baska_grup" npm start
```

## Kullanım

- Mikrofon: Odaya girince ses için izin istenir
- Kamera: Varsayılan kapalıdır, kullanıcı “Kamera Aç” ile açar
- Ekran paylaşımı: “Ekran Paylaş” ile başlar, “Paylaşımı Durdur” ile biter
- İsim: İlk girişte kullanıcı adı sorulur; sonra F5’te tekrar sormaz
- Ayarlar: Sağ panelden kullanıcı adını değiştirebilirsiniz

## Render’a Deploy

Render → New → Web Service → Repo’yu seç:

- Root Directory: repo içindeki klasörünüz `discord-clone` ise `discord-clone`
- Build Command: `npm install`
- Start Command: `npm start`

Environment Variables:

- `INVITE_ROOMS`: `arkadaslar` (veya virgülle çoklu)
- `PORT`: Render otomatik verir (elle setlemeyin)

## Önemli Notlar

- Kamera/mikrofon ve ekran paylaşımı için genelde HTTPS gerekir (localhost hariç). Render HTTPS sağlar.
- Bu proje küçük grup için “mesh” WebRTC kullanır. Kullanıcı sayısı büyürse veya bazı ağlarda bağlantı sorunları olursa TURN/SFU gerekebilir.

