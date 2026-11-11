# Körklar

Ett svenskt feedbackverktyg för trafiklärare. Välj elev, diktera eller skriv anteckningar, granska AI-förslaget och godkänn ett SMS eller mejl. Projektet är byggt direkt i arbetsmappen och inte publicerat.

## Lokal demo – utan betalda tjänster

`DEMO_MODE=true` är nu aktiverat lokalt och finns i `.env.example`. Samma webbapp, CSS, navigation och komponenter används. Ändringarna gäller funktionskopplingar samt tydliga status- och feltexter i befintliga fält.

- **Inspelning:** befintlig mikrofonknapp startar `getUserMedia` och `MediaRecorder`. Taligenkänning (`SpeechRecognition`/`webkitSpeechRecognition`, `sv-SE`) startar samtidigt och lyssnar live. Stopp väntar in det sista talresultatet. Ominspelning startar en ny ljudsession; ny text läggs till i anteckningarna så att tidigare arbete inte försvinner. Redigera eller rensa anteckningarna om du vill ersätta dem. Ingen uppspelningskomponent fanns, så ingen ny har lagts till.
- **Transkribering utan API-nyckel:** använd Chrome på localhost. Webbläsarens taltjänst kan kräva internet och behandla ljud externt; detta är inte en garanti om lokal/offline taligenkänning. Inga OpenAI-ljudanrop görs automatiskt i demoläget. Vid saknat stöd, nekad behörighet, nätverksfel eller tystnad visas ett svenskt fel och det befintliga anteckningsfältet öppnas. Ingen transkription hittas på. I vanligt läge finns OpenAI kvar som reserv om en ljudnyckel är konfigurerad.
- **Feedback:** fungerande vald AI används som vanligt. Utan konfigurerad nyckel eller vid AI-fel använder demon en enkel lokal formatterare. Den lägger en hälsning och rubrik runt de ursprungliga anteckningarna, utan att sammanfatta eller lägga till fakta. Resultatet märks **Lokalt formaterad – inte AI-genererad** i befintliga meddelanden/fält. Kortare/mer uppmuntrande kan bara utföras av AI; den lokala formatteraren bevarar innehållet även vid dessa val.
- **Utskick:** alla SMS/mejl är simulerade, även om riktiga leverantörsnycklar finns och `SEND_ENABLED=true`. Ingen leverantör anropas. Status **Simulerat utskick (demo)**, slutlig redigerad text, originalanteckningar, elevkoppling och tid sparas i SQLite. Lokal/AI-källa sparas också. Samma feedback-ID kan inte skickas dubbelt.
- **Elever:** tre fiktiva demoelever läggs till endast om registret är tomt. Befintliga elever och historik bevaras. Demoelever har `.invalid`-mejladresser. Använd dem inte för verkliga utskick efter att demoläget stängts av.

Byt till `DEMO_MODE=false` och starta om endast när riktiga tjänster ska användas. Ett utkast skapat i demoläge blockeras från verklig sändning även efter bytet. Simulerade historikposter förblir simulerade. API-nycklar behövs inte för lokal formatering, elevregister, sparade utkast eller simulerade utskick. Pilotåtkomsten är fortfarande skyddad med din befintliga kod.

### Prova i Chrome

1. Öppna `http://localhost:3000`, ange pilotkoden och välj en elev.
2. Tryck på mikrofonknappen och välj **Tillåt** när Chrome frågar. Vid problem: kontrollera webbplatsens mikrofonbehörighet och Windows **Inställningar → Sekretess och säkerhet → Mikrofon**.
3. Säg några meningar på svenska och tryck stopp. Läs och redigera anteckningarna. Taligenkänningens tillgänglighet kan variera med webbläsare, policy och nätverk.
4. Generera feedback. Utan fungerande AI ska resultatet tydligt märkas lokalt formaterat.
5. Redigera resultatet, välj SMS eller mejl, granska och skicka. Bekräftelsen och historiken ska säga **simulerat**. Ladda om sidan och kontrollera historiken.

### Verifiering

`npm.cmd test` täcker mikrofonens och igenkänningens livscykel med kontrollerade webbläsarhändelser, nekad behörighet, sen sluttranskription, fel i ljudvisualisering, saknad igenkänning, resursstädning och återinspelning. Det är inte ett test av en fysisk mikrofon.

Ett automatiskt integrationstest startar en separat server med temporär databas och förbjuder all extern trafik. Det verifierar demo utan nycklar, elevredigering, lokal feedback, redigerad sluttext, båda simulerade utskicken, dubbla klick, historik efter ny session och omstart samt skydd mot att ett demoutkast senare skickas på riktigt.

Ett separat live-test mot den startade localhost-appen kan köras med:

```powershell
node --env-file=.env scripts/check-demo-http.mjs
```

Det kräver aktivt demoläge, skapar en tillfällig elev och tar bort sina egna testuppgifter efteråt. Om en AI-nyckel fungerar gör det ett riktigt, debiterbart AI-anrop med syntetiska anteckningar; annars verifieras lokal fallback. Utskicken är alltid simulerade. Vid färdigställandet verifierades ett riktigt AI-resultat samt båda simulerade utskicken och historik genom appens HTTP-API. Fysisk mikrofon, Chromes taligenkänning och visuell webbläsarkontroll kunde inte köras i agentmiljön och behöver provas manuellt enligt stegen ovan.

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

Öppna **http://localhost:3000** och ange koden. I demoläge fylls ett tomt register med tre fiktiva elever. Register, historik och utkast fungerar utan externa API-nycklar. I demoläge finns lokal feedbackreserv och tydligt märkta simulerade utskick; i vanligt läge visas fel om en nödvändig integration saknas.

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

### Flera AI-leverantörer

#### Claude: modellval och felsökning

Claude använder nu Anthropics officiella `@anthropic-ai/sdk` enbart på servern. Den krypterade nyckeln hämtas från databasen per begäran; den skickas aldrig till klienten. SDK:n anropar en fast officiell Anthropic-adress, har en minuts timeout, ingen rå felloggning och inga automatiska omförsök som kan duplicera kostnader. Ljud fortsätter genom separat OpenAI-transkribering.

**Identifierat fel i denna installation:** modellinställningen var `Opus 5.5`, ett visningsnamn. Den sparade nyckeln gick att dekryptera och autentiserades korrekt hos Anthropic. Den avsedda modellen verifierades via Anthropics API och inställningen rättades till `claude-opus-5-5`.

Välj Claude, klistra in nyckeln vid behov och klicka **Hämta Claude-modeller**. Välj ett modell-ID ur förslagen i befintligt modellfält. Sparande validerar Claude-modellen hos Anthropic innan inställningen ändras. Ett entydigt visningsnamn kan översättas via den aktuella modellistan; okända namn eller otillgängliga modeller avvisas. **Testa anslutning** gör ett riktigt Messages-anrop och visar svaret samt verifierat modell-ID. Även feedback använder samma SDK och modellvalidering.

Vid kreditfel: öppna Anthropic Console och kontrollera **Billing** och **Limits**. En vanlig Claude-chattprenumeration ger inte automatiskt API-krediter. Vid ogiltig nyckel: skapa en API-nyckel i rätt Anthropic-arbetsyta och spara den här. Om Anthropic uttryckligen kräver ett workspace-ID, sätt `ANTHROPIC_WORKSPACE_ID` i servermiljön och starta om. Fel för nyckel, saldo/utgiftsgräns, modell, behörighet, anropsgräns, nätverk och överbelastning visas separat på svenska utan råa leverantörsmeddelanden eller nycklar.

Livekontroller kan upprepas (gör riktiga, debiterbara API-anrop):

```powershell
node --env-file=.env scripts/check-claude.mjs --generate
# Med appen igång: verifierar pilotåtkomst, modellista, anslutningstest och /api/generate.
node --env-file=.env scripts/check-claude-http.mjs
```

Det första skriptet läser nyckeln direkt ur samma krypterade databas. `--repair-model` kan läggas till för att spara det verifierade API-ID:t för ett entydigt visningsnamn. HTTP-testet skapar en egen tillfällig test-elev, använder syntetiska anteckningar och raderar eleven i slutet. Ingen feedbackhistorik, SMS eller mejl skapas. Automatiska regressionstester har isolerad testtransport; livekontroller använder inga fixtures eller ersättningssvar.

Källor: [officiell SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript), [modellista](https://platform.claude.com/docs/en/api/models/list), [felhantering](https://platform.claude.com/docs/en/api/errors).

**Inställningar → AI-inställningar** har nu leverantörsval för OpenAI, Claude (Anthropic), Gemini, OpenRouter och en annan OpenAI-kompatibel tjänst. Ange leverantörens egen API-nyckel och exakt modell-ID från dess modellkatalog. Samma spara/testa/byta/radera-flöde gäller alla. Krypterade nycklar hålls åtskilda per leverantör; en gammal OpenAI-nyckel fungerar fortsatt utan manuell migrering. Sparande aktiverar normalt leverantören för feedback. Avmarkera **Använd denna leverantör för feedback** för att bara spara dess nyckel.

Claude använder [Anthropics Messages API](https://platform.claude.com/docs/en/api/overview). Gemini använder [Googles kompatibilitets-API](https://ai.google.dev/gemini-api/docs/openai), och OpenRouter använder [Chat Completions](https://openrouter.ai/docs/api/reference/overview). OpenRouter ger tillgång till flera andra leverantörers modeller via ett konto. Anslutningstest gör ett riktigt textanrop mot just vald tjänst och modell; inga nycklar skickas mellan leverantörer.

För **Annan OpenAI-kompatibel tjänst**, sätt `AI_COMPATIBLE_BASE_URL` på servern till leverantörens dokumenterade HTTPS-basadress (exempelvis en adress som slutar på `/v1`) och starta om. Basadressen är en betrodd serverinställning, aldrig en fritt klientstyrd URL. API:t måste stödja `POST /chat/completions`, Bearer-autentisering, `model`, `messages`, `max_tokens` och ett textresultat i `choices[0].message.content`. Omdirigeringar följs inte. Byter du tjänstens basadress ska du också byta dess nyckel. Stöd för detta protokoll innebär inte universellt stöd för alla agentprodukter, webbprenumerationer, OAuth-tjänster eller special-API:er.

**Diktering är separat:** appens ljudintegration använder fortfarande OpenAI. Du kan exempelvis använda Claude för feedback och en separat OpenAI-nyckel för transkribering. Spara OpenAI-nyckeln med aktiveringsrutan avmarkerad så behålls Claude som textleverantör. Utan ljudnyckel fungerar manuell textinmatning med alla textleverantörer. Transkribering kräver inte att OpenAI är aktiv textleverantör. Ljud skickas till OpenAI; anteckningar skickas till vald textleverantör. Kontrollera databehandlingsvillkoren även för den nya leverantören.

Tester verifierar leverantörsseparation, kryptering, aktivering, borttagning, åtkomstkontroll och adapterformat med mockade svar. Faktiska konton och modellbehörigheter måste verifieras med **Testa anslutning**. Nedanstående äldre OpenAI-anvisningar gäller fortfarande för ljudtjänsten och bakåtkompatibla OpenAI-inställningar.

### Inställningar → AI-inställningar

Du kan nu klistra in en OpenAI-nyckel direkt i appens **Inställningar → AI-inställningar**. Ögonknappen visar enbart texten du själv precis har skrivit; den sparade nyckeln hämtas aldrig till webbläsaren. **Spara API-nyckel** krypterar nyckeln i SQLite med AES-256-GCM, unik slumpmässig IV och organisationsbunden autentiserad metadata. Nyckeln används direkt för både transkribering och feedback, utan omstart.

Konfigurera först en separat krypteringshemlighet på servern. För lokal utveckling, efter att `.env` skapats:

```powershell
node scripts/configure-encryption.mjs
```

Skriptet genererar `SETTINGS_ENCRYPTION_KEY` (32 slumpmässiga byte, 64 hextecken) i den Git-ignorerade `.env`-filen utan att skriva ut den eller byta en befintlig hemlighet. Starta om servern. I drift tillförs samma variabel via plattformens secret manager. Förvara den separat från databasen, skydda filåtkomsten och säkerhetskopiera den separat: förlust eller byte gör sparade nycklar oläsbara. Byt inte hemligheten utan planerad omkryptering eller att ange API-nyckeln igen. Appen stoppar läsning vid manipulerad krypterad data.

**Testa anslutning** gör ett litet Responses-anrop med den inklistrade nyckeln, eller den sparade när fältet är tomt. Det testar autentisering och faktisk åtkomst till textmodellen, kan medföra en liten kostnad och sparar inte testsvaret hos OpenAI (`store:false`). Det verifierar inte transkriberingsmodellens åtkomst; den testas med en riktig inspelning. Framgång visas först efter ett komplett svar. [OpenAI:s felkoder](https://developers.openai.com/api/docs/guides/error-codes) hanteras med generiska svenska fel utan att leverantörens svar eller nycklar skickas till klienten.

Att spara är separat från att testa. En nyckel med korrekt format kan sparas även om den inte är giltig hos OpenAI. För att byta nyckel klistrar du in och sparar en ny. **Ta bort sparad API-nyckel** stänger av appens AI och tar bort krypteringsfälten. Redan startade anrop avbryts inte. Återkalla också nyckeln hos OpenAI om den ska bli oanvändbar överallt; databasbackuper kan innehålla äldre krypterade värden.

Inställningarna kräver samma servervaliderade pilotsession som elevregistret. Spara, ta bort och test kräver korrekt Origin; tester begränsas till fem per minut/IP. Alla med giltig pilotåtkomst kan hantera den gemensamma nyckeln. Inga nycklar sparas i localStorage, återges i API-svar eller loggas av appen. Använd HTTPS vid driftsättning.

En äldre `OPENAI_API_KEY` i miljön fortsätter fungera tills en nyckel sparas eller tas bort i inställningarna. Den krypterade inställningen har företräde. Radering återaktiverar aldrig miljönyckeln. Flytta gärna en gammal miljönyckel till inställningarna och rensa dess gamla miljövariabel; sparande ändrar inte din `.env` automatiskt.

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
