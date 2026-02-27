# Smart Shopping List - Design Document

## Problem
Il ristoratore ha più fornitori con listini diversi. Vuole ordinare i prodotti che gli servono al prezzo migliore possibile, senza dover confrontare manualmente ogni listino.

## Solution
"Lista della Spesa Intelligente" — il ristoratore compila una lista di prodotti, la piattaforma genera ordini ottimizzati suddivisi per fornitore, minimizzando il costo totale.

## User Flow

### Input (3 modalità)
1. **Ricerca manuale** — barra di ricerca con autocomplete, aggiunge prodotto + quantità
2. **Upload CSV** — file con lista prodotti+quantità
3. **Foto/scan OCR** — fotografa foglio cartaceo, OCR estrae prodotti e quantità, utente verifica

### Ottimizzazione
Algoritmo che per ogni prodotto:
1. Trova tutti i fornitori con quel prodotto attivo
2. Assegna al fornitore col prezzo più basso
3. Verifica ordini minimi (sposta prodotti se conviene)
4. Filtra per lead time (se data consegna specificata)
5. Raggruppa per giorni di consegna compatibili

### Riepilogo ("La tua spesa")
Vista unica consolidata:
- Tutte le righe prodotto con fornitore assegnato e prezzo
- Subtotale per fornitore
- Totale complessivo
- Risparmio calcolato (vs prezzo più alto disponibile)
- Esportabile in PDF
- Possibilità di spostare manualmente un prodotto da un fornitore all'altro

### Conferma
Genera ordini draft (uno per fornitore) dal riepilogo.

### Template ricorrenti
- "Salva come template" dopo aver creato una lista
- Pagina template con "Lancia ordine" → ri-ottimizza con prezzi attuali
- Modificabile prima di confermare

## Pages

| Page | Path | Description |
|------|------|-------------|
| Shopping List | `/spesa` | Wizard: input → optimize → summary → confirm |
| My Templates | `/spesa/templates` | Saved templates with "Launch order" |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/shopping-list/optimize` | POST | Products+quantities+date → optimized orders |
| `/shopping-list/from-csv` | POST | Parse CSV shopping list |
| `/shopping-list/from-ocr` | POST | Upload photo → OCR → product list |
| `/shopping-list/templates` | GET | List templates |
| `/shopping-list/templates` | POST | Create template |
| `/shopping-list/templates/:id` | PUT | Update template |
| `/shopping-list/templates/:id` | DELETE | Delete template |
| `/shopping-list/templates/:id/launch` | POST | Launch template → re-optimize |
| `/shopping-list/:id/summary-pdf` | GET | Generate PDF summary |

## DB Schema

### New table: `shopping_templates`
- `id` (uuid, PK)
- `tenantId` (uuid, FK → tenants)
- `name` (text) — e.g., "Ordine settimanale cucina"
- `frequency` (enum: weekly, monthly, custom)
- `items` (JSONB) — `[{productId, quantity}]`
- `createdBy` (uuid, FK → users)
- `createdAt`, `updatedAt` (timestamps)

### Existing tables used (no changes needed)
- `suppliers` — deliveryDays, leadTimeDays, minimumOrderAmount
- `products` — name, category, unit
- `supplier_products` — currentPrice, isActive
- `purchase_orders` + `order_lines` — generated from optimization

## Optimization Algorithm

```
INPUT: items[{productId, quantity}], desiredDeliveryDate?

1. For each item → get all active supplierProducts sorted by price ASC
2. Assign each item to cheapest supplier → build virtual orders per supplier
3. For each virtual order below minimumOrderAmount:
   a. Calculate gap to minimum
   b. Find items assigned to other suppliers that this supplier also sells
   c. If moving an item here costs less than the minimum gap penalty → move it
   d. Otherwise → flag warning "order below minimum"
4. If desiredDeliveryDate set:
   a. Filter out suppliers whose leadTimeDays exceed remaining days
   b. Filter out suppliers who don't deliver on that weekday (deliveryDays)
5. Calculate totals, savings (vs worst-case pricing)

OUTPUT: {
  orders: [{supplierId, items[{productId, quantity, unitPrice, lineTotal}], subtotal, warnings[]}],
  totalAmount, totalSavings, unassignedItems[]
}
```
