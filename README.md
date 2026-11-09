# Körklar

Ett svenskt feedbackverktyg för trafiklärare. Välj elev, diktera eller skriv anteckningar, granska AI-förslaget och godkänn ett SMS eller mejl. Projektet är byggt direkt i arbetsmappen och inte publicerat.

## Starta på Windows

Kräver Node.js 24 eller senare. Kör i projektmappen:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Öppna `.env` och sätt `PILOT_ACCESS_CODE` till en egen slumpmässig kod med minst 16 tecken. Starta:

```powershell
npm.cmd run dev
```

Öppna **http://localhost:3000** och ange koden. Ingen elevdata läggs in automatiskt. Register, historik och utkast fungerar utan externa API-nycklar. AI och utskick visar tydliga fel om konfiguration saknas; inga svar eller utskick simuleras.

`npm.cmd` används eftersom Windows kan blockera `npm.ps1`. På andra system fungerar `npm`.

## Teknik och struktur

- React och Vite för ett responsivt gränssnitt. Lucide för ikoner och lokala systemtypsnitt utan externa fontanrop.
- Express 5 på Node.js 24 för serverbaserad åtkomstkontroll och leverantörsanrop.
- SQLite via `node:sqlite`: riktig persistent databas, transaktionellt utskickslås och kaskadradering. Node kan visa en experimentvarning för SQLite-modulen.
- `src/`: gränssnitt och design. `server/`: databas, API, separat AI-prompt, validering och externa integrationer. `tests/`: automatiska tester.

SQLite passar en begränsad pilot med en serverinstans. Datamodellen har organisationer, organisationskoppling på elever/feedback och förberett lärar-ID. Nuvarande server använder en fast pilotorganisation. Inför flera skolor behövs riktig autentisering, organisationsmedlemskap och auktorisering på varje anrop; befintliga fält innebär inte färdig fleranvändarsäkerhet. PostgreSQL är ett naturligt nästa steg för flera serverinstanser.

## Miljövariabler

Alla hemligheter finns endast på servern. `.env` och `data/` ignoreras av Git.

| Variabel | Funktion |
| --- | --- |
| `HOST` | Bindningsadress, lokalt `127.0.0.1`; i container `0.0.0.0` |
| `PORT` | Port, standard 3000 |
| `APP_ORIGIN` | Exakt adress som öppnas i webbläsaren, exempelvis `http://localhost:3000`. Använd HTTPS-adressen vid publicering. |
| `PILOT_ACCESS_CODE` | Gemensam hemlig kod, minst 16 tecken |
| `NODE_ENV` | `development` lokalt, `production` vid driftsättning |
| `DATABASE_PATH` | Databasfil, standard `./data/korklar.sqlite` |
| `OPENAI_API_KEY` | OpenAI-projektets API-nyckel |
| `OPENAI_TEXT_MODEL` | Textmodell, standard `gpt-4.1-mini`; välj en modell som kontot har tillgång till |
| `OPENAI_TRANSCRIBE_MODEL` | Transkriberingsmodell, standard `gpt-transcribe` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio-konto och serverhemlighet |
| `TWILIO_FROM` | En avsändare som är godkänd för kontot och svenska mottagare |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend-nyckel och avsändare på verifierad domän |
| `SEND_ENABLED` | Måste vara `true` för att externa utskick ska tillåtas |

Starta om servern efter konfigurationsändringar.

## OpenAI

Skapa en API-nyckel i ett projekt med fakturering och tillgång till modellerna. Lägg den i `OPENAI_API_KEY`. Inspelning använder MediaRecorder och skickar ljud till servern, som anropar OpenAI:s transkriberings-API med svenska som språk. Mikrofon kräver localhost eller HTTPS, användarens tillstånd och webbläsarstöd. Inspelning stoppas efter tre minuter. Servern accepterar högst 20 MB.

Ljudet hålls endast i minnet under bearbetningen; inga ljudfiler skrivs till disk. Vid fel får läraren spela in igen eller skriva. Textgenerering använder Responses API med `store:false`. Leverantörens egna lagringsvillkor behöver fortfarande granskas. Den separata prompten i `server/prompt.js` instruerar modellen att behålla innebörden och inte lägga till fakta. Detta är ingen garanti mot modellfel: läraren måste alltid läsa resultatet.

Dokumentation: [transkribering](https://developers.openai.com/api/docs/guides/speech-to-text), [textgenerering](https://developers.openai.com/api/docs/guides/text).

## Twilio och SMS

Konfigurera ett Twilio-konto, godkänd avsändare och tillåtna destinationer. Trial-konton kan kräva verifierade mottagare. Ange de tre Twilio-variablerna. Telefonnummer valideras med libphonenumber och svenska nummer normaliseras till E.164. SMS skickas via Twilios Messages API.

Gränssnittet uppskattar GSM-7/UCS-2-segment inklusive GSM-utökningstecken. Unicode och långa meddelanden kan bli flera debiterade SMS. Slutlig segmentering och kostnad bestäms av leverantören.

Dokumentation: [Twilio Messages](https://www.twilio.com/docs/messaging/api/message-resource).

## Resend och mejl

Verifiera en avsändardomän i Resend och lägg in deras DNS-poster. Ange `RESEND_API_KEY` och `EMAIL_FROM`, exempelvis `Trafikskolan <lektion@din-verifierade-doman.se>`. Mejlet har en enkel HTML-mall och en textversion. Elevtext HTML-escapas. Utskickets ID används som Resends idempotensnyckel.

Dokumentation: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email).

## Utskick och status

Ett meddelande sparas innan leverantörsanropet. Knappen i granskningsdialogen är lärarens uttryckliga godkännande. Databasen byter atomärt status från `draft` till `sending`: parallella klick på samma ID kan inte skicka igen. Ett sparat utskick är en oföränderlig ögonblicksbild av mottagare och text.

- **Sparat utkast:** inte skickat; kan öppnas för vidare redigering. Redigering sparas som ett nytt utkast så att historiken bevaras.
- **Behandlas:** leverantörsanrop pågår.
- **Accepterat av tjänsten:** leverantören har returnerat ett ID. **Detta bekräftar inte leverans.**
- **Misslyckat:** leverantören avvisade begäran.
- **Okänd status:** exempelvis nätverkstimeout eller omstart under utskick. Kontrollera Twilio/Resend innan nytt utskick skapas. Systemet försöker inte skicka automatiskt igen.

Verifierade leveranswebhooks ingår inte. Faktisk leverans kontrolleras i respektive leverantörs dashboard. Leverantörs-ID finns i databasen. Samma utkast kan inte skickas om, men en medvetet skapad ny feedbackpost är ett nytt utskick.

## Dataskydd och pilotåtkomst

Alla data- och integrationsendpoints kräver en giltig serverbaserad session. Cookien är HttpOnly, SameSite=Strict och Secure i produktion. Sessionen gäller åtta timmar, lagras hashad i SQLite och kan återkallas genom att låsa arbetsytan. Vid utgång kan läraren öppna åtkomsten igen utan att React-vyns texter rensas. Omladdning återställer osparad text: sidan varnar innan man lämnar, och knappen **Spara utkast** ger beständig lagring. Inga elevuppgifter sparas i localStorage.

Servern verifierar Origin för förändrande anrop. Begränsningar: 100 API-anrop/minut/IP, 10 AI-anrop/minut/IP, 30 utskicksförsök/timme/IP och 8 åtkomstförsök/15 minuter/IP. Bakom proxy används proxyadressen om inte en granskad trust-proxy-konfiguration införs. Detta är konservativt men kan ge delade begränsningar. Ingen automatisk tillit till klientens X-Forwarded-For.

Radera en elev under **Elever** för att också radera historiken. Radering blockeras under pågående utskick. Backuper och uppgifter hos externa leverantörer omfattas inte av den lokala raderingen.

Innan verkliga elevuppgifter används behöver trafikskolan fastställa personuppgiftsansvar, rättslig grund, biträdesavtal, leverantörers regioner och eventuella överföringar, elevinformation, retention och backupgallring. Detta projekt är inte en färdig juridisk integritetspolicy. Undvik känsliga uppgifter i inspelningar. Ingen innehållsloggning är implementerad. Skydda servern och databasfilerna med OS-behörigheter, krypterad volym och krypterade backuper; SQLite-filen är inte krypterad av applikationen.

## Bygg och driftsätt

```powershell
npm.cmd run build
# Sätt NODE_ENV=production i .env
npm.cmd start
```

Driftsätt på en Node 24-server eller container med en **beständig diskvolym** för databasfilen och dess WAL/SHM-filer. Kör en instans. Använd en HTTPS reverse proxy, sätt korrekt `APP_ORIGIN` och tillför hemligheter via driftplattformen. Serverless-tjänster med tillfälligt filsystem passar inte denna SQLite-version. Behåll porten privat bakom proxyn. Sätt en stark pilotkod och dela den bara med betrodda lärare. Vid kodbyte ska befintliga sessioner också återkallas genom att tömma tabellen `sessions`.

Ta konsekventa SQLite-backuper med SQLite backup API/verktyg, eller stoppa servern före en filbackup. Testa återställning och radering av äldre backuper. `data/` får aldrig publiceras som statiska filer. Ingen tjänst har publicerats av denna implementation.

## Tester och säker verifiering av riktiga tjänster

```powershell
npm.cmd run build
npm.cmd test
```

Automatiska tester täcker svensk telefonvalidering, SMS-segment, databasbeständighet, atomärt utskickslås, omstart, kaskadradering, åtkomst, Origin-skydd, elevflöde, historik, konfigurationsfel och leverantörskontrakt med mockade svar. Testerna använder en temporär databas och skickar aldrig externa meddelanden.

För verklig verifiering:

1. Använd en separat testdatabas och din egen kontaktinformation som test-elev.
2. Konfigurera OpenAI och testa svensk diktering, transkription och redigering. Testa även nekad mikrofonåtkomst.
3. Kontrollera en kort textgenerering mot originalanteckningarna.
4. Konfigurera leverantörerna och sätt `SEND_ENABLED=true` först när mottagarna är dina egna verifierade testadresser/nummer.
5. Granska och skicka ett kort test-SMS och ett testmejl. Kontrollera både appens accepterad-status, leverantörens logg och mottagen leverans.
6. Testa mobil via HTTPS, avbrutet nätverk och låst/utgången session. Sätt `SEND_ENABLED=false` igen efter test vid behov.

Riktiga AI-anrop, SMS och mejl kräver egna konton/nycklar och har inte verifierats utan dem.
