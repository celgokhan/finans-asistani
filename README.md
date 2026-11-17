# Finans Asistanı

Telefonda çalışan kişisel finans uygulaması. Banka ekstrelerini okur, gelir ve giderleri takip eder, fişleri fotoğraftan okur ve harcamalarına göre tüyolar verir.

**Gizlilik:** Ekstreler, fişler ve tüm hesaplamalar telefonda işlenir. Uygulama hiçbir sunucuya veri göndermez ve ücretli bir servis kullanmaz. Bu depoda sadece uygulamanın kodu bulunur.

## Telefona kurulum

1. Uygulamayı telefonda aç: **https://celgokhan.github.io/finans-asistani/**
2. Ana ekrana ekle:
   - **iPhone (Safari):** Paylaş ▸ *Ana Ekrana Ekle*
   - **Android (Chrome):** ⋮ menü ▸ *Uygulamayı yükle* / *Ana ekrana ekle*
3. Uygulamayı her zaman ana ekrandaki ikondan aç. Veriler bu uygulamaya özel saklanır.

> iPhone'da ana ekrandaki uygulamanın verisi, Safari'de açılan sayfanınkinden ayrı tutulur. Kurulumdan sonra hep ikonu kullan.

## Neler yapar

| Bölüm | İçerik |
|---|---|
| **Ekstre yükleme** | Yapı Kredi kredi kartı ekstresi ve vadesiz hesap hareketleri PDF'i. Okunan işlemler ekstrenin kendi toplamıyla (kartta TOPLAM satırı, hesapta bakiye zinciri) karşılaştırılır; tutmazsa uyarır. Aynı ekstre iki kez yüklenirse tekrar eden işlemler atlanır. Parolalı PDF'ler desteklenir. |
| **Fiş / fatura** | Kamerayla çekilen fiş telefonda okunur (OCR); tutar, tarih, işyeri ve kategori önerilir. e-Arşiv/e-Fatura PDF'leri metinden okunur. Kartla ödenen fiş, ekstre yüklenince aynı işlemle eşleşir; gider iki kez sayılmaz. |
| **Kategoriler** | Otomatik atanır. Bir işlemin kategorisini değiştirince aynı işyeri bir dahakine otomatik o kategoriye gider. Kendi hesapların arası transferler, kart ödemeleri, fon/döviz/mevduat işlemleri gelir/gider toplamını şişirmez. |
| **Gelir** | Maaş ve kira kaynakları; dökümdeki gönderen adına göre otomatik eşleşme, beklenen gün geçince uyarı. |
| **Plan** | Kategori bütçeleri (ay sonu tahmini ile), kart ödeme durumu ve taksit takvimi, abonelikler ve zam tespiti, birikim hedefleri, varlıklar (TL, döviz, altın, fon). |
| **Tüyolar** | Kart faizi, eksik ödeme, son ödeme yaklaşması, ek hesabın (KMH) eksiye düşmesi, limit kullanımı, birikmiş puan, bütçe aşımı, abonelik toplamı, tasarruf oranı, acil durum fonu, yedek hatırlatma. |
| **Yedek** | Parolalı (AES-256) yedek dosyası; Drive/iCloud'a kaydedilir, yeni telefonda geri yüklenir. |

## Geliştirme

Derleme adımı yoktur. Yerelde denemek için:

```bash
python3 -m http.server 8000   # http://localhost:8000
npm test                      # okuyucu ve hesaplama testleri (Node 20+)
```

Yeni bir banka eklemek için `js/parsers.js` içine okuyucu yaz ve `tests/` altına **sentetik** veriyle test ekle. Gerçek ekstreleri depoya koyma.

Gömülü kütüphaneler: [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0), [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).
