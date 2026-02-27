# Central Procurement Hub — Prompt di Sviluppo Completo

---

## Contesto e Obiettivo

Sviluppa **Central Procurement Hub (CPH)**, una piattaforma web professionale e moderna per la gestione centralizzata degli acquisti nella ristorazione organizzata. Il prodotto è destinato a ristoranti medio-grandi (50-500 coperti/giorno), gruppi multi-sede e catene di ristorazione che gestiscono da 10 a 100+ fornitori attivi, migliaia di referenze prodotto e volumi d'ordine significativi.

L'obiettivo primario è **ridurre concretamente i costi di approvvigionamento del 8-15%** e il tempo operativo dedicato agli acquisti del 60-70%, trasformando un processo oggi frammentato (telefonate, WhatsApp, email, carta) in un flusso digitale centralizzato, tracciabile e analizzabile.

Il sistema è progettato con una **filosofia cost-conscious**: si preferiscono soluzioni self-hosted e open-source per tutto ciò che può essere gestito internamente senza compromessi di qualità. Servizi cloud esterni e API di terze parti sono ammessi **esclusivamente dove il rapporto costo/beneficio è nettamente favorevole** — ovvero dove sviluppare internamente costerebbe 10x in più, dove il servizio esterno offre una qualità irreplicabile (es. OCR avanzato su fatture italiane), o dove il costo marginale è trascurabile rispetto al valore generato.

Ogni dipendenza esterna deve essere **sostituibile**: il sistema deve funzionare in modalità degradata se un servizio esterno è temporaneamente non disponibile, e deve essere possibile sostituire qualsiasi provider con un'alternativa (inclusa una soluzione locale) senza riscrivere il modulo.

---

## Filosofia Costi di Produzione

Il costo infrastrutturale target per tenant (singolo ristorante) deve rimanere sotto i **€30-50/mese** tutto incluso. Questo significa:

- **Self-hosted first**: tutto ciò che può girare su un VPS da €20-40/mese (4 vCPU, 8GB RAM, 100GB SSD) ci gira. Database, backend, frontend, worker — tutto su una macchina o un piccolo cluster Docker.
- **Servizi esterni solo a consumo**: nessun abbonamento fisso a servizi cloud costosi. Se si usa un'API esterna (es. OCR), si paga a chiamata e si implementa caching aggressivo per minimizzare le invocazioni.
- **Tier gratuiti prima di tutto**: dove possibile, si sfruttano i free tier generosi dei cloud provider (es. Supabase free tier per auth, Resend free tier per email transazionali, Cloudflare per CDN/DNS).
- **Scala verticale prima che orizzontale**: per un singolo ristorante, un server ben ottimizzato basta. L'architettura multi-tenant permette di servire 10-20 ristoranti sulla stessa infrastruttura, abbattendo il costo per cliente.

**Mappa decisionale servizi esterni vs interni**:

| Funzionalità | Scelta raccomandata | Motivazione |
|---|---|---|
| Database | PostgreSQL self-hosted (o Supabase) | Costo zero, performance totale, dati sotto controllo |
| OCR Fatture | Google Document AI / AWS Textract (pay-per-use) con fallback Tesseract locale | Le fatture italiane hanno layout complessi; Tesseract da solo ha accuracy ~70%, i servizi cloud ~95%+. A ~€0.01-0.05/pagina, 200 fatture/mese = €2-10/mese. Il valore del tempo risparmiato nella correzione manuale giustifica ampiamente il costo |
| Email transazionali | Resend (free tier 3.000 email/mese) o SMTP diretto | Per la maggior parte dei ristoranti il free tier basta. Oltre, si parla di €10-20/mese |
| File storage | Filesystem locale o Cloudflare R2 (10GB free, poi ~€0.015/GB) | Per documenti e fatture, i volumi sono minimi |
| Autenticazione | Implementazione interna JWT oppure Supabase Auth (free tier) | Auth non è un differenziatore, meglio non reinventarla se il budget lo permette |
| Hosting/CDN | Cloudflare Pages (free) per frontend statico + VPS per backend | Il frontend è statico, servirlo via CDN è gratis e performante |
| Notifiche push | Web Push API nativa (gratuita) | Nessun costo, supportata da tutti i browser moderni |
| PDF generation | Server-side con Puppeteer o @react-pdf (locale) | Nessun motivo di pagare per questo |
| Analytics/charts | Recharts o D3.js (frontend, locale) | Nessun costo, pieno controllo |

---

## Architettura Tecnica

### Stack Consigliato

- **Frontend**: React 18+ con TypeScript, TailwindCSS, Framer Motion per le animazioni, Recharts o D3.js per la data visualization. Design system proprietario con componenti riutilizzabili. Servito come static build via Cloudflare Pages (gratuito, CDN globale, deploy automatico da Git).
- **Backend**: Node.js con Fastify oppure Python con FastAPI. Architettura modulare a servizi interni (non microservizi distribuiti, ma moduli ben separati). Deploy su VPS con Docker.
- **Database**: PostgreSQL 16+ come database primario (self-hosted su VPS, oppure Supabase per semplificare auth + realtime + backup automatici). Schema relazionale rigoroso con vincoli di integrità, indici ottimizzati, viste materializzate per i report.
- **OCR Fatture**: Architettura a due livelli — **Tesseract OCR locale** come primo passaggio (gratuito), con escalation automatica a **Google Document AI o AWS Textract** solo per fatture che Tesseract non riesce a parsare con confidence sufficiente (soglia configurabile). Questo approccio ibrido minimizza i costi cloud mantenendo alta l'accuracy.
- **Email**: Resend per email transazionali (free tier 3.000/mese, poi pay-as-you-go) oppure SMTP diretto configurabile. Ricezione fatture via casella email dedicata con parsing automatico (IMAP polling).
- **File Storage**: Filesystem locale per installazioni singole. Cloudflare R2 per installazioni multi-sede o SaaS (10GB free, poi costi trascurabili, compatibile S3).
- **Autenticazione**: JWT con refresh token + RBAC granulare. Implementazione interna oppure Supabase Auth (se si usa Supabase come DB).
- **Background Jobs**: BullMQ (Node.js) o Celery (Python) con Redis come broker. Per operazioni pesanti: generazione report, parsing fatture, calcolo analytics, invio email batch.
- **Deploy**: Docker Compose per ambiente completo (app + db + redis + worker + reverse proxy Caddy). Compatibile con qualsiasi VPS (Hetzner, Contabo, OVH — da €5-20/mese per specifiche adeguate) o server dedicato.

### Stima Costi Infrastruttura per Singolo Ristorante

| Componente | Costo mensile stimato |
|---|---|
| VPS (4 vCPU, 8GB RAM, 80GB SSD — Hetzner) | €15-20 |
| Cloudflare (Pages + CDN + DNS + R2 free tier) | €0 |
| Email transazionali (Resend free tier) | €0 |
| OCR cloud (~100-200 fatture/mese) | €2-10 |
| Dominio | ~€1 (ammortizzato) |
| **TOTALE** | **€18-31/mese** |

Per un'installazione multi-tenant (10 ristoranti su stessa infrastruttura): VPS più potente (~€40-60), costo per cliente ~€6-10/mese.

### Principi Architetturali

- Ogni operazione critica (ordine, approvazione, modifica listino) deve essere **immutabile e tracciata** con audit log completo (chi, cosa, quando, da dove).
- Il sistema deve funzionare **offline-resilient**: se la connessione cade durante la compilazione di un ordine, nessun dato viene perso. Coda locale nel browser con sync automatico al ripristino della connessione.
- Le operazioni pesanti (generazione report, parsing fatture, calcolo analytics) girano come **background jobs** con coda interna, senza bloccare l'interfaccia utente.
- Il sistema deve supportare **multi-tenant** nativamente per gestire gruppi con più sedi da un'unica installazione.
- **Graceful degradation**: se un servizio esterno (OCR cloud, email provider) è down, il sistema continua a funzionare con fallback locale. L'utente riceve una notifica ma non è mai bloccato.
- **Vendor lock-in zero**: ogni servizio esterno è wrappato in un'interfaccia interna (adapter pattern). Cambiare provider = cambiare un file di configurazione, non riscrivere codice.

---

## Moduli Funzionali — Specifiche Dettagliate

### MODULO 1 — Anagrafica Fornitori

**Scopo**: Registro centrale di tutti i fornitori con informazioni contrattuali, documentali e di performance.

**Funzionalità**:
- Scheda fornitore completa: ragione sociale, P.IVA, contatti operativi (chi risponde per gli ordini, chi per la contabilità, chi per le emergenze), indirizzi di consegna, modalità di pagamento concordate, giorni e orari di consegna, lead time standard, ordine minimo.
- Upload e archiviazione documenti: contratti, certificazioni (HACCP, BIO, DOP), DURC, visura camerale, con date di scadenza e alert automatici.
- **Scoring fornitore automatico** calcolato su dati reali: puntualità consegne (% ordini consegnati entro la finestra concordata), conformità merce (% ricezioni senza non conformità), competitività prezzo (variazione rispetto alla media di mercato interna), affidabilità (% ordini confermati senza modifiche unilaterali).
- Storico completo di tutte le transazioni, non conformità, variazioni listino.
- Categorizzazione fornitori per tipologia merceologica (ortofrutta, ittico, carni, beverage, secco, non-food, etc.).
- **Mappa fornitori alternativi**: per ogni categoria merceologica, il sistema mostra quanti fornitori attivi ci sono e segnala le categorie a rischio (un solo fornitore = single point of failure).

**Dati che il ristoratore inserisce**: tutto manualmente all'inizio, poi il sistema si auto-alimenta con i dati delle transazioni.

---

### MODULO 2 — Catalogo Prodotti e Listini

**Scopo**: Database unificato di tutti i prodotti acquistabili, con prezzi aggiornati per fornitore.

**Funzionalità**:
- Catalogo prodotti con: nome, categoria, unità di misura (kg, lt, pz, cartone), grammatura/formato, codice interno, codice fornitore, allergeni associati, flag BIO/DOP/IGP.
- **Gestione multi-fornitore per prodotto**: lo stesso prodotto (es. "Mozzarella di bufala DOP 250g") può avere più fornitori con prezzi diversi. Il sistema mostra sempre il confronto immediato.
- Listini fornitore con: prezzo unitario, data validità (da/a), scaglioni quantità (se presenti), promozioni temporanee. Upload listini via **import CSV/Excel** con mapping colonne configurabile.
- **Storico prezzi completo** per ogni prodotto/fornitore con grafico temporale. Il ristoratore vede immediatamente se un prezzo è salito e di quanto.
- Alert automatici: quando un fornitore aggiorna un listino e un prezzo aumenta oltre una soglia configurabile (es. +5%), il sistema genera una notifica al responsabile acquisti.
- **Comparatore prezzi integrato**: selezionando un prodotto, il sistema mostra tutti i fornitori disponibili ordinati per prezzo, con indicazione di lead time e affidabilità. Il ristoratore sceglie con dati alla mano, non a memoria.

---

### MODULO 3 — Ordini di Acquisto

**Scopo**: Creazione, gestione e tracciamento degli ordini fornitori in un flusso strutturato.

**Funzionalità**:
- **Creazione ordine rapida**: il responsabile acquisti seleziona il fornitore, aggiunge prodotti dal catalogo (con ricerca, filtri, preferiti), imposta quantità. Il sistema pre-compila i prezzi dal listino attivo e calcola il totale in tempo reale.
- **Ordine suggerito automatico**: basato su consumo storico (media mobile ultimi N servizi), giacenze dichiarate, e prenotazioni confermate per i prossimi giorni. Il sistema propone una bozza d'ordine che il responsabile può validare, modificare e inviare. Non è AI, è calcolo deterministico su dati reali.
- **Workflow di approvazione configurabile**: per ordini sopra una certa soglia (es. €500), il sistema richiede l'approvazione del titolare o del direttore prima dell'invio. Notifica via email + notifica in-app.
- **Invio ordine multicanale**: generazione PDF professionale con logo del ristorante, dettaglio prodotti, prezzi, condizioni di consegna. Invio automatico via email al contatto ordini del fornitore. Possibilità di generare il PDF per invio manuale (WhatsApp, stampa).
- **Stati ordine tracciati**: Bozza → In approvazione → Inviato → Confermato dal fornitore → In consegna → Ricevuto (parziale/totale) → Chiuso. Ogni passaggio di stato è loggato con timestamp e utente.
- **Ordini ricorrenti**: possibilità di creare template d'ordine (es. "Ordine settimanale ortofrutta") riutilizzabili con un click, modificabili prima dell'invio.
- **Gestione urgenze**: flag "ordine urgente" con notifica prioritaria e tracciamento separato.

---

### MODULO 4 — Ricezione Merce e Controllo Qualità

**Scopo**: Registrazione strutturata di ogni consegna con verifica contro l'ordine originale.

**Funzionalità**:
- Interfaccia tablet-friendly per il magazziniere/chef che riceve la merce.
- Visualizzazione dell'ordine atteso con checklist prodotti. Per ogni riga: quantità ordinata, quantità ricevuta, flag conformità (OK / Non conforme).
- **Registrazione non conformità** con categorizzazione: quantità errata, prodotto sbagliato, temperatura non conforme, qualità sotto standard, imballo danneggiato, prodotto scaduto/prossimo a scadenza. Campo note libero + possibilità di allegare foto.
- Registrazione temperature per prodotti deperibili (campo numerico con range di accettabilità configurabile per categoria).
- **Generazione automatica del documento di ricezione** (DDT digitale) con firma operatore (firma su schermo tablet).
- Aggiornamento automatico delle giacenze a sistema.
- **Discrepanze ordine vs ricezione**: il sistema calcola automaticamente le differenze e le presenta in un report. Se la discrepanza supera una soglia (es. >3% del valore ordine), genera un alert al responsabile acquisti.
- Storico ricezioni consultabile per fornitore, per prodotto, per data.

---

### MODULO 5 — Riconciliazione Fatture

**Scopo**: Abbinamento automatico fatture fornitori agli ordini e alle bolle di ricezione per identificare errori e discrepanze.

**Funzionalità**:
- **Caricamento fatture**: upload manuale (PDF, immagine) oppure ricezione automatica via casella email dedicata (es. fatture@mioristorante.it).
- **OCR ibrido a due livelli**: il sistema tenta prima il parsing con Tesseract locale (gratuito). Se il confidence score è sotto soglia (configurabile, default 85%), escala automaticamente a Google Document AI o AWS Textract. L'operatore vede un indicatore di affidabilità per ogni campo estratto. Questo approccio tiene i costi OCR cloud sotto €10/mese anche per ristoranti con alto volume di fatture.
- L'operatore verifica i dati estratti e li conferma/corregge (l'OCR non è perfetto, l'interfaccia deve rendere la correzione rapidissima).
- **Matching a tre vie**: il sistema confronta automaticamente Ordine ↔ Bolla di Ricezione ↔ Fattura. Per ogni riga evidenzia: prezzo fatturato vs prezzo concordato, quantità fatturata vs quantità ricevuta, prodotti fatturati non presenti nell'ordine.
- **Classificazione discrepanze**: il sistema categorizza ogni anomalia (sovrapprezzo, quantità maggiorata, prodotto non ordinato, IVA errata) e calcola l'impatto economico.
- **Report discrepanze mensile per fornitore**: quanto denaro è stato fatturato in eccesso, quante fatture presentavano errori, trend nel tempo. Questo è il report che il ristoratore porta al tavolo quando rinegozia i contratti.
- Stato fattura: Da verificare → Verificata conforme → Contestata → Approvata per pagamento → Pagata.
- **Scadenzario pagamenti** con vista calendario e alert per scadenze imminenti.

---

### MODULO 6 — Analytics e Intelligence

**Scopo**: Trasformare i dati operativi in insight azionabili per ridurre i costi e ottimizzare gli acquisti.

**Dashboard principali**:

**6.1 — Spending Overview**
- Spesa totale per periodo (giorno, settimana, mese, trimestre, anno) con confronto periodo precedente e stesso periodo anno precedente.
- Breakdown per categoria merceologica (grafico a torta/barre).
- Breakdown per fornitore (top 10 fornitori per volume spesa).
- Trend spesa mensile con linea di tendenza.

**6.2 — Price Watch**
- Variazione prezzi per prodotto nel tempo (line chart).
- Alert prodotti con aumenti anomali.
- **Indice di prezzo interno**: media ponderata dei prezzi delle principali categorie, tracciata nel tempo. Permette al ristoratore di capire se la sua spesa materie prime sta salendo più dell'inflazione settoriale.
- Confronto prezzo medio pagato vs miglior prezzo disponibile (tra i propri fornitori): calcola il **risparmio potenziale** se si fosse sempre scelto il fornitore più economico.

**6.3 — Supplier Scorecard**
- Dashboard per singolo fornitore con tutti i KPI: puntualità, conformità, competitività prezzo, volume, trend.
- Ranking fornitori per categoria.
- Segnalazione fornitori critici (score sotto soglia).

**6.4 — Waste & Efficiency**
- Discrepanze ordine vs ricezione aggregate (quanto prodotto manca o arriva in eccesso).
- Discrepanze fattura vs ordine aggregate (quanto si paga in più del concordato).
- **Savings tracker**: il sistema calcola mensilmente quanto denaro il ristoratore ha risparmiato grazie alla piattaforma (contestazioni fatture risolte, switch fornitore su prezzo migliore, riduzione sprechi da ordini più precisi).

**6.5 — Forecasting (Deterministico)**
- Previsione fabbisogno settimanale per prodotto basata su: media mobile consumo, stagionalità (stesso periodo anno precedente), prenotazioni confermate. Nessun modello ML, solo calcolo statistico trasparente e verificabile.

---

### MODULO 7 — Reportistica e Export

**Scopo**: Generazione documenti professionali per uso interno, negoziazioni e compliance.

**Report disponibili**:
- Report acquisti mensile (PDF professionale con grafici).
- Scheda fornitore con scorecard (PDF esportabile per riunioni di review).
- Report non conformità per periodo/fornitore.
- Report discrepanze fatture con calcolo impatto economico.
- Export completo dati in CSV/Excel per integrazione con software contabile esterno.
- Registro ricezioni per compliance HACCP (PDF con firme e timestamp).

Ogni report è generato server-side come background job e reso disponibile per download. I report più usati sono schedulabili (es. "inviami il report spesa ogni lunedì mattina via email").

---

## Design e UX — Requisiti

### Filosofia di Design
L'interfaccia deve comunicare **controllo, precisione e professionalità**. Il ristoratore deve percepire immediatamente che sta usando uno strumento che gli fa risparmiare soldi. Ogni schermata deve rispondere alla domanda: "cosa devo fare adesso?" e "quanto sto spendendo?".

### Requisiti Specifici
- **Design system coerente**: palette colori professionale (suggerimento: base scura con accenti in verde/ambra per comunicare "soldi" e "attenzione"), tipografia leggibile, spaziatura generosa, gerarchia visiva chiara.
- **Dashboard come prima schermata**: il ristoratore apre l'app e vede immediatamente: spesa del mese vs budget, ordini in corso, alert attivi, azioni richieste (ordini da approvare, fatture da verificare, documenti in scadenza).
- **Interfaccia adattiva**: desktop per il back-office (schermi larghi, tabelle dense di dati), tablet per la ricezione merce (bottoni grandi, flusso lineare, touch-friendly).
- **Micro-interazioni significative**: animazioni che comunicano stato (ordine inviato con successo, alert prezzo, non conformità registrata). Non decorative, funzionali.
- **Zero training**: un responsabile acquisti con esperienza deve poter usare il sistema produttivamente entro 30 minuti senza formazione. Flussi auto-esplicativi, tooltip contestuali, onboarding guidato al primo accesso.
- **Velocità percepita**: nessuna schermata deve impiegare più di 200ms per il rendering. Skeleton loading, ottimistic UI updates, prefetching dei dati prevedibili.
- **Modalità notturna nativa**: molti ristoratori lavorano la sera/notte. Dark mode non è un nice-to-have, è un requisito.

---

## Ruoli e Permessi (RBAC)

| Ruolo | Descrizione | Permessi chiave |
|---|---|---|
| **Owner** | Titolare / Amministratore | Accesso completo. Configurazione sistema, gestione utenti, approvazione ordini sopra soglia, visualizzazione analytics completi, export dati. |
| **Purchase Manager** | Responsabile Acquisti | Gestione fornitori e catalogo, creazione e invio ordini, riconciliazione fatture, analytics acquisti. |
| **Chef / Kitchen Manager** | Chef o Responsabile Cucina | Visualizzazione catalogo e prezzi, richiesta ordini (soggetti ad approvazione), registrazione ricezione merce, segnalazione non conformità. |
| **Receiver** | Magazziniere / Addetto Ricezione | Solo modulo ricezione merce: checklist consegne, registrazione non conformità, conferma ricezione. |
| **Accountant** | Contabilità / Controller | Modulo fatture, riconciliazione, scadenzario pagamenti, export dati contabili. |
| **Viewer** | Consulente / Socio | Sola lettura su dashboard e report. Nessuna operazione. |

Ogni ruolo è configurabile con permessi granulari. Il sistema supporta utenti multi-sede con visibilità limitata alla propria sede o aggregata su tutte.

---

## Struttura Database — Schema Concettuale

### Entità Principali
- `tenants` — Organizzazioni (ristoranti/gruppi)
- `locations` — Sedi operative per tenant
- `users` — Utenti con ruolo e sede di appartenenza
- `suppliers` — Fornitori con dati anagrafici e contrattuali
- `supplier_contacts` — Contatti multipli per fornitore (ordini, contabilità, emergenze)
- `supplier_documents` — Documenti caricati con scadenze
- `products` — Catalogo prodotti unificato
- `supplier_products` — Relazione prodotto-fornitore con prezzo e condizioni
- `price_history` — Storico variazioni prezzo (immutabile, append-only)
- `purchase_orders` — Ordini di acquisto con stato e workflow
- `order_lines` — Righe ordine con prodotto, quantità, prezzo
- `receivings` — Registrazioni ricezione merce
- `receiving_lines` — Righe ricezione con quantità e conformità
- `non_conformities` — Non conformità con tipo, note, foto
- `invoices` — Fatture fornitori con dati estratti
- `invoice_lines` — Righe fattura
- `reconciliations` — Risultati matching ordine/ricezione/fattura
- `audit_log` — Log immutabile di tutte le operazioni
- `notifications` — Notifiche e alert generati dal sistema
- `report_jobs` — Coda generazione report asincroni

Tutte le tabelle transazionali usano **soft delete** (campo `deleted_at`) e mantengono l'intero storico. Nessun dato viene mai cancellato fisicamente.

---

## Metriche di Successo del Prodotto

Il sistema deve dimostrare il proprio valore con dati concreti. Le metriche chiave da tracciare e mostrare al ristoratore sono:

| Metrica | Target | Come si misura |
|---|---|---|
| Riduzione tempo ordini | -60% | Tempo medio da creazione a invio ordine |
| Discrepanze fatture identificate | 100% cattura | € discrepanze trovate / € totale fatturato |
| Risparmio da comparazione prezzi | 5-10% | Differenza tra prezzo pagato e miglior prezzo disponibile |
| Non conformità tracciate | 100% | % consegne con registrazione completa |
| Riduzione sprechi da sovra-ordine | -20% | Confronto quantità ordinate vs consumate |
| Tempo riconciliazione fatture | -70% | Tempo medio per fattura riconciliata |

Queste metriche alimentano un **"Savings Dashboard"** visibile all'owner: una schermata dedicata che mostra in euro quanto il sistema ha fatto risparmiare nel mese/trimestre/anno.

---

## Vincoli e Requisiti Non Funzionali

- **Performance**: tempo di risposta API < 100ms per operazioni CRUD standard, < 2s per query analitiche complesse.
- **Sicurezza**: HTTPS obbligatorio, password hashate con bcrypt/argon2, rate limiting su tutti gli endpoint, input sanitization, protezione CSRF/XSS, backup database automatico giornaliero.
- **Privacy**: conforme GDPR. I dati rimangono sull'infrastruttura controllata dal cliente (VPS europeo o server dedicato). I servizi cloud esterni utilizzati (OCR, email) processano dati in transito ma non li conservano. Verificare DPA (Data Processing Agreement) con ogni provider esterno.
- **Costi operativi**: il costo infrastrutturale mensile per singolo tenant non deve superare €30-50. Ogni servizio esterno a pagamento deve avere un fallback gratuito/locale. Il sistema deve monitorare e reportare i propri costi cloud (numero chiamate OCR, email inviate, storage utilizzato).
- **Scalabilità**: il sistema deve gestire senza degrado fino a 100 fornitori attivi, 5.000 referenze prodotto, 50.000 ordini/anno, 10 utenti concorrenti per sede.
- **Affidabilità**: nessuna perdita dati in caso di crash. Transazioni database ACID. Retry automatico per invio email fallito.
- **Manutenibilità**: codice documentato, test unitari sui moduli critici (calcolo prezzi, riconciliazione, scoring), migration database versionato.
- **Localizzazione**: interfaccia in italiano come lingua primaria. Formattazione date (DD/MM/YYYY), numeri (1.234,56 €), e unità di misura italiane. Predisposto per localizzazione multilingua futura.

---

## Roadmap di Sviluppo Suggerita

### Fase 1 — MVP Core (8-10 settimane)
Anagrafica fornitori, catalogo prodotti con listini, creazione e invio ordini (PDF + email), dashboard spesa base. Sufficiente per sostituire il processo manuale e dimostrare valore immediato.

### Fase 2 — Controllo (4-6 settimane)
Modulo ricezione merce con non conformità, riconciliazione fatture con OCR, scoring fornitore automatico.

### Fase 3 — Intelligence (4-6 settimane)
Analytics avanzati, comparatore prezzi, ordini suggeriti, report professionali, savings dashboard.

### Fase 4 — Scale (4 settimane)
Multi-sede, multi-tenant, workflow approvazione avanzato, schedulazione report, API interna per future integrazioni.

---

*Questo documento costituisce il brief completo per lo sviluppo della piattaforma. Ogni modulo è progettato per generare valore misurabile dal primo giorno di utilizzo. Il ristoratore non sta comprando software: sta comprando margine.*
