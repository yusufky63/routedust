# Testnet Router — Durum ve Yol Haritası Raporu

**Tarih:** 2026-09-17 · **Sürüm:** ilk gün sonu (12 commit) · **Kaynak spec:** `TESTNET_ROUTER_SPEC.md` v1.0

Bu rapor bugünkü durumu, mimarinin güçlü ve zayıf yanlarını, ölçülen darboğazları ve önümüzdeki dönemde eklenebilecek ya da "böyle olsa daha iyi olur" dediğim her şeyi tek yerde toplar. Bölüm 10'da önerilen uygulama sırası var.

## 0. Güncelleme — 2026-09-17 gün sonu

Aşağıdaki bölümlerdeki önerilerin büyük kısmı aynı gün uygulandı (ayrıntı: `CHANGELOG.md`, `README.md`, uygulama içi `/docs`):

- **Rota/zincir**: Circle Forwarding Service, Circle Gateway, Uniswap v4 + v2 (+ Fuji'de Pangolin/LFJ), v3 fee tier bölünmüş rotalar, Hyperlane CCTP warp, Stargate V2 (ETH), LI.FI Intents, 9 yeni Circle zinciri, yerel konsolidasyon (havuzlanmış köprü), kademeli derinleşen yol araması.
- **Yürütme**: nonce takibi + zincir üstü burn kurtarma (asla iki kez burn yok), PAUSED durumu, gerçek gaz bütçesi (+ OP Stack L1 ücreti), bytecode hash pinleme, ikinci RPC çapraz kontrolü, hızlandırılmış/iptal işlem takibi, imza özetleri, allowance temizliği, EIP-712 imza adımı.
- **Hız**: sunucu tarafı paylaşılan keşif (`/api/discovery`, 5 dk), quote yaşlanma göstergesi ve arka planda yenileme, mod değişiminde yeniden puanlama.
- **Swap**: bilinen test tokenları (EURC, LINK), Blockscout sembol araması, Likidite sayfası (havuz + pozisyon), fiyat geçmişi, state override ile gerçek router satış simülasyonu.
- **Ürün**: How it works ve Docs sayfaları, mobil alt gezinme, Balances filtre/sıralama/hedef beklentisi, tarayıcı bildirimleri, CHANGELOG, `pnpm probe --write`, `pnpm e2e`.
- **Yapılmayanlar (bilinçli)**: OP Stack çekimi (7 günlük kanıt penceresi), Wormhole NTT (eşleşen testnet varlığı yok), i18n, CI/GitHub, CSV/IndexedDB, örnek cüzdan, erişilebilirlik çalışması (kullanıcı isteği). HyperEVM, Morph Hoodi, Sonic Blaze RPC'leri hâlâ cevap vermiyor; Codex'in açık RPC'si, XDC'nin Multicall3'ü yok.

---

## 1. Bugünkü durum (doğrulanmış)

| Alan | Durum |
|---|---|
| Zincirler | 11 tier-1 testnet (Sepolia, Base, OP, Arbitrum, Arc, Monad, Fuji, Amoy, Unichain, World Chain, GIWA); hepsi `eth_chainId` ile doğrulandı, Multicall3 mevcut |
| Sağlayıcılar | Circle CCTP (90 kenar), Uniswap v3 (feed + canlı havuz, 4 zincir), Across testnet (70 kenar), OP Standard Bridge (3 yatırma), wrap/unwrap |
| Canlı graf | ~200 kenar / 29 düğüm; keşif 2–17 sn (token sondalarıyla), tarama ~1 sn, plan 10–17 sn |
| Planlayıcı | Aşamalı arama (kısa yol → dolambaç → köprü aktarması → sağlayıcı limiti → fiyat etkisi), gaz rezervi, mod bazlı skorlama, PARTIAL rotalar, "no route" gerekçeleri |
| Yürütme | Adım adım, yeniden başlatılabilir durum makinesi; süresi dolan quote yenilenir; her tx `eth_call` ile simüle edilir; toplu (batch) sıralı çalıştırma |
| Token alım/satım | `/swap` sayfası (native/ETH/WETH/USDC). Doğrulanmamış tokenlar (Blockscout keşfi → zincir üstü doğrulama → havuz sondası → transfer sağlamlık kontrolü → adresle alım) **varsayılan olarak kapalı**, Settings › "Unverified tokens (advanced)" ile açılır |
| Kapsama | `/coverage`: Circle/Uniswap/Across/LI.FI/LayerZero/Hyperlane/chainid.network birleşimi, 178 aday testnet, ekleme ipuçları |
| Testler | 55 birim testi (graf, gaz, skorlama, planlayıcı, motor, registry, kapsama, token keşfi, risk) |
| Test edilemeyen | Cüzdan bağlı gerçek imza akışı (tarayıcı otomasyonunda cüzdan yok). Motor birim testlerle kapsandı; gerçek Sepolia denemesi yapılmalı |

---

## 2. Mimari değerlendirme

**Güçlü yanlar**
- `core` (saf mantık) → `registry` (veri) → `providers` (adaptörler) → `web` katmanlaması net; çekirdek React'ten bağımsız, CLI ile aynı kod çalışıyor (`pnpm discover`).
- Her kenar canlı doğrulamayla doğuyor (havuz + likidite + quote; API rota listesi; bytecode). "Protokol destekliyor" bilgisi tek başına rota üretmiyor.
- Kimlik = zincir + kontrat + temsil; sembol asla kimlik değil. Arc'ın 18/6 decimal farkı tek yerde normalize ediliyor.
- Kaynak izlenebilirliği (`SourceProvenance`) her kenarda; "Why this route?" çekmecesi bunu gösteriyor.

**Zayıf yanlar / teknik borç**
- Keşif ve planlama tamamen istemcide; her kullanıcı aynı graf keşfini tekrar yapıyor. Paylaşılan, sunucu tarafı önbellekli bir capability graph (Next route + 5–10 dk revalidate) hem hızı hem RPC yükünü düzeltir.
- Gaz tahmini baseline sabitleri + quoter tahmini; OP Stack zincirlerde L1 veri ücreti hesaba katılmıyor. Gerçek `estimateGas` ve L1 fee oracle eklenmeli.
- Kalıcılık `localStorage` (5 MB sınırı); büyük planlar ve yürütme geçmişi için IndexedDB'ye geçilmeli.
- `RouteExecutor` tek rota; çok rotalı batch sıralı. Aynı zincirde birden fazla varlığı tek köprüye toplayan "yerel konsolidasyon" (spec §18) henüz yok.
- Provider hata sınıflandırması dizgi eşleştirmesine dayanıyor (`classifyError`); viem hata tipleri üzerinden yapılmalı.
- Blockscout ilk 2 sayfa (100 token) ile sınırlı; büyük cüzdanlarda eksik kalır.

---

## 3. Optimizasyon fırsatları

**Süre (ölçümler örnek cüzdan içindir)**
1. **Paylaşılan keşif önbelleği**: Uniswap havuz sondaları ve Across rota listesi kullanıcıdan bağımsız. `/api/discovery` ile sunucuda üretilip 5 dk paylaşılırsa istemci keşfi 17 sn → <1 sn.
2. **Artımlı planlama**: hedef veya mod değişince yalnızca etkilenen kaynaklar yeniden quote alınmalı (bugün tüm plan yenileniyor). Quote önbelleği (edge+amount) zaten var; plan düzeyinde delta güncellemesi eklenmeli.
3. **Quote paralelliği**: kaynaklar 4 paralel, yol içi seri. CCTP ücret tablosu önbellekli; Uniswap quote'ları `multicall` ile toplu simüle edilebilir (QuoterV2 revert-tabanlı olduğu için `simulateContract` gerekiyor; alternatif: `eth_call` batch RPC).
4. **Blockscout + havuz sondasını birleştirme**: token keşfi ve havuz kontrolü tek akışta, sonuç 5 dk önbellekte (var); ek olarak "bilinen satılabilir token" listesi cüzdanlar arası paylaşılabilir.
5. **Web Worker**: planlama ana iş parçacığını kilitlemiyor ama büyük planlarda UI takılabiliyor; planner'ı worker'a taşımak kolay (saf fonksiyon).

**Doğruluk**
6. **Gerçek gaz tahmini**: build aşamasında `estimateGas` + OP Stack `GasPriceOracle.getL1Fee`; rezerv buna göre.
7. **Quote yaşlanması**: kartlarda "quote 32 sn önce" göstergesi ve otomatik yenileme (30 sn) — süresi dolan quote şu an yalnızca yürütmede yenileniyor.
8. **Fiyat etkisi**: marjinal sonda yerine `sqrtPriceX96After` ile tam hesap (QuoterV2 döndürüyor); ek RPC çağrısı kalkar.

---

## 4. Yapısal iyileştirmeler

- **Provider sözleşmesi**: `discover` için zincir başına artımlı çağrı ve `health()` (API erişilebilir mi, son başarılı keşif ne zaman). Protocols sayfası bunu gösterir.
- **Yürütme**:
  - Permit2 / EIP-2612 ile approve işlemini imzaya dönüştürmek (spec Faz 5).
  - Universal Router ile wrap + swap + unwrap tek işlem.
  - Nonce/replacement yönetimi: kullanıcı cüzdanda hızlandırırsa hash değişir; `waitForTransactionReceipt` yerine nonce takibi.
  - Cüzdan bağlantısı koparsa yürütme "PAUSED" durumuna geçmeli, "FAILED" değil.
- **Yerel konsolidasyon (spec §18)**: aynı zincirdeki ETH + token + USDC → önce tek USDC'ye topla → tek CCTP burn. İşlem sayısını ve hedef mint gazını düşürür. Planlayıcıda "chain plan" katmanı gerekir.
- **Kalıcılık**: IndexedDB (idb-keyval) + bigint serializer; plan geçmişi; dışa aktarma.
- **Test altyapısı**: Anvil ile Sepolia fork'u üzerinde uçtan uca yürütme testi (approve → swap → burn) CI'da; provider'lar için kayıtlı HTTP fikstürleri.
- **Hata modeli**: `ExecutionError` kodları viem'in `BaseError` sınıflarından türetilsin; kullanıcıya "ne yapmalı" önerisi eşlik etsin (ör. INSUFFICIENT_GAS → faucet linki).

---

## 5. Rota ve zincir genişletme

**Sağlayıcılar (spec Faz 4)**
| Sağlayıcı | Kazanım | Zorluk |
|---|---|---|
| Circle Forwarding Service | Hedef mint'i Circle yapar; hedef zincirde gaz gerekmez (bugün en sık "needs gas on Base" engeli) | Düşük–orta: ücret sorgusu + `depositForBurnWithHook` |
| Circle Gateway | Çok zincirli birleşik USDC bakiyesi (preset "USDC unified balance") | Orta |
| LI.FI | Dış aday + karşılaştırma; 5 testnet | Düşük (REST) |
| LayerZero OFT / Stargate | Testnet OFT varlıkları; EID'ler hazır (`/coverage`) | Orta: OFT metadata + `quoteSend` |
| Hyperlane Warp | Registry'de 348 zincir; testnet warp rotaları | Orta |
| Wormhole NTT | Issuer varlıkları | Orta–yüksek |
| OP Standard Bridge çekim (L2→L1) + Superchain interop | Sepolia'ya dönüş; bugün yalnızca yatırma var | Yüksek (7 gün / kanıt penceresi; UX zor) |

**Zincirler**: `/coverage` "3+ sağlayıcı" listesi hazır: Linea Sepolia, Ink Sepolia, Sonic Blaze, HyperEVM, Plume, BNB testnet. Eklemek = `chains.ts` + USDC adresi + CCTP domain; CCTP kenarları otomatik gelir. Uzun vadede registry girdileri chainid.network + Circle dizininden yarı otomatik üretilebilir (nightly job → PR).

**DEX kapsaması**: Monad/Fuji/Amoy'da Uniswap yok; MON/AVAX/POL bu yüzden rotasız. Aday DEX'ler araştırılmalı (Fuji: Trader Joe/Pangolin testnet; Amoy: QuickSwap testnet; Monad: testnet sıfırlandığı için feed güncellenmeli). Her DEX aynı adaptör kalıbına uyar.

---

## 6. Swap / alım-satım

- Uniswap **v4** quoter (Sepolia, Base, Arbitrum, Unichain feed'de var) ve **v2** havuzları (Unichain); daha fazla likidite.
- **Bölünmüş rotalar**: büyük tutarlarda fee tier'lar/havuzlar arasında bölme; fiyat etkisini düşürür.
- **Likidite sayfası ("satıcı biz olalım")**: kendi token'ınız için havuz + pozisyon açma (NonfungiblePositionManager); testnet projeleri için değerli.
- **Token arama**: adres yerine Blockscout arama API'siyle sembolden seçim, holder sayısı ve doğrulanmış kontrat rozeti.
- **Bilinen test tokenları registry'si**: EURC, LINK, AAVE test tokenları vb. doğrulanmış olarak; köprü politikasına takılmazlar.
- **Fiyat geçmişi**: havuz `Swap` event'lerinden basit fiyat çizgisi (son 24 saat).
- **Satış simülasyonu 2.0**: state override ile router üzerinden gerçek `exactInputSingle` simülasyonu (bugün transfer sağlamlığı kontrol ediliyor; havuz içi vergiler için yeterli değil).

---

## 7. UX / UI

- **Header** (yapıldı): logo + Router / Swap / Balances / Activity + Network ▾ + Settings. Mobilde alt gezinme çubuğu daha iyi olur.
- **İsim ve marka**: "Testnet Router" açıklayıcı ama sıradan. Öneriler: **Dustline** (toz + hat/rota), **Sweep** (süpürme), **Confluence** (akarsuların birleşmesi = konsolidasyon), **Relayer** (yanıltıcı, önerilmez). Kişisel tercihim *Dustline*: kısa, ürünün özünü (dust consolidation) anlatıyor, mono logotip ile uyumlu. Mevcut logo (kare içinde rota çizgisi + uç nokta) bu isimle de çalışır.
- **How it works** sayfası: 5 adımlı akış (Scan → Discover → Quote → Simulate → Sign) + "no route is a valid answer" ilkesi; spec §45 diyagramının sade SVG'si.
- **Docs**: repo `docs/` altında MDX: kavramlar (native ≠ ETH, temsil, canonical), sağlayıcı adaptörü yazma rehberi, registry'ye zincir ekleme, güvenlik modeli. Uygulama içinde `/docs` olarak sunulabilir.
- **Onboarding**: cüzdansız "watch address" akışı var; örnek cüzdan butonu ("try with a sample wallet") eklenebilir.
- **Rota kartı**: beklenen/minimum çıktıyı gösteren ince çubuk, ETA, explorer linkleri (adımlar tamamlandıkça), kart içinden "cancel".
- **Balances**: sıfır bakiyeleri gizle, sıralama, USDC cinsinden "tahmini değer" sütunu (quote tabanlı, USD değil).
- **Activity**: filtre (durum, zincir), CSV/JSON dışa aktarma, yeniden deneme toplu.
- **Bildirimler**: uzun süren attestation/relay beklemelerinde tarayıcı bildirimi.
- **Erişilebilirlik**: klavye ile kart seçimi (yapıldı: radio rolü), odak halkaları, ekran okuyucu etiketleri gözden geçirilmeli.
- **i18n**: TR/EN; metinler bileşenlerde gömülü, önce sözlüğe çıkarılmalı.

---

## 8. Güvenlik ve doğruluk

- Yapılanlar: tam tutarlı approve, spender registry'den, chain ID doğrulama, imzadan önce simülasyon, süresi dolmuş quote engeli, doğrulanmamış token için swap-first politikası, transfer sağlamlık kontrolü, sembol/isim sanitizasyonu.
- Eklenmeli:
  - **RPC çapraz doğrulama**: kritik okumalar (bakiye, allowance) iki RPC'den karşılaştırılsın; uyuşmazlıkta uyarı.
  - **Allowance temizliği**: yürütme sonrası artık allowance varsa "revoke" adımı önerisi.
  - **Adres/kontrat kontrolü**: router, TokenMessenger gibi spender adreslerinin bytecode hash'i registry'de tutulup açılışta karşılaştırılsın (proxy yükseltmelerine karşı sinyal).
  - **İmza önizleme**: her tx için insan okunur özet (calldata decode) zaten mümkün; kartta göster.
  - **Rate limit / hata bütçesi**: Iris 40 req/s; global istek bütçesi ve backoff merkezi olmalı.

---

## 9. Operasyon ve kalite

- **CI**: GitHub Actions ile typecheck + test; gecelik `pnpm probe` + `pnpm coverage` (registry tazeliği; sapma varsa issue aç).
- **Deploy**: Vercel/Node; `/api/feeds/uniswap` ve `/api/coverage` sunucu tarafı önbellek; ileride paylaşılan keşif önbelleği.
- **Gözlemlenebilirlik**: provider hata oranı, quote süresi, plan süresi (istemci tarafı, gizlilik korumalı).
- **Sürümleme**: registry değişiklikleri için CHANGELOG; `lastVerifiedAt` otomatik güncellensin.

---

## 10. Önerilen sıra

**Sprint 1 — güvenilir yürütme (1–2 hafta)**
1. Anvil fork'unda gerçek uçtan uca yürütme testleri (Sepolia: approve → swap → CCTP burn → mint).
2. Gerçek `estimateGas` + OP Stack L1 fee; quote yaşlanma göstergesi ve otomatik yenileme.
3. Circle Forwarding Service (hedef gaz engelini kaldırır).
4. Hata modeli + "ne yapmalı" önerileri; PAUSED durumu.

**Sprint 2 — kapsam (2 hafta)**
5. Paylaşılan sunucu tarafı keşif önbelleği; artımlı planlama.
6. Yeni zincirler: Linea Sepolia, Ink Sepolia, Sonic Blaze, HyperEVM (Circle USDC'li adaylar).
7. LI.FI + LayerZero OFT adaptörleri; Uniswap v4 quoter.
8. Yerel konsolidasyon (tek köprü).

**Sprint 3 — ürün (2 hafta)**
9. How it works + Docs, isim/marka kararı, mobil gezinme.
10. Likidite sayfası, token arama, Activity dışa aktarma, IndexedDB.
11. CI + gecelik registry tazelik işi.

---

*Bu doküman her önemli değişiklikte güncellenmeli; sayılar `pnpm discover` ve `pnpm coverage` çıktılarından alınmıştır.*
