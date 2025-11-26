# 📧 Instrukcja konfiguracji AWS SES i SNS

Ten dokument zawiera krok po kroku instrukcje konfiguracji powiadomień email (AWS SES) i SMS (AWS SNS).

---

## 🔐 Krok 1: Utwórz użytkownika IAM z odpowiednimi uprawnieniami

1. Zaloguj się do [AWS Console](https://console.aws.amazon.com/)
2. Przejdź do **IAM** (Identity and Access Management)
3. W menu po lewej wybierz **Users** → **Create user**
4. Podaj nazwę użytkownika, np. `gopro-notifications`
5. Zaznacz **Provide user access to the AWS Management Console** - **NIE** (nie potrzebujemy dostępu do konsoli)
6. Kliknij **Next**

### Uprawnienia:

7. Wybierz **Attach policies directly**
8. Wyszukaj i zaznacz następujące polityki:
   - `AmazonSESFullAccess` (dla email)
   - `AmazonSNSFullAccess` (dla SMS)
9. Kliknij **Next** → **Create user**

### Uzyskaj klucze dostępu:

10. Wejdź w utworzonego użytkownika
11. Przejdź do zakładki **Security credentials**
12. Kliknij **Create access key**
13. Wybierz **Application running outside AWS**
14. Kliknij **Next** → **Create access key**
15. **WAŻNE**: Zapisz gdzieś bezpiecznie:

    - `Access key ID` (np. AKIAIOSFODNN7EXAMPLE)
    - `Secret access key` (np. wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY)

16. Dodaj je do pliku `.env`:

```bash
AWS_ACCESS_KEY_ID=TWOJ_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=TWOJ_SECRET_ACCESS_KEY
AWS_REGION=us-east-1
```

---

## 📧 Krok 2: Konfiguracja AWS SES (Email)

### 2.1 Zweryfikuj adres email nadawcy

AWS SES wymaga weryfikacji adresów email zanim będziesz mógł z nich wysyłać.

1. Otwórz [AWS SES Console](https://console.aws.amazon.com/ses/)
2. **WAŻNE**: Upewnij się, że jesteś w odpowiednim regionie (np. `us-east-1` w górnym prawym rogu)
3. W menu po lewej wybierz **Verified identities**
4. Kliknij **Create identity**

#### Opcja A: Weryfikacja pojedynczego emaila (dla testów)

5. Wybierz **Email address**
6. Wpisz swój email (np. `twoj-email@gmail.com`)
7. Kliknij **Create identity**
8. Sprawdź swoją skrzynkę email i kliknij link weryfikacyjny
9. Status zmieni się na **Verified** ✅

#### Opcja B: Weryfikacja całej domeny (dla produkcji)

5. Wybierz **Domain**
6. Wpisz swoją domenę (np. `example.com`)
7. Kliknij **Create identity**
8. AWS pokaże rekordy DNS, które musisz dodać u swojego rejestratora domeny
9. Po dodaniu rekordów DNS, weryfikacja zajmie do 72h (zwykle kilka minut)

### 2.2 Wyjdź z Sandbox Mode (WAŻNE!)

Domyślnie AWS SES jest w **Sandbox Mode**, co oznacza:

- ❌ Możesz wysyłać TYLKO do zweryfikowanych adresów email
- ❌ Limit 200 wiadomości dziennie
- ❌ Nie możesz wysyłać do losowych adresów

Aby to zmienić:

1. W [AWS SES Console](https://console.aws.amazon.com/ses/)
2. Menu po lewej → **Account dashboard**
3. Jeśli widzisz **"Your account is in the sandbox"**, kliknij **Request production access**
4. Wypełnij formularz:
   - **Mail type**: Transactional
   - **Website URL**: Twoja strona lub napisz "N/A"
   - **Use case description**: Przykład:
     ```
     I'm building an automated GoPro camera monitoring system that needs to send
     error notifications to my email when the camera system encounters issues.
     Expected volume: 1-10 emails per day maximum.
     ```
   - **Additional contacts**: Zostaw puste lub dodaj swój email
5. Kliknij **Submit request**
6. **AWS zazwyczaj odpowiada w ciągu 24h** (często szybciej!)

### 2.3 Skonfiguruj .env

```bash
EMAIL_NOTIFICATIONS=true
NOTIFICATION_EMAIL_FROM=twoj-zweryfikowany-email@gmail.com
NOTIFICATION_EMAIL_TO=email-na-ktory-dostaniesz-alert@gmail.com
```

### 2.4 Test email

Stwórz testowy skrypt `test-notifications.ts`:

```typescript
import { getNotificationHandler } from "./notification-handler";

const notifier = getNotificationHandler();
notifier.sendError("test", "To jest testowa wiadomość email", "192.168.1.100");
console.log("Test email wysłany!");
```

Uruchom:

```bash
ts-node test-notifications.ts
```

---

## 📱 Krok 3: Konfiguracja AWS SNS (SMS)

### 3.1 Ustaw Sandbox dla SMS (opcjonalne - tylko do testów)

1. Otwórz [AWS SNS Console](https://console.aws.amazon.com/sns/)
2. **WAŻNE**: Upewnij się, że jesteś w regionie, który obsługuje SMS (np. `us-east-1`)
3. Menu po lewej → **Text messaging (SMS)** → **Sandbox destination phone numbers**

### 3.2 Dodaj numer telefonu do Sandbox (dla testów)

1. Kliknij **Add phone number**
2. Wpisz swój numer w formacie międzynarodowym: `+48123456789` (Polska to +48)
3. Wybierz język weryfikacji
4. Kliknij **Add phone number**
5. **Otrzymasz SMS z kodem weryfikacyjnym**
6. Wpisz kod i kliknij **Verify phone number**

### 3.3 Wyjdź z Sandbox Mode (dla produkcji)

**UWAGA**: SNS SMS jest droższy i może wymagać dodatkowej weryfikacji!

1. W [AWS SNS Console](https://console.aws.amazon.com/sns/)
2. Menu po lewej → **Text messaging (SMS)** → **Account information**
3. Kliknij **Request to move to production**
4. Wypełnij formularz podobnie jak dla SES

### 3.4 Skonfiguruj domyślne ustawienia SMS (opcjonalne)

1. W SNS Console → **Text messaging (SMS)** → **Delivery status logging**
2. Możesz włączyć logi, aby śledzić dostarczanie SMS
3. W **Default message type** możesz wybrać:
   - **Promotional** - tańsze, ale może mieć opóźnienia
   - **Transactional** - droższe (~$0.006/SMS w Polsce), ale priorytetowe

### 3.5 Sprawdź ceny SMS

AWS SNS SMS są płatne według kraju:

- 🇵🇱 Polska: ~$0.006 - $0.08 za SMS
- 🇺🇸 USA: ~$0.006 za SMS
- Pełna lista: [AWS SNS Pricing](https://aws.amazon.com/sns/pricing/)

### 3.6 Skonfiguruj .env

```bash
SMS_NOTIFICATIONS=true
NOTIFICATION_PHONE=+48123456789
```

### 3.7 Test SMS

```bash
ts-node test-notifications.ts
```

---

## 🚀 Krok 4: Alternatywa - ntfy.sh (NAJŁATWIEJSZA, DARMOWA!)

Jeśli nie chcesz konfigurować AWS SES/SNS, użyj **ntfy.sh** - darmowy, bez rejestracji!

1. Wybierz unikalny temat (topic), np. `gopro-alerts-twoj-unikalny-token-12345`
2. Pobierz aplikację ntfy na telefon:
   - [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
   - [iOS](https://apps.apple.com/app/ntfy/id1625396347)
3. W aplikacji dodaj subskrypcję swojego tematu
4. Skonfiguruj `.env`:

```bash
NOTIFICATIONS_ENABLED=true
NOTIFICATION_WEBHOOK_URL=https://ntfy.sh/gopro-alerts-twoj-unikalny-token-12345
```

**Gotowe!** 🎉 Będziesz dostawać powiadomienia push na telefon!

### Test ntfy.sh

```bash
curl -d "Test notification from GoPro system" https://ntfy.sh/gopro-alerts-twoj-unikalny-token-12345
```

---

## ✅ Krok 5: Włącz notyfikacje

W pliku `.env`:

```bash
# Włącz system notyfikacji
NOTIFICATIONS_ENABLED=true

# Wybierz metodę (możesz włączyć kilka naraz):
EMAIL_NOTIFICATIONS=true
SMS_NOTIFICATIONS=true
NOTIFICATION_WEBHOOK_URL=https://ntfy.sh/twoj-temat
```

---

## 🧪 Testowanie

Stwórz plik `test-notifications.ts`:

```typescript
import { getNotificationHandler } from "./notification-handler";

async function test() {
  const notifier = getNotificationHandler();

  console.log("Wysyłam testowe powiadomienie...");
  await notifier.sendError(
    "test-action",
    "To jest testowy błąd z systemu GoPro",
    "192.168.1.100"
  );

  console.log("✅ Sprawdź swój email/telefon/ntfy!");
}

test();
```

Uruchom:

```bash
ts-node test-notifications.ts
```

---

## 💰 Koszty

### AWS SES (Email):

- **Darmowe**: 62,000 emaili/miesiąc (jeśli wysyłasz z EC2)
- **Poza EC2**: Pierwsze 1,000 emaili: $0, następne: $0.10/1000 emaili
- **Twój przypadek**: Prawdopodobnie kilka emaili dziennie = **DARMOWE** ✅

### AWS SNS (SMS):

- **Brak darmowego tier**
- Polska: ~$0.006-$0.08 za SMS
- Przy 5-10 SMS/dzień: ~$1-5/miesiąc

### ntfy.sh:

- **100% DARMOWE** ✅
- Bez limitów dla normalnego użycia

---

## 🔍 Troubleshooting

### Email nie przychodzi:

1. ✅ Sprawdź spam/folder promocje
2. ✅ Zweryfikuj, że email nadawcy jest zweryfikowany w SES
3. ✅ Sprawdź czy AWS_REGION w .env zgadza się z regionem w SES Console
4. ✅ Upewnij się, że wyszedłeś z Sandbox Mode (jeśli wysyłasz do niezweryfikowanego emaila)

### SMS nie przychodzi:

1. ✅ Sprawdź format numeru: musi zaczynać się od `+` (np. `+48123456789`)
2. ✅ Zweryfikuj, że numer jest dodany do Sandbox (jeśli jesteś w Sandbox)
3. ✅ Sprawdź region - nie wszystkie regiony AWS obsługują SMS
4. ✅ Sprawdź bilanse AWS - SNS SMS wymaga środków na koncie

### Błąd "AccessDenied":

1. ✅ Sprawdź czy użytkownik IAM ma odpowiednie uprawnienia (SESFullAccess, SNSFullAccess)
2. ✅ Sprawdź czy klucze AWS w .env są poprawne

---

## 📝 Rekomendacja

**Dla szybkiego startu**: Użyj **ntfy.sh** - działa natychmiast, za darmo, bez konfiguracji AWS!

**Dla produkcji**:

- **Email**: AWS SES (darmowy, niezawodny)
- **SMS**: ntfy.sh (darmowy) lub AWS SNS (płatny, ale bardziej niezawodny)

**Możesz włączyć wszystkie 3 metody naraz!** 🚀
