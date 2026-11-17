# Finans Asistanı

Telefonda çalışan, verisi sadece cihazda (IndexedDB) kalan kişisel finans PWA'sı. GitHub Pages'ten yayınlanır; derleme adımı yok, düz ES modülleri.

**Kişisel veri kuralı:** Gerçek ekstre, fiş, yedek dosyası, isim, IBAN, kart numarası depoya asla eklenmez (depo herkese açık). Testler `tests/` altındaki sentetik verilerle çalışır. `.gitignore` PDF/görsel/yedek dosyalarını dışlar.

| Dosya | Görev |
|---|---|
| `js/parsers.js` | PDF metin parçalarından (x/y konumlu) ekstre okuyucuları: Yapı Kredi kart, Yapı Kredi hesap hareketleri, genel yedek okuyucu. Saf fonksiyon. |
| `js/categorize.js` | Kategoriler, işyeri adı normalleştirme, otomatik sınıflandırma, kullanıcı kuralları |
| `js/analytics.js` | Aylık özet, kart ödeme durumu, taksit takvimi, abonelik tespiti, tüyolar |
| `js/receipt.js` | Tesseract OCR (telefonda) ve fiş/fatura metni çözümleme |
| `js/backup.js` | PBKDF2 + AES-GCM parolalı yedek |
| `js/app.js` | Arayüz, akışlar |
| `lib/` | Gömülü pdf.js 3.11.174 ve tesseract.js 5.1.1 (+ Türkçe dil verisi); CDN'e bağımlılık yok |

- Test: `npm test` (Node 20+). Yeni banka okuyucusu eklerken önce sentetik test yaz; okuyucu kendi doğrulamasını (`check.ok`) üretmeli (toplam/bakiye zinciri).
- `sw.js` içindeki `CACHE` adını her sürümde artır, yoksa telefonlar eski dosyaları tutabilir.
- Ücretli servis/API kullanılmaz; tek ağ isteği kur sorgusu (api.frankfurter.app).
