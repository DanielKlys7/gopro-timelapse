# GoPro Multi-Camera Controller

Prosty kontroler do zarządzania wieloma kamerami GoPro Hero 12 Black jednocześnie przez WiFi (tryb COHN/STA).

## Wymagania

- Node.js 16+
- Kamery GoPro Hero 12 Black połączone do Twojej sieci WiFi
- Adresy IP kamer

## Instalacja

```bash
npm install
```

## Konfiguracja kamer (jednorazowo)

Aby połączyć kamery z Twoją siecią WiFi, użyj starego index.ts (backup):

```bash
# Przywróć stary plik
mv index.ts.backup index.ts

# Uruchom konfigurację COHN dla każdej kamery
npm run connect

# Po skonfigurowaniu, przywróć nowy plik
git checkout index.ts
```

Lub skonfiguruj ręcznie przez menu GoPro:

1. Preferences → Connections → Connect Device → GoPro App
2. Lub użyj aplikacji GoPro Quik na telefonie

## Użycie

Wszystkie komendy wymagają listy IP kamer oddzielonych przecinkami.

### 1. Sprawdź status kamer

```bash
npm run status -- -c 192.168.0.142,192.168.0.143,192.168.0.144
```

### 2. Start timelapse (5 minut)

```bash
npm run start-timelapse -- -c 192.168.0.142,192.168.0.143,192.168.0.144
```

### 3. Stop timelapse

```bash
npm run stop-timelapse -- -c 192.168.0.142,192.168.0.143,192.168.0.144
```

### 4. Wylistuj pliki

```bash
npm run list-files -- -c 192.168.0.142,192.168.0.143,192.168.0.144
```

### 5. Pobierz wszystkie pliki

```bash
npm run download-files -- -c 192.168.0.142,192.168.0.143,192.168.0.144
```

Pliki zostaną zapisane w `./downloads/camera_1_192_168_0_142/`, `./downloads/camera_2_192_168_0_143/`, etc.

Własny katalog:

```bash
npm run download-files -- -c 192.168.0.142,192.168.0.143 -o ./moje-zdjecia
```

### 6. Usuń wszystkie pliki

**⚠️ UWAGA: Nieodwracalne!**

```bash
npm run delete-files -- --confirm -c 192.168.0.142,192.168.0.143,192.168.0.144
```

## Workflow - Kompletny przepływ pracy

```bash
# 1. Sprawdź czy wszystkie kamery są dostępne
npm run status -- -c 192.168.0.142,192.168.0.143,192.168.0.144

# 2. Start timelapse na wszystkich kamerach
npm run start-timelapse -- -c 192.168.0.142,192.168.0.143,192.168.0.144

# 3. Poczekaj 5 minut lub zatrzymaj wcześniej
npm run stop-timelapse -- -c 192.168.0.142,192.168.0.143,192.168.0.144

# 4. Zobacz co zostało nagrane
npm run list-files -- -c 192.168.0.142,192.168.0.143,192.168.0.144

# 5. Pobierz wszystkie pliki
npm run download-files -- -c 192.168.0.142,192.168.0.143,192.168.0.144

# 6. Wyczyść kamery
npm run delete-files -- --confirm -c 192.168.0.142,192.168.0.143,192.168.0.144
```

## Skrót dla Twoich kamer

Możesz dodać alias w `.bashrc` lub `.zshrc`:

```bash
# ~/.zshrc
alias gopro-cams="192.168.0.142,192.168.0.143,192.168.0.144"
```

Potem:

```bash
npm run start-timelapse -- -c $(echo $gopro-cams)
```

Lub stwórz zmienną środowiskową:

```bash
export GOPRO_CAMERAS="192.168.0.142,192.168.0.143,192.168.0.144"
```

I zmodyfikuj `package.json` aby używać tej zmiennej.

## Równoległe wykonywanie

Wszystkie operacje są wykonywane **równolegle** na wszystkich kamerach jednocześnie, co oznacza:

- Wszystkie kamery zaczynają timelapse w tym samym czasie
- Pobieranie odbywa się równolegle (szybciej)
- Jeśli jedna kamera zawiedzie, pozostałe kontynuują

## Przykładowy output

```
📷 Executing on 3 camera(s)...

[Camera 1] 192.168.0.142 - Starting...
[Camera 2] 192.168.0.143 - Starting...
[Camera 3] 192.168.0.144 - Starting...
[Camera 1] 192.168.0.142 - Timelapse started (5 minutes)
[Camera 1] 192.168.0.142 - ✓ Success
[Camera 2] 192.168.0.143 - Timelapse started (5 minutes)
[Camera 2] 192.168.0.143 - ✓ Success
[Camera 3] 192.168.0.144 - Timelapse started (5 minutes)
[Camera 3] 192.168.0.144 - ✓ Success

📊 Summary: 3 successful, 0 failed

✅ All cameras started timelapse!
⏱️  Timelapse duration: 5 minutes
```

## Rozwiązywanie problemów

### "Connection timeout" lub "ECONNREFUSED"

1. Sprawdź czy kamery są włączone
2. Sprawdź czy IP są poprawne
3. Użyj `npm run status` aby zdiagnozować problem
4. Sprawdź czy kamery są w tej samej sieci co komputer

### "Some cameras failed"

Aplikacja kontynuuje mimo błędów. Sprawdź które kamery zawiodły w logach i spróbuj ponownie tylko dla nich.

### Znalezienie IP kamer

```bash
# Skanuj sieć
nmap -sn 192.168.0.0/24

# Lub sprawdź w routerze DHCP Client List
# Szukaj urządzeń z nazwą "GoPro"
```

## API Reference

Zobacz `gopro-wifi.ts` dla wszystkich dostępnych metod.

## Licencja

MIT
