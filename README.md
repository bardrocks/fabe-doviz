# Fabe Döviz Hesap

Masaüstünde küçük bir pencere (pop-up) olarak çalışan döviz hesaplayıcı.
Kurları canlı olarak **https://www.nadirdoviz.com/fiyat-ekrani** sayfasından okur
ve **USD**, **EUR** veya **TL** alanlarından hangisine yazılırsa diğer ikisini hesaplar.

## Nasıl çalışır?

- Uygulama Nadir Döviz fiyat ekranını arka planda görünmez bir pencerede açar ve
  ekranda gösterilen USD/TL, EUR/TL, EUR/USD **Alış/Satış** değerlerini 2 saniyede bir okur.
  Değerler sitede görünenle birebir aynıdır.
- **Hatasız** olması için her okuma kontrol edilir: sayı biçimi, makul aralık,
  satış ≥ alış ve EUR/TL ÷ USD/TL ≈ EUR/USD çapraz kontrolü. Tutmayan veri kullanılmaz.
- Kurlar 30 sn güncellenmezse sarı uyarı çıkar, 90 sn güncellenmezse canlı kurla hesap **gösterilmez**
  (eski kurla yanlış fiyat verilmesin diye); manuel girilen kurlarla hesap yine yapılır.
  Bağlantı koparsa sayfa kendiliğinden yenilenir.

## Hesaplama

| Yazılan | Hesaplanan |
|---|---|
| USD | TL = USD × USD/TL, EUR = USD ÷ EUR/USD |
| EUR | TL = EUR × EUR/TL, USD = EUR × EUR/USD |
| TL | USD = TL ÷ USD/TL, EUR = TL ÷ EUR/TL |

Varsayılan: tüm kurlar canlı **Alış**, EUR/USD paritesine **-0,0100** düzeltme
(1,0941 → 1,0841). Örnek 240 USD → 12.176,38 ₺ ve 221,38 €.

⚙ **Ayarlar**'da her kur (USD/TL, EUR/TL, EUR/USD) için ayrı ayrı:
- **Canlı · Alış** veya **Canlı · Satış**, isteğe bağlı düzeltme (ör. -0,0100)
- **Manuel**: kuru elle girin (ör. parite 1,0941 yerine **1,0741**). Manuel kur kaydedilir,
  uygulama kapanıp açılsa da kalır. Ana ekranda mor şerit manuel kur kullanıldığını gösterir;
  **Canlı kura dön** ile tek tıkla canlı kura dönülür.
- Her zaman üstte, bilgisayar açılınca başlat, görev çubuğunda dolar kuru

## Pencere ve görev çubuğu

- Pencere içeriği kadar yüksektir, boş alan kalmaz (ayarlar açılınca uzar, kapanınca kısalır).
- Başlıktaki kaydırıcı pencerenin **şeffaflığını** ayarlar (%30 – %100); ayar kaydedilir.
- **Görev çubuğunda dolar kuru**: Windows hava durumu kutusu gibi görev çubuğunun
  üzerinde küçük bir kutuda hesapta kullanılan USD/TL kuru görünür (▲/▼ değişim).
  Tıklayınca uygulama açılır/kapanır, sürükleyerek sağa sola taşınır, sağ tıkla kaldırılır.
  Ayarlar > Genel veya tepsi menüsünden açılıp kapatılır.

## Güncelleme

Uygulama açılışta ve 2 saatte bir GitHub Releases'ta yeni sürüm olup olmadığına bakar.
- **Kurulumlu sürüm**: yeni sürümü arka planda indirir, ana ekranda yeşil **"Yeni sürüm hazır · Güncelle"**
  şeridi çıkar; tıklayınca kurulur ve yeniden açılır (tıklanmazsa uygulamadan çıkarken kurulur).
- **Portable sürüm**: kendini değiştiremez; şeritteki **İndir** yeni .exe'yi indirir.
- Ayarlar > Genel'de sürüm numarası ve **Güncellemeleri denetle** bağlantısı var.
Bunun çalışması için depo herkese açık olmalı (sürüm dosyaları oradan indirilir).

## Kullanım

- **Ctrl+Shift+D**: her yerden pencereyi aç / gizle
- USD, EUR veya TL alanına yazın → diğer ikisi anında hesaplanır
- ⧉ simgesi panoya kopyalar; **Enter** USD/EUR yazarken TL'yi, TL yazarken USD'yi kopyalar
- **Esc**: alanları temizler
- ✕ pencereyi gizler, uygulama saatin yanındaki simgede çalışmaya devam eder
  (sağ tık → Çıkış)

## Kurulum (Windows)

GitHub'da depo sayfasının sağındaki **Releases** bölümünden son sürümü indirin
(her derleme oraya otomatik yüklenir). İki seçenek var:
- `FabeDovizHesap-Kurulum-x.y.z.exe` – kurulum (masaüstü kısayolu oluşturur)
- `FabeDovizHesap-Portable-x.y.z.exe` – kurulumsuz, çift tıkla çalışır

Kendiniz derlemek için (Node.js 20+):

```bash
npm install
npm start          # geliştirme modunda çalıştır
npm test           # hesaplama testleri
npm run dist:win   # Windows .exe üret (dist/ klasörüne)
```
